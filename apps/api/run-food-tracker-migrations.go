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

func checkTableExists(db *sql.DB, table string) bool {
	var exists bool
	query := fmt.Sprintf("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '%s')", table)
	err := db.QueryRow(query).Scan(&exists)
	if err != nil {
		return false
	}
	return exists
}

func main() {
	if err := loadEnv(".env"); err != nil {
		log.Printf("Warning: Failed to load .env file: %v", err)
	}

	dbURL := buildDatabaseURL()
	if dbURL == "" {
		log.Fatal("DATABASE_URL or DB_HOST/DB_PASSWORD must be set in .env")
	}

	fmt.Printf("Connecting to database at %s...\n", strings.Split(dbURL, "@")[1])

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	fmt.Println("✓ Connected to database successfully")
	fmt.Println("\n=== Running Food Tracker Migrations ===\n")

	migrations := []struct {
		name   string
		file   string
		tables []string
	}{
		{
			name:   "005: Create food_items table",
			file:   "migrations/005_create_food_items_table_up.sql",
			tables: []string{"food_items"},
		},
		{
			name:   "006: Create food_entries table",
			file:   "migrations/006_create_food_entries_table_up.sql",
			tables: []string{"food_entries"},
		},
		{
			name:   "007: Create water_logs table",
			file:   "migrations/007_create_water_logs_table_up.sql",
			tables: []string{"water_logs"},
		},
		{
			name:   "008: Create barcode_cache table",
			file:   "migrations/008_create_barcode_cache_table_up.sql",
			tables: []string{"barcode_cache"},
		},
		{
			name:   "009: Create supporting tables",
			file:   "migrations/009_create_food_tracker_supporting_tables_up.sql",
			tables: []string{"user_foods", "nutrient_recommendations", "user_nutrient_preferences", "user_custom_recommendations", "meal_templates", "user_favorite_foods"},
		},
		{
			name:   "011: Fix food_items column names (_per_100 suffix)",
			file:   "migrations/011_fix_food_items_column_names_up.sql",
			tables: []string{}, // no new tables, column renames
		},
	}

	for _, m := range migrations {
		fmt.Printf("--- %s ---\n", m.name)

		if len(m.tables) > 0 {
			allExist := true
			for _, t := range m.tables {
				if !checkTableExists(db, t) {
					allExist = false
					break
				}
			}

			if allExist {
				fmt.Printf("  ⏭ Skipped (tables already exist)\n\n")
				continue
			}
		}

		if err := runMigrationFile(db, m.file); err != nil {
			log.Fatalf("  ✗ Failed: %v", err)
		}
		fmt.Printf("  ✓ Completed\n\n")
	}

	// Verify all tables
	fmt.Println("=== Verification ===\n")
	allTables := []string{
		"food_items", "food_entries", "water_logs", "barcode_cache",
		"user_foods", "nutrient_recommendations", "user_nutrient_preferences",
		"user_custom_recommendations", "meal_templates", "user_favorite_foods",
	}

	allOK := true
	for _, t := range allTables {
		if checkTableExists(db, t) {
			fmt.Printf("  ✅ %s\n", t)
		} else {
			fmt.Printf("  ❌ %s\n", t)
			allOK = false
		}
	}

	if allOK {
		fmt.Println("\n✓ All food tracker migrations completed successfully!")
	} else {
		fmt.Println("\n✗ Some tables are missing!")
		os.Exit(1)
	}
}
