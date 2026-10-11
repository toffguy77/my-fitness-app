package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/burcev/api/internal/app"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/router"
	"github.com/burcev/api/internal/shared/curatoraccess"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/telemetry"
	"github.com/burcev/api/internal/shared/testaccounts"
	"github.com/burcev/api/migrations"
	"github.com/gin-gonic/gin"
)

// describeDSN pulls the host and database name out of a connection string,
// without the credentials in it.
//
// Ошибку разбора не возвращаем: подключение к этому моменту уже состоялось, и
// нечитаемый DSN — повод сказать «не разобрал», а не повод молчать или падать.
func describeDSN(dsn string) (host, database string) {
	parsed, err := url.Parse(dsn)
	if err != nil || parsed.Host == "" {
		return "(не разобрал строку подключения)", "(не разобрал строку подключения)"
	}
	return parsed.Host, strings.TrimPrefix(parsed.Path, "/")
}

func main() {
	// Initialize logger
	log := logger.New()
	defer func() { _ = log.Sync() }()

	// Load configuration. validate() joins every problem it finds, so unwrap
	// and print one line each — an operator fixing a broken environment should
	// see the whole list, not discover it one deploy at a time.
	cfg, err := config.Load()
	if err != nil {
		if joined, ok := err.(interface{ Unwrap() []error }); ok {
			for _, problem := range joined.Unwrap() {
				log.Error("Configuration problem", "error", problem)
			}
		}
		log.Fatal("Failed to load configuration", "error", err)
	}

	if cfg.JWTSecretIsUnsafe() {
		log.Warn("JWT_SECRET is unsafe (placeholder or shorter than 32 bytes). "+
			"This is fatal in production; set a random secret.", "env", cfg.Env)
	}

	// Initialize database
	//
	// Куда подключились на самом деле — отдельно от того, что лежит в
	// переменных: при заданном DATABASE_URL разрозненные DB_* не участвуют, а
	// журнал печатал именно их. Строка «подключено к web-app-db на продовом
	// хосте» при подключении к localhost — это не мелочь: ровно по такой
	// строке и идут, когда разбирают инцидент в три часа ночи.
	var db *database.DB
	connectedHost, connectedName := cfg.DatabaseHost, cfg.DatabaseName
	if cfg.DatabaseURL != "" {
		connectedHost, connectedName = describeDSN(cfg.DatabaseURL)
		db, err = database.NewPostgresFromURL(cfg.DatabaseURL, cfg.MaxOpenConns, cfg.MaxIdleConns)
	} else {
		db, err = database.NewPostgres(database.PostgresConfig{
			Host:         cfg.DatabaseHost,
			Port:         cfg.DatabasePort,
			Database:     cfg.DatabaseName,
			User:         cfg.DatabaseUser,
			Password:     cfg.DatabasePassword,
			SSLMode:      cfg.DatabaseSSLMode,
			MaxOpenConns: cfg.MaxOpenConns,
			MaxIdleConns: cfg.MaxIdleConns,
		})
	}
	if err != nil {
		log.Fatal("Failed to connect to database", "error", err)
	}
	defer func() { _ = db.Close() }()

	log.Info("Database connected successfully",
		"host", connectedHost,
		"database", connectedName,
		"max_open_conns", cfg.MaxOpenConns,
	)

	// Run database migrations
	migrator := database.NewMigrator(db, migrations.FS, log)
	if err := migrator.Run(context.Background(), cfg.MigrationBaseline); err != nil {
		log.Fatal("Database migration failed", "error", err)
	}

	// Служебный куратор, за которым числится живой человек, — это клиент,
	// закреплённый за учёткой, которая никогда не ответит. 23 сентября на
	// проде два из трёх кандидатов с нулём клиентов были служебными, то есть
	// первыми в очереди на следующего пришедшего.
	//
	// Назначение такую пару больше не создаёт, но создать её можно иначе:
	// правкой в базе, переносом клиента, строкой с прежних времён. Поэтому
	// смотрим на то, что в таблице на самом деле.
	//
	// Предупреждение, а не отказ: забытая связка, роняющая прод при запуске,
	// хуже того, от чего мы защищаемся. Сама по себе служебная учётка с
	// ролью поводом не считается — на проде они живут по решению владельца,
	// и крик о них при каждом запуске никто бы не читал.
	if cfg.IsProduction() {
		if serving, err := testaccounts.ServingRealClients(context.Background(), db.DB); err != nil {
			log.Warn("Не удалось проверить служебных кураторов", "error", err)
		} else if len(serving) > 0 {
			log.Warn("За служебными учётками числятся живые клиенты — "+
				"переназначьте их на настоящего куратора", "curators", serving)
		}
	}

	// Права, оставшиеся действующими при истёкшей дате, — след несработавшего
	// прекращения. Смотрим во всех средах, а не только в проде: на стенде это
	// признак того, что задача не зарегистрирована или падает, и узнать об этом
	// до прода дешевле.
	//
	// Предупреждение, а не отказ: доступ, отданный на день дольше, хуже не
	// становится от того, что прод не поднялся.
	if overdue, err := curatoraccess.Overdue(context.Background(), db.DB, curatoraccess.Today()); err != nil {
		log.Warn("Не удалось проверить просроченные права на куратора", "error", err)
	} else if overdue > 0 {
		log.Warn("Права на куратора с истёкшей датой всё ещё действуют — "+
			"задача curator.expire-access не сработала", "count", overdue)
	}

	ext, err := app.NewExternal(cfg, log)
	if err != nil {
		log.Fatal("Failed to initialize external clients", "error", err)
	}

	// Set Gin mode
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Error reporting, if there is somewhere to report to.
	reportingOn, err := telemetry.StartErrorReporting(cfg.SentryDSN, cfg.Version, cfg.Env)
	if err != nil {
		log.Warn("Error reporting could not be started; continuing without it", "error", err)
	} else if reportingOn {
		log.Info("Error reporting enabled", "release", cfg.Version)
		defer telemetry.FlushErrors()
	} else {
		log.Warn("Error reporting is off — SENTRY_DSN is not set")
	}

	// Tracing, if there is a collector to send it to. Absent, the application
	// runs exactly as before and says so once — the same rule as every other
	// optional capability here.
	tracingOn, stopTracing, err := telemetry.StartTracing(
		context.Background(), cfg.OTLPEndpoint, "burcev-api", cfg.Version, cfg.Env)
	// Признак ставится по тому, что вышло, а не по тому, что задали: см.
	// config.deriveFeatures, где он намеренно выключен по умолчанию.
	cfg.Features.Tracing = tracingOn
	if err != nil {
		log.Warn("Tracing could not be started; continuing without it", "error", err)
	} else if tracingOn {
		log.Info("Tracing enabled",
			"endpoint", cfg.OTLPEndpoint,
			"success_sample_ratio", telemetry.DefaultSuccessRatio)
		defer func() {
			if err := stopTracing(context.Background()); err != nil {
				log.Warn("Failed to flush traces on shutdown", "error", err)
			}
		}()
	} else {
		log.Warn("Tracing is off — OTEL_EXPORTER_OTLP_ENDPOINT is not set")
	}

	// Сводка выключенного — после запуска трассировки, а не до.
	//
	// Признак трассировки ставится по тому, что вышло, а не по тому, что
	// задали (config.deriveFeatures), и до StartTracing он выключен всегда.
	// Напечатанная раньше, сводка называла выключенной возможность, которая
	// через полсекунды работала, — и приучала не читать строку целиком.
	if disabled := cfg.Features.Disabled(); len(disabled) > 0 {
		log.Warn("Optional capabilities are disabled — the credentials for them are not set",
			"disabled", disabled)
	}

	// Services, handlers and jobs. Assembled in internal/app so that a test
	// can build the same router this process serves.
	application := app.Build(cfg, db, log, ext)
	scheduler := application.Scheduler

	// The domain counters were declared and never incremented; installing the
	// recorder is what lets the services reach them without threading a
	// metrics handle through every constructor.
	telemetry.SetDefault(application.Metrics)

	// База — условие работы, а не возможность: за ней следим отдельно и часто.
	// Без этого её отказ остаётся единственным, о котором никто не узнаёт.
	go database.Watch(context.Background(), db, log)

	// Routing lives in internal/router, one file per domain.
	router := router.New(application.Deps)

	schedulerCtx, schedulerCancel := context.WithCancel(context.Background())
	schedulerDone := make(chan struct{})
	go func() {
		defer close(schedulerDone)
		scheduler.Run(schedulerCtx)
	}()

	// Create HTTP server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Info("Starting server", "port", cfg.Port, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Failed to start server", "error", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down server...")

	// Stop scheduling and let any in-flight job finish, so a run cannot be left
	// recorded as "running" forever or interrupted half-written.
	schedulerCancel()
	select {
	case <-schedulerDone:
	case <-time.After(30 * time.Second):
		log.Warn("Timed out waiting for background jobs to finish")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown", "error", err)
	}

	log.Info("Server exited")
}
