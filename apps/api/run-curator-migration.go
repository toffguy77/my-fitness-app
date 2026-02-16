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

// checkOldStructureExists checks if the old coach-related structure still exists
func checkOldStructureExists(db *sql.DB) bool {
	// Check if old table exists
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'coach_client_relationships'
		)
	`).Scan(&exists)
	if err != nil {
		log.Printf("Error checking old table: %v", err)
		return false
	}
	return exists
}

// checkNewStructureExists checks if the new curator-related structure already exists
func checkNewStructureExists(db *sql.DB) bool {
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'curator_client_relationships'
		)
	`).Scan(&exists)
	if err != nil {
		log.Printf("Error checking new table: %v", err)
		return false
	}
	return exists
}

// verifyTableRenamed verifies that the table was renamed correctly
func verifyTableRenamed(db *sql.DB) bool {
	fmt.Println("\n--- Verifying Table Renamed ---")

	// Check old table doesn't exist
	var oldExists bool
	err := db.QueryRow(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'coach_client_relationships'
		)
	`).Scan(&oldExists)
	if err != nil {
		fmt.Printf("❌ Error checking old table: %v\n", err)
		return false
	}
	if oldExists {
		fmt.Println("❌ Old table 'coach_client_relationships' still exists")
		return false
	}
	fmt.Println("✅ Old table 'coach_client_relationships' removed")

	// Check new table exists
	var newExists bool
	err = db.QueryRow(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'curator_client_relationships'
		)
	`).Scan(&newExists)
	if err != nil {
		fmt.Printf("❌ Error checking new table: %v\n", err)
		return false
	}
	if !newExists {
		fmt.Println("❌ New table 'curator_client_relationships' not found")
		return false
	}
	fmt.Println("✅ New table 'curator_client_relationships' exists")

	return true
}

// verifyColumnsRenamed verifies that columns were renamed correctly
func verifyColumnsRenamed(db *sql.DB) bool {
	fmt.Println("\n--- Verifying Columns Renamed ---")

	columnsToCheck := []struct {
		table     string
		newColumn string
		oldColumn string
	}{
		{"curator_client_relationships", "curator_id", "coach_id"},
		{"weekly_plans", "curator_id", "coach_id"},
		{"tasks", "curator_id", "coach_id"},
		{"weekly_reports", "curator_id", "coach_id"},
		{"weekly_reports", "curator_feedback", "coach_feedback"},
	}

	allPassed := true
	for _, col := range columnsToCheck {
		// Check new column exists
		var newExists bool
		err := db.QueryRow(`
			SELECT EXISTS (
				SELECT FROM information_schema.columns
				WHERE table_name = $1 AND column_name = $2
			)
		`, col.table, col.newColumn).Scan(&newExists)
		if err != nil {
			fmt.Printf("❌ %s.%s: Error - %v\n", col.table, col.newColumn, err)
			allPassed = false
			continue
		}

		// Check old column doesn't exist
		var oldExists bool
		err = db.QueryRow(`
			SELECT EXISTS (
				SELECT FROM information_schema.columns
				WHERE table_name = $1 AND column_name = $2
			)
		`, col.table, col.oldColumn).Scan(&oldExists)
		if err != nil {
			fmt.Printf("❌ %s.%s: Error checking old column - %v\n", col.table, col.oldColumn, err)
			allPassed = false
			continue
		}

		if newExists && !oldExists {
			fmt.Printf("✅ %s.%s: Renamed from %s\n", col.table, col.newColumn, col.oldColumn)
		} else if !newExists {
			fmt.Printf("❌ %s.%s: New column not found\n", col.table, col.newColumn)
			allPassed = false
		} else if oldExists {
			fmt.Printf("❌ %s.%s: Old column still exists\n", col.table, col.oldColumn)
			allPassed = false
		}
	}

	return allPassed
}

