//go:build ignore

package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
)

func main() {
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

	// Check if notifications table exists
	var tableExists bool
	err = db.QueryRow(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'notifications'
		)
	`).Scan(&tableExists)
	if err != nil {
		log.Fatalf("Failed to check table existence: %v", err)
	}

	if !tableExists {
		fmt.Println("✗ Notifications table does not exist")
		fmt.Println("\nTo create the table, run:")
		fmt.Println("  psql \"$DATABASE_URL\" -f apps/api/migrations/002_create_notifications_table_up.sql")
		return
	}

	fmt.Println("✓ Notifications table exists")

	// Check table structure
	rows, err := db.Query(`
		SELECT column_name, data_type, is_nullable, column_default
		FROM information_schema.columns
		WHERE table_name = 'notifications'
		ORDER BY ordinal_position
	`)
	if err != nil {
		log.Fatalf("Failed to query table structure: %v", err)
	}
	defer rows.Close()

	fmt.Println("\nTable structure:")
	fmt.Println("Column Name       | Data Type              | Nullable | Default")
	fmt.Println("------------------|------------------------|----------|------------------")

	for rows.Next() {
		var colName, dataType, nullable string
		var colDefault sql.NullString
		if err := rows.Scan(&colName, &dataType, &nullable, &colDefault); err != nil {
			log.Fatalf("Failed to scan row: %v", err)
		}
		defaultVal := "NULL"
		if colDefault.Valid {
			defaultVal = colDefault.String
		}
		fmt.Printf("%-17s | %-22s | %-8s | %s\n", colName, dataType, nullable, defaultVal)
	}

	// Check indexes
	indexRows, err := db.Query(`
		SELECT indexname, indexdef
		FROM pg_indexes
		WHERE tablename = 'notifications'
		ORDER BY indexname
	`)
	if err != nil {
		log.Fatalf("Failed to query indexes: %v", err)
	}
	defer indexRows.Close()

	fmt.Println("\nIndexes:")
	for indexRows.Next() {
		var indexName, indexDef string
		if err := indexRows.Scan(&indexName, &indexDef); err != nil {
			log.Fatalf("Failed to scan index row: %v", err)
		}
		fmt.Printf("  - %s\n", indexName)
	}

	// Check constraints
	constraintRows, err := db.Query(`
		SELECT constraint_name, constraint_type
		FROM information_schema.table_constraints
		WHERE table_name = 'notifications'
		ORDER BY constraint_type, constraint_name
	`)
	if err != nil {
		log.Fatalf("Failed to query constraints: %v", err)
	}
	defer constraintRows.Close()

	fmt.Println("\nConstraints:")
	for constraintRows.Next() {
		var constraintName, constraintType string
		if err := constraintRows.Scan(&constraintName, &constraintType); err != nil {
			log.Fatalf("Failed to scan constraint row: %v", err)
		}
		fmt.Printf("  - %s (%s)\n", constraintName, constraintType)
	}

	// Test inserting a sample notification
	fmt.Println("\nTesting insert operation...")

	// First, get a valid user_id from the users table
	var userID int64
	err = db.QueryRow("SELECT id FROM users LIMIT 1").Scan(&userID)
	if err != nil {
		fmt.Println("⚠ No users found in database, skipping insert test")
		fmt.Println("✓ Migration verification complete")
		return
	}

	var notificationID string
	err = db.QueryRow(`
		INSERT INTO notifications (user_id, category, type, title, content)
		VALUES ($1, 'main', 'general', 'Test Notification', 'This is a test notification')
		RETURNING id
	`, userID).Scan(&notificationID)
	if err != nil {
		log.Fatalf("Failed to insert test notification: %v", err)
	}

	fmt.Printf("✓ Successfully inserted test notification with ID: %s\n", notificationID)

	// Clean up test data
	_, err = db.Exec("DELETE FROM notifications WHERE id = $1", notificationID)
	if err != nil {
		log.Fatalf("Failed to delete test notification: %v", err)
	}

	fmt.Println("✓ Successfully deleted test notification")
	fmt.Println("\n✓ Migration verification complete - all checks passed!")
}
