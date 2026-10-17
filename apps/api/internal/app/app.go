// Package app assembles the services, handlers and background jobs of the API.
//
// It used to be the body of cmd/server/main.go. It lives here so that a test
// can build the very router production serves — a router assembled separately
// in a test drifts from main() at the first edit, and the test then checks its
// own copy.
//
// What stays in main(): configuration, the database connection and
// migrations, start-up warnings, process-wide telemetry, and running the
// server and the scheduler.
package app

import (
	"context"
	"fmt"
	"time"

	"github.com/burcev/api/internal/capabilities"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/jobsetup"
	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/modules/admin"
	"github.com/burcev/api/internal/modules/analytics"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/modules/chat"
	"github.com/burcev/api/internal/modules/content"
	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/modules/dashboard"
	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/modules/leads"
	"github.com/burcev/api/internal/modules/logs"
	"github.com/burcev/api/internal/modules/mealplan"
	"github.com/burcev/api/internal/modules/metrika"
	"github.com/burcev/api/internal/modules/notifications"
	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
	"github.com/burcev/api/internal/modules/recipes"
	"github.com/burcev/api/internal/modules/support"
	"github.com/burcev/api/internal/modules/supportbridge"
	"github.com/burcev/api/internal/modules/telegramlink"
	"github.com/burcev/api/internal/modules/users"
	"github.com/burcev/api/internal/router"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/jobs"
	"github.com/burcev/api/internal/shared/llm"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/burcev/api/internal/shared/telegram"
	"github.com/burcev/api/internal/shared/telemetry"
	"github.com/burcev/api/internal/shared/ws"
)

// App is what Build assembles.
type App struct {
	// Deps is handed to router.New.
	Deps router.Deps
	// Scheduler runs the periodic jobs; the caller decides whether to start it.
	Scheduler *jobs.Scheduler
	// Metrics is the recorder the router instruments with. Installing it as
	// the process-wide default is the caller's decision.
	Metrics *telemetry.Metrics
}

