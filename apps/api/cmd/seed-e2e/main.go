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
	// key names this account in the map below. Two accounts share the `client`
	// role, so the role cannot be the key: it silently overwrote the entry and
	// gave the curator, the conversation and the water goal to the wrong one.
	key         string
	emailVar    string
	passwordVar string
	role        string
	name        string
}

var accounts = []account{
	{"client", "E2E_CLIENT_EMAIL", "E2E_CLIENT_PASSWORD", "client", "E2E Client"},
	{"curator", "E2E_CURATOR_EMAIL", "E2E_CURATOR_PASSWORD", "coordinator", "E2E Curator"},
	{"admin", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD", "super_admin", "E2E Admin"},
	// Its own account, because changing a password ends every session that
	// user has: sharing the client account would sign the rest of the suite
	// out mid-run.
	{"password", "E2E_PASSWORD_EMAIL", "E2E_PASSWORD_PASSWORD", "client", "E2E Password"},
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
			log.Fatalf("seed %s: %v", a.key, err)
		}
		ids[a.key] = id
		fmt.Printf("seeded %-13s id=%d\n", a.key, id)
	}

	// The curator screens are empty without an assigned client.
	if err := assign(ctx, db, ids["curator"], ids["client"]); err != nil {
		log.Fatalf("assign curator: %v", err)
	}
	fmt.Println("assigned curator to client")

	// The chat screens need a conversation. The API creates these at startup
	// for existing relationships, but seeding happens after the API is already
	// running, so the conversation has to be created here.
	if err := ensureConversation(ctx, db, ids["curator"], ids["client"]); err != nil {
		log.Fatalf("create conversation: %v", err)
	}
	fmt.Println("created curator-client conversation")

	// Water tracking only appears once a curator has set a goal — a client
	// with no goal sees no water block at all, which is correct in the product
	// and useless as a fixture.
	if err := setWaterGoal(ctx, db, ids["client"], 8); err != nil {
		log.Fatalf("set water goal: %v", err)
	}
	fmt.Println("set water goal for client")

	// Food search has nothing to find in an empty catalogue: `products` is
	// populated by an importer in real environments, not by migrations.
	if err := seedProducts(ctx, db); err != nil {
		log.Fatalf("seed products: %v", err)
	}
	fmt.Println("seeded catalogue products")
}

func setWaterGoal(ctx context.Context, db *sql.DB, userID int64, glasses int) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO user_settings (user_id, water_goal)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET water_goal = EXCLUDED.water_goal`,
		userID, glasses)
	return err
}

func ensureConversation(ctx context.Context, db *sql.DB, curatorID, clientID int64) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO conversations (curator_id, client_id)
		SELECT $1, $2
		WHERE NOT EXISTS (
			SELECT 1 FROM conversations WHERE curator_id = $1 AND client_id = $2
		)`, curatorID, clientID)
	return err
}

// catalogue entries the food-search tests look for.
var catalogue = []struct {
	name     string
	brand    string
	calories float64
	proteins float64
	fats     float64
	carbs    float64
}{
	{"Гречка", "Мистраль", 329, 12.6, 3.3, 62.1},
	{"Куриная грудка", "Петелинка", 113, 23.6, 1.9, 0.4},
	{"Творог 5%", "Простоквашино", 121, 16, 5, 3},
	{"Яблоко", "", 47, 0.4, 0.4, 9.8},
	{"Овсянка", "Ясно Солнышко", 342, 12.3, 6.1, 59.5},
}

func seedProducts(ctx context.Context, db *sql.DB) error {
	for _, p := range catalogue {
		if _, err := db.ExecContext(ctx, `
			INSERT INTO products (name, brand, calories, proteins, fats, carbs, source)
			SELECT $1, $2, $3, $4, $5, $6, 'database'
			WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = $1)`,
			p.name, p.brand, p.calories, p.proteins, p.fats, p.carbs); err != nil {
			return fmt.Errorf("insert %s: %w", p.name, err)
		}
	}
	return nil
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
