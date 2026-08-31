// Command seed-e2e creates the accounts the Playwright suite signs in as.
//
// The e2e tests need a client, a curator and an admin, with the curator
// assigned to the client. Creating them through SQL keeps the seed independent
// of the registration flow the tests themselves exercise.
//
// Usage:
//
//	DATABASE_URL=... go run ./cmd/seed-e2e
//
// Credentials come from the same environment variables the tests read.
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/bcrypt"
)

type account struct {
	emailVar    string
	passwordVar string
	role        string
	name        string
}

var accounts = []account{
	{"E2E_CLIENT_EMAIL", "E2E_CLIENT_PASSWORD", "client", "E2E Client"},
	{"E2E_CURATOR_EMAIL", "E2E_CURATOR_PASSWORD", "coordinator", "E2E Curator"},
	{"E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD", "super_admin", "E2E Admin"},
}

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer func() { _ = db.Close() }()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	ids := make(map[string]int64, len(accounts))
	for _, a := range accounts {
		id, err := upsertUser(ctx, db, a)
		if err != nil {
			log.Fatalf("seed %s: %v", a.role, err)
		}
		ids[a.role] = id
		fmt.Printf("seeded %-13s id=%d\n", a.role, id)
	}

	// The curator screens are empty without an assigned client.
	if err := assign(ctx, db, ids["coordinator"], ids["client"]); err != nil {
		log.Fatalf("assign curator: %v", err)
	}
	fmt.Println("assigned curator to client")
}

func upsertUser(ctx context.Context, db *sql.DB, a account) (int64, error) {
	email, password := os.Getenv(a.emailVar), os.Getenv(a.passwordVar)
	if email == "" || password == "" {
		return 0, fmt.Errorf("%s and %s must be set", a.emailVar, a.passwordVar)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		return 0, fmt.Errorf("hash password: %w", err)
	}

	var id int64
	err = db.QueryRowContext(ctx, `
		INSERT INTO users (email, password, name, role, email_verified, onboarding_completed)
		VALUES ($1, $2, $3, $4, true, true)
		ON CONFLICT (email) DO UPDATE
		SET password = EXCLUDED.password,
		    role = EXCLUDED.role,
		    email_verified = true,
		    onboarding_completed = true
		RETURNING id`, email, string(hash), a.name, a.role).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("upsert user: %w", err)
	}
	return id, nil
}

func assign(ctx context.Context, db *sql.DB, curatorID, clientID int64) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO curator_client_relationships (curator_id, client_id, status)
		VALUES ($1, $2, 'active')
		ON CONFLICT DO NOTHING`, curatorID, clientID)
	return err
}