// Build wires every service and handler. It writes to the database once —
// EnsureConversationsExist — and starts neither the HTTP server nor the
// scheduler: that is the caller's decision.
func Build(cfg *config.Config, db *database.DB, log *logger.Logger, ext External) *App {
	emailService := ext.Email
	s3Client := ext.WeeklyPhotos
	profilePhotosS3 := ext.ProfilePhotos
	chatS3 := ext.Chat
	contentS3 := ext.Content
	dataExportsS3 := ext.DataExports
	foodPhotosS3 := ext.FoodPhotos
	orClient := ext.Vision

	// Initialize rate limiter (DB-backed, for password reset)
	rateLimiter := middleware.NewRateLimiter(db.DB, log)

	// Initialize auth rate limiter (in-memory sliding window, for login/register)
	authRateLimiter := middleware.NewAuthRateLimiter()

	// Initialize reset service
	resetService := auth.NewResetService(db.DB, cfg, log, emailService, rateLimiter)

	// WebSocket hub, shared between the REST chat handler and the WS endpoint.
	wsHub := ws.NewHub()

	// Ensure conversations exist for all active curator-client relationships.
	chatService := chat.NewService(db, log)
	// Первое сообщение куратору — серверный факт: служба чата знает, кто в
	// переписке клиент, а обработчик знает только «другого участника».
	// Подключается ниже, когда служба аналитики уже создана.
	adminService := admin.NewService(db, log)
	telegramLinkHandler := telegramlink.NewHandler(telegramlink.NewService(db.DB), log, cfg.TelegramBotUsername)
	if err := chatService.EnsureConversationsExist(context.Background()); err != nil {
		log.Error("Failed to ensure conversations exist", "error", err)
	}

	// Services shared by more than one handler.
	nutritionCalcSvc := nutritioncalc.NewService(db, log)
	notificationsSvc := notifications.NewService(db, log)
	if cfg.NotificationEmailDelay > 0 {
		notificationsSvc.WithEmailDelay(cfg.NotificationEmailDelay)
	}
	notificationsSvc.WithPush(notifications.PushConfig{
		PublicKey:  cfg.VAPIDPublicKey,
		PrivateKey: cfg.VAPIDPrivateKey,
		Subject:    cfg.VAPIDSubject,
	})
	// Уведомления на iPhone. Ключ, который не разбирается, — ошибка
	// настройки: говорим громко, а не делаем вид, что канал работает.
	if cfg.Features.IOSPush {
		if err := notificationsSvc.WithAPNS(notifications.APNSConfig{
			KeyID:      cfg.APNSKeyID,
			TeamID:     cfg.APNSTeamID,
			PrivateKey: cfg.APNSPrivateKey,
			Topic:      cfg.APNSTopic,
		}); err != nil {
			log.Error("iOS push is configured but the key is unusable", "error", err)
			cfg.Features.IOSPush = false
		}
	}
	// The digest needs a way to send and a secret to sign unsubscribe links
	// with. Without SMTP it is simply not wired, and the job says so.
	if emailService != nil {
		notificationsSvc.WithDigest(
			func(ctx context.Context, to, name, language string, items []notifications.DigestItem, unsubscribeURL string) error {
				data := email.DigestEmailData{
					UserEmail:      to,
					Name:           name,
					Language:       language,
					AppURL:         appOrigin(cfg.AppDomain),
					UnsubscribeURL: unsubscribeURL,
				}
				for _, item := range items {
					data.Items = append(data.Items, email.DigestItemData{
						Title:     item.Title,
						Content:   item.Content,
						ActionURL: item.ActionURL,
						CreatedAt: item.CreatedAt,
					})
				}
				return emailService.SendNotificationDigest(ctx, data)
			},
			cfg.JWTSecret,
			appOrigin(cfg.AppDomain),
		)
	}
	verificationService := auth.NewVerificationService(db.DB, log, emailService)

	// Only providers with credentials are registered, so an unconfigured one
	// is absent rather than broken.
	oauthRegistry := oauth.NewRegistry()
	if p := oauth.NewYandexAt(cfg.YandexOAuthClientID, cfg.YandexOAuthClientSecret, cfg.OAuthYandexBaseURL); p != nil {
		oauthRegistry.Register(p)
		log.Info("External sign-in provider registered", "provider", p.Name())
		if cfg.OAuthYandexBaseURL != "" {
			log.Warn("Yandex sign-in answered by a stub, not by Yandex", "base_url", cfg.OAuthYandexBaseURL)
		}
	}
	if p := oauth.NewVK(cfg.VKOAuthClientID, cfg.VKOAuthClientSecret); p != nil {
		oauthRegistry.Register(p)
		log.Info("External sign-in provider registered", "provider", p.Name())
	}
	if !oauthRegistry.Enabled() {
		log.Warn("No external sign-in providers configured; only password sign-in is available")
	}
	authService := auth.NewService(db.DB, cfg, log)

	var contentS3Uploader content.S3Uploader
	if contentS3 != nil {
		contentS3Uploader = contentS3
	}
	contentService := content.NewService(db, log, contentS3Uploader, wsHub)
	// Shared with the curator handler so the snapshot jobs and the HTTP layer
	// read the same code path.
	curatorService := curator.NewService(db, log, notificationsSvc)

	// Erasure must reach every store that holds user files; a bucket missing
	// from this map is data that survives an account deletion.
	accountService := account.NewService(db, log, map[string]*storage.S3Client{
		"weekly-photos":  s3Client,
		"profile-photos": profilePhotosS3,
		"chat":           chatS3,
		"food-photos":    foodPhotosS3,
		"exports":        dataExportsS3,
	}).WithNotifier(notificationsSvc).
		// A passwordless account confirms its own deletion with a code
		// mailed through the same mechanism email verification already
		// uses — see account.DeletionCodeService for why one is required.
		WithCodeVerifier(verificationService)

	analyticsService := analytics.NewService(db.DB, log)
	// Назначение куратора происходит в сервисе аутентификации на всех трёх
	// путях внутрь, поэтому запись события подключается к нему, а не к
	// обработчику.
	authService = authService.WithAnalytics(analyticsService)
	// Прекращение права на куратора происходит задачей, без участия браузера:
	// записывать его может только служба.
	curatorService = curatorService.WithAccessEvents(analyticsService)

	// Telling the advertising account what happened after the browser closed.
	// Nil wherever no account is configured, which is every environment except
	// production — and then nothing queues, and no job is registered.
	var metrikaService *metrika.Service
	if cfg.Features.AdsAttribution {
		metrikaService = metrika.NewService(
			db.DB, log, cfg.MetrikaOAuthToken, cfg.MetrikaCounterID)
		analyticsService = analyticsService.WithConversions(metrikaService)
	}

	chatService = chatService.WithAnalytics(analyticsService)
	// Первая запись о еде — тоже серверный факт, и записывает его служба
	// трекера: путь куратора через чат в неё не заходит, поэтому
	// принадлежность записи человеку обеспечена самим местом вызова.
	foodTrackerService := foodtracker.NewService(db, log).WithAnalytics(analyticsService)

	// Каталог рецептов. Хранилище контента и MCP ВкусВилла необязательны:
	// без них загрузка фото и импорт отвечают 503. Интерфейс получает nil
	// явно, а не через типизированный nil-указатель, иначе проверка на nil в
	// сервисе не сработала бы.
	var recipePhotos recipes.PhotoStore
	if contentS3 != nil {
		recipePhotos = contentS3
	}
	var vkusvill *recipes.VkusvillClient
	if cfg.Features.RecipeImport {
		vkusvill = recipes.NewVkusvillClient(cfg.VkusvillMCPURL)
	}
	recipesService := recipes.NewService(db, log, foodTrackerService, recipePhotos, vkusvill)

	// План питания на день: цель — та же, что в дневнике (nutrition-calc),
	// фото блюд — из того же хранилища, что у каталога. Без хранилища
	// photo_url — null, а не ошибка.
	var mealPlanPhotos mealplan.PhotoURLs
	if recipePhotos != nil {
		mealPlanPhotos = recipePhotos
	}
	mealPlanService := mealplan.NewService(db, log, nutritionCalcSvc, mealPlanPhotos).WithDiary(foodTrackerService)

	// Leads outlive the browser session they were created in, so their resume
	// links are signed with the same secret that signs sessions.
	leadsService := leads.NewService(db.DB, log, cfg.JWTSecret)

	// Support bot. Absent credentials mean no bot at all rather than a broken
	// one: the routes are not registered and the capability reports itself off.
	var supportService *support.Service
	var bridge *supportbridge.Service
	if cfg.Features.SupportBot {
		supportService = support.NewService(
			db.DB, log,
			llm.NewClient(cfg.LLMAPIKey, cfg.SupportModel, log).
				WithEndpoint(cfg.LLMBaseURL, cfg.LLMAuthScheme).
				WithUsageObserver(telemetry.RecordModelUsage),
			telegram.NewClient(cfg.TelegramBotToken),
			leadsService,
			cfg.SupportDailyLimit,
		)
		// An escalated conversation sits in the admin queue until somebody
		// looks. This is what makes them look.
		supportService.WithOperatorNotices(notificationsSvc)

		// Мост переписки: тема на клиента. Без заданной группы выключен —
		// переписка идёт по-старому, а не ломается.
		// Оповещения бота идут в свою тему: в общей ленте группы разговаривают
		// участники проекта, и сообщение бота там теряется.
		bridge = supportbridge.NewService(db.DB, telegram.NewClient(cfg.TelegramBotToken),
			log, cfg.TelegramSupportGroupID, appOrigin(cfg.AppDomain)).
			WithAlertsTopic(cfg.TelegramAlertsThreadID)
		accountService.WithTopics(bridge)
		// Ответы куратора из темы: мост говорит, кому и куда, а доставка
		// кладёт ответ в переписку платформы от его имени.
		supportService.WithBridge(bridge,
			supportbridge.NewPlatformDelivery(db.DB),
			supportbridge.NewCuratorByTelegram(db.DB))
		// Сообщения из чата платформы — в ту же тему.
		chatService.WithBridge(bridge)

		// Вложения: приём от клиента и запись в переписку платформы. Без
		// хранилища бот отвечает отказом, а не молчит.
		if chatS3 != nil {
			bridge.WithMedia(chatS3, telegram.NewClient(cfg.TelegramBotToken))
		}
		bridge.WithPlatform(supportbridge.NewPlatformDelivery(db.DB))
		supportService.WithMedia(bridge)
		// Привязка Telegram: `/start <билет>` гасится до логики поддержки.
		supportService.WithLinks(telegramlink.NewService(db.DB))

		// Состав рабочей группы следует за ролями в базе.
		bot := telegram.NewClient(cfg.TelegramBotToken)
		bridge.WithMembership(bot, bot)
		supportService.WithMembership(bridge).WithGroup(cfg.TelegramSupportGroupID)
		adminService.WithGroupMembership(bridge)
		telegramLinkHandler.WithInvites(bridge)
		// Кто бы ни пришёл первым — роль или запуск бота, — человек получает
		// своё: куратор приглашение в группу, остальные руководство клиента.
		supportService.WithLinkedGreeter(bridge)

		// Уведомления — и в Telegram тому, кто его привязал.
		notificationsSvc.WithTelegram(telegramlink.NewDelivery(
			telegramlink.NewService(db.DB), telegram.NewClient(cfg.TelegramBotToken)))
	} else {
		log.Warn("Support bot is disabled", "reason", "TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET or OPENROUTER_API_KEY is absent")
	}

	// Заявка на куратора зовёт людей: суперадминов — уведомлением, кураторов —
	// сообщением в тему оповещений их группы. Без этого она лежала в очереди,
	// пока туда не заглянут, и единственная за две недели пролежала неделю.
	var curatorsGroup leads.GroupAnnouncer
	if bridge != nil && bridge.Enabled() {
		curatorsGroup = bridge
	}
	leadsService.WithOperatorAlerts(notificationsSvc, curatorsGroup, appOrigin(cfg.AppDomain))

	// Periodic work. Every job takes a PostgreSQL advisory lock, so running
	// more than one instance does not run the work twice, and every execution
	// is recorded — which is what makes "are snapshots being collected?"
	// answerable at all.
	moscow, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		log.Warn("Failed to load Europe/Moscow; scheduling jobs in UTC", "error", err)
		moscow = time.UTC
	}

	metrics := telemetry.New("burcev", db.DB.Stats)

	jobRegistry := jobs.NewRegistry()
	scheduler := jobs.NewScheduler(db.DB, jobRegistry, log, moscow)
	scheduler.SetObserver(func(name string, status jobs.Status, d time.Duration, _ int) {
		metrics.ObserveJob(name, string(status), d)
	})
	// Чем проверять, что возможность не только настроена, но и работает.
	//
	// Имена совпадают с признаками в config.Features.Map(), чтобы сломанная
	// возможность и флаг, уверяющий в обратном, несли одну и ту же метку.
	var checks []capabilities.Check
	if emailService != nil {
		checks = append(checks, capabilities.Check{
			Name: "email", Verify: emailService.VerifyCredentials,
		})
	}
	// Проверки ключа модели среди возможностей нет: у провайдера нет
	// бесплатного способа спросить о ключе, а ежечасная трата ради проверки
	// хуже наблюдения за настоящими отказами. Событие `model_call_failed`
	// считается на обоих путях, и на него заведено оповещение.

	// Для бота состояние вебхука важнее состояния ключа: если Telegram
	// перестанет до нас достукиваться, обновления просто не придут, и здесь об
	// этом не будет ни строчки — потому что сюда ничего не дойдёт.
	if cfg.TelegramBotToken != "" {
		bot := telegram.NewClient(cfg.TelegramBotToken)
		webhookURL := appOrigin(cfg.AppDomain) + "/api/v1/public/support/telegram"
		checks = append(checks, capabilities.Check{
			Name: "support_bot",
			Verify: func(ctx context.Context) error {
				return bot.VerifyWebhook(ctx, webhookURL)
			},
		})

		// Мост переписки держится на правах бота в группе, а права снимаются в
		// интерфейсе Telegram — настройки об этом не узнают. Без этой проверки
		// переписка перестала бы ходить, ничем не отличаясь от исправной, и мы
		// услышали бы об этом от клиента. Ровно так уже молчал вебхук.
		if cfg.TelegramSupportGroupID != 0 {
			groupID := cfg.TelegramSupportGroupID
			checks = append(checks, capabilities.Check{
				Name: "support_bridge",
				Verify: func(ctx context.Context) error {
					state, err := bot.CheckForum(ctx, groupID)
					if err != nil {
						return fmt.Errorf("группа поддержки недоступна: %w", err)
					}
					switch {
					case !state.IsForum:
						return fmt.Errorf("в группе поддержки выключены темы")
					case !state.BotIsAdmin:
						return fmt.Errorf("бот не администратор группы поддержки")
					case !state.CanManageTopic:
						return fmt.Errorf("боту не разрешено управлять темами")
					}
					return nil
				},
			})
		}
	}
	for name, client := range map[string]*storage.S3Client{
		"weekly_photos":    s3Client,
		"profile_avatars":  profilePhotosS3,
		"chat_attachments": chatS3,
		"content_media":    contentS3,
		"data_exports":     dataExportsS3,
	} {
		if client != nil {
			checks = append(checks, capabilities.Check{Name: name, Verify: client.Reachable})
		}
	}

	var capabilityVerifier *capabilities.Verifier
	if len(checks) > 0 {
		capabilityVerifier = capabilities.New(
			capabilityReporter{}, log, checks...)
	}

	jobsetup.Register(jobRegistry, jobsetup.Deps{
		Account:       accountService,
		Auth:          authService,
		Verification:  verificationService,
		Content:       contentService,
		Curator:       curatorService,
		Analytics:     analyticsService,
		Leads:         leadsService,
		Notifications: notificationsSvc,
		Support:       supportService,
		Bridge:        bridge,
		Email:         emailService,
		AppDomain:     cfg.AppDomain,
		RateLimiter:   rateLimiter,
		Scheduler:     scheduler,
		Capabilities:  capabilityVerifier,
		Metrika:       metrikaService,
	})

	// Access tokens carry the account's token version; this is what checks it.
	tokenVersions := middleware.NewTokenVersions(db.DB)
	// Without this a password change revokes refresh tokens and leaves the
	// access tokens working, and the cache answers with the old version for
	// half a minute — during which the person who just changed their password
	// cannot use the application at all.
	authService.WithSessionCache(tokenVersions)
	// The same for password reset: it ends every session too, and it is the
	// flow where a session that outlives the password matters most.
	resetService.WithSessionCache(tokenVersions)
	// And for a role change: middleware.RequireRole reads the role out of the
	// token, so revoking a role only takes effect once the token naming the
	// old role stops being accepted.
	adminService.WithSessionCache(tokenVersions)

	// Magic-link sign-in needs a sender to deliver the letter it issues.
	// emailService is nil when the email capability is off (no SMTP
	// credentials) — leaving authService's sender nil too, not a typed-nil
	// interface, is what makes RequestMagicLink's own nil check answer 503
	// instead of panicking or silently swallowing the send. Guarding here,
	// the same way emailService is guarded everywhere else it is handed to
	// something that takes an interface, not the concrete *email.Service.
	if emailService != nil {
		authService.WithEmailService(emailService)
	}

	deps := router.Deps{
		Cfg:             cfg,
		TokenVersions:   tokenVersions,
		Log:             log,
		DB:              db,
		AuthRateLimiter: authRateLimiter,

		Analytics:     analytics.NewHandler(analyticsService, log),
		Auth:          auth.NewHandler(authService, cfg, log, verificationService).WithLeads(leadsService).WithAnalytics(analyticsService).WithDevices(notificationsSvc),
		Reset:         auth.NewResetHandler(cfg, log, resetService),
		OAuth:         auth.NewOAuthHandler(cfg, log, authService, oauthRegistry).WithLeads(leadsService).WithAnalytics(analyticsService),
		Users:         users.NewHandler(db.DB, profilePhotosS3, cfg, log, nutritionCalcSvc),
		Account:       account.NewHandler(accountService, log),
		Notifications: notifications.NewHandler(notificationsSvc, cfg, log),
		Leads:         leads.NewHandler(leadsService, log),
		Logs:          logs.NewHandler(cfg, log),
		FoodTracker:   foodtracker.NewHandler(cfg, log, db, foodPhotosS3, orClient, foodTrackerService),
		NutritionCalc: nutritioncalc.NewHandler(cfg, log, db),
		Dashboard:     dashboard.NewHandler(cfg, log, db, s3Client, notificationsSvc, nutritionCalcSvc).WithAnalytics(analyticsService),
		Chat:          chat.NewHandler(cfg, log, db, chatService, chatS3, wsHub).WithTickets(authService),
		Curator:       curator.NewHandler(cfg, log, curatorService),
		Admin:         admin.NewHandler(cfg, log, adminService).WithAnalytics(analyticsService),
		AdminJobs:     admin.NewJobsHandler(scheduler),
		Support:       support.NewHandler(cfg, log, supportService),
		// Собирается всегда: без имени бота обработчик отвечает «недоступно»,
		// а не отсутствует. Маршрут, существующий только при части настроек, —
		// это таблица маршрутов, зависящая от окружения.
		TelegramLink: telegramlink.NewHandler(telegramlink.NewService(db.DB), log, cfg.TelegramBotUsername),
		Metrics:      metrics,
		Content:      content.NewHandler(cfg, log, contentService),
		Recipes:      recipes.NewHandler(cfg, log, recipesService),
		MealPlan:     mealplan.NewHandler(log, mealPlanService),
	}

	return &App{Deps: deps, Scheduler: scheduler, Metrics: metrics}
}

// appOrigin turns the configured domain into the origin links in email point
// at. Local development has no domain, and a link to nowhere is worse than a
// link to localhost.
func appOrigin(domain string) string {
	if domain == "" {
		return "http://localhost:3069"
	}
	return "https://" + domain
}

// capabilityReporter соединяет проверку возможностей с метриками.
//
// Отдельный тип, а не передача самих метрик: пакет capabilities поднимает
// результат и не должен знать, как устроена телеметрия.
type capabilityReporter struct{}

func (capabilityReporter) SetCapabilityHealth(capability string, healthy bool) {
	telemetry.SetCapabilityHealth(capability, healthy)
}