// verifyIndexesCreated verifies that new indexes were created
func verifyIndexesCreated(db *sql.DB) bool {
	fmt.Println("\n--- Verifying Indexes ---")

	newIndexes := []string{
		"idx_curator_client_curator",
		"idx_curator_client_client",
		"idx_weekly_plans_curator",
		"idx_tasks_curator",
		"idx_weekly_reports_curator",
	}

	oldIndexes := []string{
		"idx_coach_client_coach",
		"idx_coach_client_client",
		"idx_weekly_plans_coach",
		"idx_tasks_coach",
		"idx_weekly_reports_coach",
	}

	allPassed := true

	// Check new indexes exist
	for _, idx := range newIndexes {
		var exists bool
		err := db.QueryRow(`
			SELECT EXISTS (
				SELECT FROM pg_indexes
				WHERE indexname = $1
			)
		`, idx).Scan(&exists)
		if err != nil {
			fmt.Printf("❌ %s: Error - %v\n", idx, err)
			allPassed = false
			continue
		}
		if exists {
			fmt.Printf("✅ %s: Created\n", idx)
		} else {
			fmt.Printf("❌ %s: Missing\n", idx)
			allPassed = false
		}
	}

	// Check old indexes don't exist
	for _, idx := range oldIndexes {
		var exists bool
		err := db.QueryRow(`
			SELECT EXISTS (
				SELECT FROM pg_indexes
				WHERE indexname = $1
			)
		`, idx).Scan(&exists)
		if err != nil {
			fmt.Printf("❌ %s: Error checking old index - %v\n", idx, err)
			continue
		}
		if exists {
			fmt.Printf("⚠️  %s: Old index still exists (should be dropped)\n", idx)
		} else {
			fmt.Printf("✅ %s: Old index removed\n", idx)
		}
	}

	return allPassed
}

// verifyRLSPolicies verifies that new RLS policies were created
func verifyRLSPolicies(db *sql.DB) bool {
	fmt.Println("\n--- Verifying RLS Policies ---")

	newPolicies := []struct {
		table  string
		policy string
	}{
		{"curator_client_relationships", "Curators can view own relationships"},
		{"curator_client_relationships", "Clients can view own curator relationships"},
		{"curator_client_relationships", "Curators can create relationships"},
		{"curator_client_relationships", "Curators can update own relationships"},
		{"daily_metrics", "Curators can view client metrics"},
		{"weekly_plans", "Curators can manage client plans"},
		{"tasks", "Curators can manage client tasks"},
		{"weekly_reports", "Curators can view and update client reports"},
		{"weekly_photos", "Curators can view client photos"},
	}

	oldPolicies := []struct {
		table  string
		policy string
	}{
		{"curator_client_relationships", "Coaches can view own relationships"},
		{"curator_client_relationships", "Coaches can create relationships"},
		{"curator_client_relationships", "Coaches can update own relationships"},
		{"daily_metrics", "Coaches can view client metrics"},
		{"weekly_plans", "Coaches can manage client plans"},
		{"tasks", "Coaches can manage client tasks"},
		{"weekly_reports", "Coaches can view and update client reports"},
		{"weekly_photos", "Coaches can view client photos"},
	}

	allPassed := true

	// Check new policies exist
	for _, pol := range newPolicies {
		var exists bool
		err := db.QueryRow(`
			SELECT EXISTS (
				SELECT FROM pg_policies
				WHERE tablename = $1 AND policyname = $2
			)
		`, pol.table, pol.policy).Scan(&exists)
		if err != nil {
			fmt.Printf("❌ %s - '%s': Error - %v\n", pol.table, pol.policy, err)
			allPassed = false
			continue
		}
		if exists {
			fmt.Printf("✅ %s - '%s': Created\n", pol.table, pol.policy)
		} else {
			fmt.Printf("❌ %s - '%s': Missing\n", pol.table, pol.policy)
			allPassed = false
		}
	}

	// Check old policies don't exist
	fmt.Println("\n--- Verifying Old Policies Removed ---")
	for _, pol := range oldPolicies {
		var exists bool
		err := db.QueryRow(`
			SELECT EXISTS (
				SELECT FROM pg_policies
				WHERE tablename = $1 AND policyname = $2
			)
		`, pol.table, pol.policy).Scan(&exists)
		if err != nil {
			fmt.Printf("❌ %s - '%s': Error checking old policy - %v\n", pol.table, pol.policy, err)
			continue
		}
		if exists {
			fmt.Printf("⚠️  %s - '%s': Old policy still exists\n", pol.table, pol.policy)
		} else {
			fmt.Printf("✅ %s - '%s': Old policy removed\n", pol.table, pol.policy)
		}
	}

	return allPassed
}

