//go:build ignore

package main

import (
	"bufio"
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	_ "github.com/lib/pq"
)

func loadEnv(filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#") || strings.TrimSpace(line) == "" {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		// Strip surrounding quotes
		if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
			value = value[1 : len(value)-1]
		}
		os.Setenv(key, value)
	}

	return scanner.Err()
}

func buildDatabaseURL() string {
	// Prefer DATABASE_URL if set
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		return dbURL
	}

	// Build from individual params
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")
	sslMode := os.Getenv("DB_SSL_MODE")

	if host == "" || password == "" {
		return ""
	}

	if port == "" {
		port = "6432"
	}
	if sslMode == "" {
		sslMode = "require"
	}

	// For multi-host, take the first host
	hosts := strings.Split(host, ",")
	primaryHost := strings.TrimSpace(hosts[0])

	return fmt.Sprintf(
		"postgresql://%s:%s@%s:%s/%s?sslmode=%s",
		url.PathEscape(user),
		url.PathEscape(password),
		primaryHost,
		port,
		dbName,
		sslMode,
	)
}

func checkTableExists(db *sql.DB, table string) bool {
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = $1
		)
	`, table).Scan(&exists)
	if err != nil {
		return false
	}
	return exists
}

func checkIndexExists(db *sql.DB, index string) bool {
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS (
			SELECT FROM pg_indexes
			WHERE indexname = $1
		)
	`, index).Scan(&exists)
	if err != nil {
		return false
	}
	return exists
}

func runMigrationFile(db *sql.DB, filePath string) error {
	content, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("migration file not found: %s", filePath)
		}
		return fmt.Errorf("failed to read migration file: %w", err)
	}

	_, err = db.Exec(string(content))
	if err != nil {
		return fmt.Errorf("failed to execute migration: %w", err)
	}

	return nil
}

func main() {
	// Load .env file
	envPaths := []string{".env", "../../.env", "../.env"}
	envLoaded := false
	for _, path := range envPaths {
		if err := loadEnv(path); err == nil {
			envLoaded = true
			break
		}
	}
	if !envLoaded {
		log.Printf("Warning: Failed to load .env file from any location")
	}

	dbURL := buildDatabaseURL()
	if dbURL == "" {
		log.Fatal("DATABASE_URL or DB_HOST/DB_PASSWORD must be set in .env")
	}

	// Mask credentials in output
	parts := strings.Split(dbURL, "@")
	if len(parts) > 1 {
		fmt.Printf("Connecting to database at %s...\n", parts[1])
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	fmt.Println("✓ Connected to database successfully")
	fmt.Println("\n=== Refresh Tokens Migration ===")
	fmt.Println()

	// Pre-flight check
	if checkTableExists(db, "refresh_tokens") {
		fmt.Println("ℹ️  Table 'refresh_tokens' already exists")
		fmt.Println("   Running verification checks...")
		fmt.Println()
	} else {
		fmt.Println("--- Running Migration 016: Create refresh_tokens table ---")
		if err := runMigrationFile(db, "migrations/016_create_refresh_tokens_table_up.sql"); err != nil {
			log.Fatalf("  ✗ Failed: %v", err)
		}
		fmt.Println("  ✓ Migration 016 executed successfully")
		fmt.Println()
	}

	// Verification
	fmt.Println("=== Verification ===")
	fmt.Println()

	allOK := true

	// Check table
	if checkTableExists(db, "refresh_tokens") {
		fmt.Println("  ✅ Table: refresh_tokens")
	} else {
		fmt.Println("  ❌ Table: refresh_tokens")
		allOK = false
	}

	// Check indexes
	indexes := []string{
		"idx_refresh_tokens_token_hash",
		"idx_refresh_tokens_user_id",
	}
	for _, idx := range indexes {
		if checkIndexExists(db, idx) {
			fmt.Printf("  ✅ Index: %s\n", idx)
		} else {
			fmt.Printf("  ❌ Index: %s\n", idx)
			allOK = false
		}
	}

	// Check columns
	columns := []string{
		"id", "user_id", "token_hash", "expires_at",
		"revoked_at", "replaced_by_hash", "ip_address",
		"user_agent", "created_at",
	}
	for _, col := range columns {
		var exists bool
		err := db.QueryRow(`
			SELECT EXISTS (
				SELECT FROM information_schema.columns
				WHERE table_name = 'refresh_tokens' AND column_name = $1
			)
		`, col).Scan(&exists)
		if err != nil || !exists {
			fmt.Printf("  ❌ Column: refresh_tokens.%s\n", col)
			allOK = false
		}
	}

	// Check permissions (try a simple operation)
	var canInsert bool
	err = db.QueryRow(`
		SELECT has_table_privilege(current_user, 'refresh_tokens', 'INSERT')
	`).Scan(&canInsert)
	if err != nil {
		fmt.Printf("  ⚠️  Could not check permissions: %v\n", err)
	} else if canInsert {
		fmt.Println("  ✅ Permissions: INSERT granted")
	} else {
		fmt.Println("  ❌ Permissions: INSERT not granted")
		allOK = false
	}

	// Summary
	fmt.Println()
	if allOK {
		fmt.Println("✅ All verification checks passed!")
	} else {
		fmt.Println("⚠️  Some verification checks failed!")
		fmt.Println("   Review the output above and fix any issues.")
		fmt.Println("\nTo rollback:")
		fmt.Println("  psql $DATABASE_URL -f migrations/016_create_refresh_tokens_table_down.sql")
		os.Exit(1)
	}
}
