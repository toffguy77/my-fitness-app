package database

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

// PostgresConfig holds PostgreSQL connection configuration
type PostgresConfig struct {
	Host         string
	Port         int
	Database     string
	User         string
	Password     string
	SSLMode      string
	MaxOpenConns int
	MaxIdleConns int
}

// DB wraps sql.DB with additional functionality
type DB struct {
	*sql.DB
}

// NewPostgres creates a new PostgreSQL connection for Yandex Cloud
func NewPostgres(cfg PostgresConfig) (*DB, error) {
	connString := fmt.Sprintf(
		"host=%s port=%d dbname=%s user=%s password=%s sslmode=%s target_session_attrs=read-write",
		cfg.Host,
		cfg.Port,
		cfg.Database,
		cfg.User,
		cfg.Password,
		cfg.SSLMode,
	)

	connConfig, err := pgx.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	// Configure TLS for Yandex Cloud
	if cfg.SSLMode == "require" || cfg.SSLMode == "verify-full" || cfg.SSLMode == "verify-ca" {
		tlsConfig, err := createTLSConfig(cfg.Host)
		if err != nil {
			// Fall back to basic TLS if certificate not found
			tlsConfig = &tls.Config{
				InsecureSkipVerify: cfg.SSLMode == "require",
			}
		}
		connConfig.TLSConfig = tlsConfig
	}

	// Register the driver and open connection
	db := stdlib.OpenDB(*connConfig)

	// Set connection pool settings.
	// Short MaxLifetime (10m) ensures connections to the old primary are recycled
	// quickly after a Yandex Cloud PG failover — the pool re-dials target_session_attrs=read-write
	// and picks up the new primary rather than retrying the now-read-only node for up to an hour.
	db.SetMaxOpenConns(cfg.MaxOpenConns)
	db.SetMaxIdleConns(cfg.MaxIdleConns)
	db.SetConnMaxLifetime(10 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{DB: db}, nil
}

// ensureConnParams appends target_session_attrs and connect_timeout to the URL
// if they are not already present.
//   - target_session_attrs=read-write ensures connections go to the primary node.
//   - connect_timeout=3 makes pgx fail fast on the old primary during YC PG failover
//     so it retries the standby host within seconds rather than waiting for the OS
//     TCP timeout (20-30s).
func ensureConnParams(url string) string {
	if !contains(url, "target_session_attrs") {
		sep := "?"
		if contains(url, "?") {
			sep = "&"
		}
		url = url + sep + "target_session_attrs=read-write"
	}
	if !contains(url, "connect_timeout") {
		url = url + "&connect_timeout=3"
	}
	return url
}

// NewPostgresFromURL creates a new PostgreSQL connection from URL
func NewPostgresFromURL(url string, maxOpenConns, maxIdleConns int) (*DB, error) {
	// Ensure we always connect to the primary (read-write) node
	// to avoid read replica lag after INSERT/UPDATE operations
	url = ensureConnParams(url)

	connConfig, err := pgx.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	// Log resolved connection host for diagnostics (no credentials)
	fmt.Printf("[DB] NewPostgresFromURL: host=%s, port=%d, database=%s, fallbacks=%d\n",
		connConfig.Host, connConfig.Port, connConfig.Database,
		len(connConfig.Fallbacks))

	// Configure TLS for Yandex Cloud if SSL is required
	if connConfig.TLSConfig != nil || containsSSL(url) {
		tlsConfig, err := createTLSConfig(connConfig.Host)
		if err != nil {
			// Fall back to basic TLS if certificate not found
			tlsConfig = &tls.Config{
				InsecureSkipVerify: true,
			}
		}
		connConfig.TLSConfig = tlsConfig
	}

	db := stdlib.OpenDB(*connConfig)

	// Set connection pool settings — same as NewPostgres, see comment there.
	db.SetMaxOpenConns(maxOpenConns)
	db.SetMaxIdleConns(maxIdleConns)
	db.SetConnMaxLifetime(10 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{DB: db}, nil
}

// createTLSConfig creates TLS configuration for Yandex Cloud
func createTLSConfig(host string) (*tls.Config, error) {
	// Try to find Yandex Cloud root certificate
	certPaths := []string{
		filepath.Join(os.Getenv("HOME"), ".postgresql", "root.crt"),
		"/etc/ssl/certs/yandex-cloud-ca.pem",
		"./certs/root.crt",
	}

	var certPool *x509.CertPool
	var certFound bool

	for _, certPath := range certPaths {
		pem, err := os.ReadFile(certPath)
		if err != nil {
			continue
		}

		certPool = x509.NewCertPool()
		if ok := certPool.AppendCertsFromPEM(pem); ok {
			certFound = true
			break
		}
	}

	if !certFound {
		return nil, fmt.Errorf("yandex cloud certificate not found")
	}

	// Use DB_TLS_SERVER_NAME if set, otherwise use host
	serverName := os.Getenv("DB_TLS_SERVER_NAME")
	if serverName == "" {
		serverName = host
	}

	return &tls.Config{
		RootCAs:    certPool,
		ServerName: serverName,
	}, nil
}

// containsSSL checks if URL contains SSL parameters
func containsSSL(url string) bool {
	return len(url) > 0 && (contains(url, "sslmode=require") ||
		contains(url, "sslmode=verify-full") ||
		contains(url, "sslmode=verify-ca"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && findSubstring(s, substr)
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// rlsContextKey is the context key for RLS-aware database connections
type rlsContextKey struct{}

// WithRLSConn stores an RLS-aware connection in the context
func WithRLSConn(ctx context.Context, conn *sql.Conn) context.Context {
	return context.WithValue(ctx, rlsContextKey{}, conn)
}

// rlsConnFromContext retrieves the RLS connection from context
func rlsConnFromContext(ctx context.Context) *sql.Conn {
	if conn, ok := ctx.Value(rlsContextKey{}).(*sql.Conn); ok {
		return conn
	}
	return nil
}

// QueryContext executes a query, using RLS connection if available in context
func (db *DB) QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	if conn := rlsConnFromContext(ctx); conn != nil {
		return conn.QueryContext(ctx, query, args...)
	}
	return db.DB.QueryContext(ctx, query, args...)
}

// QueryRowContext executes a query returning a single row, using RLS connection if available
func (db *DB) QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row {
	if conn := rlsConnFromContext(ctx); conn != nil {
		return conn.QueryRowContext(ctx, query, args...)
	}
	return db.DB.QueryRowContext(ctx, query, args...)
}

// ExecContext executes a statement, using RLS connection if available in context
func (db *DB) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	if conn := rlsConnFromContext(ctx); conn != nil {
		return conn.ExecContext(ctx, query, args...)
	}
	return db.DB.ExecContext(ctx, query, args...)
}

// Health checks database health
func (db *DB) Health(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("database health check failed: %w", err)
	}

	return nil
}

// Stats returns database statistics
func (db *DB) Stats() sql.DBStats {
	return db.DB.Stats()
}
