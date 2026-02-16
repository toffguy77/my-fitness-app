//go:build ignore

package main

import (
	"bufio"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/lib/pq"
)

func checkTablesExist(db *sql.DB) bool {
	tables := []string{
		"daily_metrics",
		"weekly_plans",
		"tasks",
		"weekly_reports",
		"photos",
		"coach_clients",
	}

	for _, table := range tables {
		var exists bool
		query := fmt.Sprintf("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '%s')", table)
		err := db.QueryRow(query).Scan(&exists)
		if err != nil {
			log.Printf("Error checking table %s: %v", table, err)
			continue
		}
		if exists {
			return true
		}
	}
	return false
}

func verifyTablesCreated(db *sql.DB) {
	fmt.Println("\nVerifying tables:")
	tables := []string{
		"daily_metrics",
		"weekly_plans",
		"tasks",
		"weekly_reports",
		"photos",
		"coach_clients",
	}

	for _, table := range tables {
		var exists bool
		query := fmt.Sprintf("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '%s')", table)
		err := db.QueryRow(query).Scan(&exists)
		if err != nil {
			fmt.Printf("❌ %s: Error - %v\n", table, err)
		} else if exists {
			fmt.Printf("✅ %s: Created\n", table)
		} else {
			fmt.Printf("❌ %s: Missing\n", table)
		}
	}
}

func verifyRLSPolicies(db *sql.DB) {
	fmt.Println("\nVerifying RLS Policies:")
	tables := []string{
		"daily_metrics",
		"weekly_plans",
		"tasks",
		"weekly_reports",
		"photos",
		"coach_clients",
	}

	for _, table := range tables {
		var rlsEnabled bool
		query := fmt.Sprintf("SELECT rowsecurity FROM pg_tables WHERE tablename = '%s'", table)
		err := db.QueryRow(query).Scan(&rlsEnabled)
		if err != nil {
			fmt.Printf("❌ %s RLS: Error - %v\n", table, err)
			continue
		}

		if rlsEnabled {
			var count int
			policyQuery := fmt.Sprintf("SELECT COUNT(*) FROM pg_policies WHERE tablename = '%s'", table)
			err = db.QueryRow(policyQuery).Scan(&count)
			if err != nil {
				fmt.Printf("✅ %s RLS: Enabled (Policies count error: %v)\n", table, err)
			} else {
				fmt.Printf("✅ %s RLS: Enabled (%d policies)\n", table, count)
			}
		} else {
			fmt.Printf("❌ %s RLS: Disabled\n", table)
		}
	}
}

func verifyIndexes(db *sql.DB) {
	fmt.Println("\nVerifying Indexes:")
	indexes := []struct {
		table string
		name  string
	}{
		{"daily_metrics", "idx_daily_metrics_user_date"},
		{"daily_metrics", "idx_daily_metrics_date"},
		{"weekly_plans", "idx_weekly_plans_user_active"},
		{"weekly_plans", "idx_weekly_plans_dates"},
		{"tasks", "idx_tasks_user_week"},
		{"tasks", "idx_tasks_due_date"},
		{"tasks", "idx_tasks_status"},
		{"weekly_reports", "idx_weekly_reports_user_week"},
		{"weekly_reports", "idx_weekly_reports_dates"},
		{"photos", "idx_photos_user_week"},
		{"photos", "idx_photos_week_identifier"},
		{"coach_clients", "idx_coach_clients_coach"},
		{"coach_clients", "idx_coach_clients_client"},
		{"coach_clients", "idx_coach_clients_composite"},
	}

	for _, idx := range indexes {
		var exists bool
		query := fmt.Sprintf("SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = '%s')", idx.name)
		err := db.QueryRow(query).Scan(&exists)
		if err != nil {
			fmt.Printf("❌ %s: Error - %v\n", idx.name, err)
		} else if exists {
			fmt.Printf("✅ %s: Exists\n", idx.name)
		} else {
			fmt.Printf("❌ %s: Missing\n", idx.name)
		}
	}
}

func runMigrationFile(dbURL string, filePath string) error {
	content, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("migration file not found: %s", filePath)
		}
		return fmt.Errorf("failed to read migration file: %w", err)
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer db.Close()

	_, err = db.Exec(string(content))
	if err != nil {
		return fmt.Errorf("failed to execute migration: %w", err)
	}

	return nil
}

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
		os.Setenv(key, value)
	}

	return scanner.Err()
}

func main() {
	// Load .env file
	if err := loadEnv(".env"); err != nil {
		log.Printf("Warning: Failed to load .env file: %v", err)
	}

	// Get database URL from environment
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable is not set")
	}

	// Connect to database
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Test connection
	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	fmt.Println("✓ Connected to database successfully")
	fmt.Println("\n=== Running Dashboard Migrations ===")
	fmt.Println()

	// Check if tables already exist
	tablesExist := checkTablesExist(db)

	if tablesExist {
		fmt.Println("⚠ Dashboard tables already exist")
		fmt.Print("Do you want to continue anyway? (yes/no): ")
		var response string
		fmt.Scanln(&response)
		if response != "yes" {
			fmt.Println("Migration cancelled")
			return
		}
	}

	// Run migration 003 (create tables)
	fmt.Println("\n--- Running Migration 003: Create Dashboard Tables ---")
	if err := runMigrationFile(dbURL, "migrations/003_create_dashboard_tables_up.sql"); err != nil {
		log.Fatalf("Failed to run migration 003: %v", err)
	}
	fmt.Println("✓ Migration 003 completed successfully")

	// Verify tables created
	fmt.Println("\n--- Verifying Tables Created ---")
	verifyTablesCreated(db)

	// Run migration 004 (RLS policies)
	fmt.Println("\n--- Running Migration 004: Dashboard RLS Policies ---")
	if err := runMigrationFile(dbURL, "migrations/004_dashboard_rls_policies_up.sql"); err != nil {
		log.Fatalf("Failed to run migration 004: %v", err)
	}
	fmt.Println("✓ Migration 004 completed successfully")

	// Verify RLS policies
	fmt.Println("\n--- Verifying RLS Policies ---")
	verifyRLSPolicies(db)

	// Verify indexes
	fmt.Println("\n--- Verifying Indexes ---")
	verifyIndexes(db)

	fmt.Println("\n✓ All dashboard migrations completed successfully!")
	fmt.Println("\nNext steps:")
	fmt.Println("  1. Run property tests: go test -v ./internal/modules/dashboard/")
	fmt.Println("  2. Implement backend service layer (Task 2)")
	fmt.Println("  3. Implement backend HTTP handlers (Task 4)")
}