// runMigrationFile executes a migration file
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

// loadEnv loads environment variables from a file
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
	fmt.Println("\n=== Coach to Curator Migration ===")
	fmt.Println()

	// Check current state
	oldExists := checkOldStructureExists(db)
	newExists := checkNewStructureExists(db)

	if newExists && !oldExists {
		fmt.Println("ℹ️  Migration appears to have already been applied")
		fmt.Println("   Running verification checks...")

		// Run verification
		tableOK := verifyTableRenamed(db)
		columnsOK := verifyColumnsRenamed(db)
		indexesOK := verifyIndexesCreated(db)
		policiesOK := verifyRLSPolicies(db)

		if tableOK && columnsOK && indexesOK && policiesOK {
			fmt.Println("\n✅ All verification checks passed!")
		} else {
			fmt.Println("\n⚠️  Some verification checks failed. Review the output above.")
		}
		return
	}

	if !oldExists && !newExists {
		fmt.Println("❌ Neither old nor new structure found.")
		fmt.Println("   Please ensure the dashboard tables exist before running this migration.")
		return
	}

	// Confirm migration
	fmt.Println("This migration will:")
	fmt.Println("  1. Rename table 'coach_client_relationships' → 'curator_client_relationships'")
	fmt.Println("  2. Rename columns 'coach_id' → 'curator_id' in all tables")
	fmt.Println("  3. Rename column 'coach_feedback' → 'curator_feedback' in weekly_reports")
	fmt.Println("  4. Drop old indexes and create new ones with 'curator' naming")
	fmt.Println("  5. Drop old RLS policies and create new ones with 'Curator' naming")
	fmt.Println()
	fmt.Print("Do you want to proceed? (yes/no): ")

	var response string
	fmt.Scanln(&response)
	if response != "yes" {
		fmt.Println("Migration cancelled")
		return
	}

	// Run migration
	fmt.Println("\n--- Running Migration 010: Rename Coach to Curator ---")
	if err := runMigrationFile(dbURL, "migrations/010_rename_coach_to_curator_up.sql"); err != nil {
		log.Fatalf("Failed to run migration: %v", err)
	}
	fmt.Println("✓ Migration 010 executed successfully")

	// Verify migration
	fmt.Println("\n=== Verifying Migration Results ===")

	tableOK := verifyTableRenamed(db)
	columnsOK := verifyColumnsRenamed(db)
	indexesOK := verifyIndexesCreated(db)
	policiesOK := verifyRLSPolicies(db)

	// Summary
	fmt.Println("\n=== Migration Summary ===")
	if tableOK && columnsOK && indexesOK && policiesOK {
		fmt.Println("✅ All migration checks passed!")
		fmt.Println("\nNext steps:")
		fmt.Println("  1. Update Backend types: apps/api/internal/modules/dashboard/types.go")
		fmt.Println("  2. Update Backend service: apps/api/internal/modules/dashboard/service.go")
		fmt.Println("  3. Update Backend handler: apps/api/internal/modules/dashboard/handler.go")
		fmt.Println("  4. Run Backend tests: make test-api")
	} else {
		fmt.Println("⚠️  Some migration checks failed!")
		fmt.Println("   Review the output above and fix any issues.")
		fmt.Println("\nTo rollback the migration:")
		fmt.Println("  psql $DATABASE_URL -f migrations/010_rename_coach_to_curator_down.sql")
	}
}
