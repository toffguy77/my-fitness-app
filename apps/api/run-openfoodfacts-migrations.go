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
		if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
			value = value[1 : len(value)-1]
		}
		os.Setenv(key, value)
	}
	return scanner.Err()
}

func buildDatabaseURL() string {
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		return dbURL
	}
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
	hosts := strings.Split(host, ",")
	primaryHost := strings.TrimSpace(hosts[0])
	return fmt.Sprintf("postgresql://%s:%s@%s:%s/%s?sslmode=%s",
		url.PathEscape(user), url.PathEscape(password), primaryHost, port, dbName, sslMode)
}

func main() {
	if err := loadEnv(".env"); err != nil {
		log.Printf("Warning: Failed to load .env: %v", err)
	}
	dbURL := buildDatabaseURL()
	if dbURL == "" {
		log.Fatal("DATABASE_URL or DB_HOST/DB_PASSWORD must be set")
	}

	fmt.Printf("Connecting to %s...\n", strings.Split(dbURL, "@")[1])
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping: %v", err)
	}
	fmt.Println("Connected.")

	migrations := []string{
		"migrations/017_add_unique_barcode_index_up.sql",
		"migrations/018_add_food_items_fts_index_up.sql",
	}

	for _, file := range migrations {
		fmt.Printf("Running %s... ", file)
		content, err := os.ReadFile(file)
		if err != nil {
			log.Fatalf("Failed to read %s: %v", file, err)
		}
		if _, err := db.Exec(string(content)); err != nil {
			log.Fatalf("Failed to execute %s: %v", file, err)
		}
		fmt.Println("OK")
	}

	fmt.Println("\nAll migrations complete.")

	// Print the DATABASE_URL for the import tool (to stdout)
	fmt.Printf("\nDATABASE_URL=%s\n", dbURL)
}
