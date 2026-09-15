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
// Или, когда до базы не дотянуться оттуда, где есть Go, — напечатать SQL и
// выполнить его там, где база достижима:
//
//	go run ./cmd/seed-e2e -sql > seed.sql
//	psql "$DATABASE_URL" -f seed.sql
//
// Так заведены учётные записи на dev: управляемый PostgreSQL закрыт снаружи, а
// на сервере нет Go. Вывод повторяет то, что делает сам сеятель, потому что
// собирается из тех же данных — расходиться нечему.
//
// Credentials come from the same environment variables the tests read.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
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
	// A second curator with no clients of their own, so the suite can ask the
	// question that matters: what happens when a curator addresses somebody
	// else's client. Row-level security was turned off by migration 015, so
	// nothing but an explicit check stands between them.
	{"other-curator", "E2E_OTHER_CURATOR_EMAIL", "E2E_OTHER_CURATOR_PASSWORD", "coordinator", "E2E Other Curator"},
}

func main() {
	printSQL := flag.Bool("sql", false,
		"напечатать SQL вместо выполнения: для баз, до которых отсюда не дотянуться")
	flag.Parse()

	if *printSQL {
		if err := emitSQL(os.Stdout); err != nil {
			log.Fatalf("собрать SQL: %v", err)
		}
		return
	}

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

// emitSQL prints what the seeder would do, as SQL.
//
// Идентификаторы не выводятся намеренно: на чужой базе они заняты. Всё, что
// ссылается на пользователя, ищет его по адресу — так скрипт безопасен на базе,
// где уже кто-то живёт, и его можно выполнить дважды.
func emitSQL(out io.Writer) error {
	write := func(format string, args ...any) {
		_, _ = fmt.Fprintf(out, format+"\n", args...)
	}

	write("-- Учётные записи для набора Playwright.")
	write("-- Собрано `go run ./cmd/seed-e2e -sql`; выполнять можно повторно.")
	write("BEGIN;")
	write("")

	for _, a := range accounts {
		email, password := os.Getenv(a.emailVar), os.Getenv(a.passwordVar)
		if email == "" || password == "" {
			return fmt.Errorf("%s и %s должны быть заданы", a.emailVar, a.passwordVar)
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
		if err != nil {
			return fmt.Errorf("хеш пароля для %s: %w", a.key, err)
		}
		write("INSERT INTO users (email, password, name, role, email_verified, onboarding_completed)")
		write("VALUES (%s, %s, %s, %s, true, true)", quote(email), quote(string(hash)), quote(a.name), quote(a.role))
		write("ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password,")
		write("    role = EXCLUDED.role, email_verified = true, onboarding_completed = true;")
		write("")
	}

	curator := quote(os.Getenv("E2E_CURATOR_EMAIL"))
	client := quote(os.Getenv("E2E_CLIENT_EMAIL"))

	write("-- Экраны куратора пусты без назначенного клиента.")
	write("INSERT INTO curator_client_relationships (curator_id, client_id, status)")
	write("SELECT c.id, k.id, 'active' FROM users c, users k")
	write("WHERE c.email = %s AND k.email = %s", curator, client)
	write("ON CONFLICT DO NOTHING;")
	write("")

	write("-- Экранам чата нужна беседа: API заводит её на старте только для")
	write("-- отношений, существовавших до запуска.")
	write("INSERT INTO conversations (curator_id, client_id)")
	write("SELECT c.id, k.id FROM users c, users k")
	write("WHERE c.email = %s AND k.email = %s", curator, client)
	write("  AND NOT EXISTS (SELECT 1 FROM conversations v")
	write("                  WHERE v.curator_id = c.id AND v.client_id = k.id);")
	write("")

	write("-- Без цели по воде блок воды не показывается вовсе.")
	write("INSERT INTO user_settings (user_id, water_goal)")
	write("SELECT id, 8 FROM users WHERE email = %s", client)
	write("ON CONFLICT (user_id) DO UPDATE SET water_goal = EXCLUDED.water_goal;")
	write("")

	write("-- Поиску еды нечего искать в пустом каталоге.")
	write("--")
	write("-- Только в пустом: на dev и проде каталог залит импортом, и там у")
	write("-- products есть столбцы, которых миграции не создают — category_id")
	write("-- обязателен. Дописывать туда учебные пять строк и не нужно, и нечем.")
	// Одной вставкой, а не пятью: условие пустоты проверяется один раз, до
	// строк. Пятью — первая делает таблицу непустой, и остальные четыре молча
	// пропадают. Ровно это и случилось при первой попытке.
	// Категория обязательна: у каждого продукта каталога она есть, и ослаблять
	// это на проде ради учебных записей было бы менять продукт под тест.
	write("INSERT INTO categories (name, slug, type, source_url)")
	write("SELECT 'Проверочная', 'e2e-fixture', 'food', 'https://example.invalid/e2e'")
	write("WHERE NOT EXISTS (SELECT 1 FROM categories);")
	write("")
	write("INSERT INTO products (name, brand, calories, proteins, fats, carbs, source, category_id)")
	write("SELECT t.*, (SELECT id FROM categories ORDER BY id LIMIT 1) FROM (VALUES")
	for i, p := range catalogue {
		comma := ","
		if i == len(catalogue)-1 {
			comma = ""
		}
		write("    (%s, %s, %g::numeric, %g::numeric, %g::numeric, %g::numeric, 'database')%s",
			quote(p.name), quote(p.brand), p.calories, p.proteins, p.fats, p.carbs, comma)
	}
	write(") AS t(name, brand, calories, proteins, fats, carbs, source)")
	write("WHERE NOT EXISTS (SELECT 1 FROM products);")
	write("")
	write("COMMIT;")
	return nil
}

// quote отдаёт строковый литерал PostgreSQL. Одиночная кавычка удваивается —
// иначе имя с апострофом превращает скрипт в чужой запрос.
func quote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
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
//
// Заводятся только в пустой каталог. На dev и проде он заполнен импортом, и
// схема products там отличается от той, что строят миграции: category_id
// обязателен, есть source_url, water, manufacturer, нет barcode. Расхождение
// реальное и описано в docs/operations; сеятелю достаточно его не задевать.
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
	// Пустоту проверяем один раз, до вставок: иначе первая строка делает
	// таблицу непустой и остальные молча пропадают.
	var empty bool
	if err := db.QueryRowContext(ctx,
		`SELECT NOT EXISTS (SELECT 1 FROM products)`).Scan(&empty); err != nil {
		return fmt.Errorf("check catalogue: %w", err)
	}
	if !empty {
		return nil
	}

	// Категория обязательна у каждого продукта каталога.
	var categoryID int64
	if err := db.QueryRowContext(ctx, `
		INSERT INTO categories (name, slug, type, source_url)
		SELECT 'Проверочная', 'e2e-fixture', 'food', 'https://example.invalid/e2e'
		WHERE NOT EXISTS (SELECT 1 FROM categories)
		RETURNING id`).Scan(&categoryID); err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("create fixture category: %w", err)
		}
		if err := db.QueryRowContext(ctx,
			`SELECT id FROM categories ORDER BY id LIMIT 1`).Scan(&categoryID); err != nil {
			return fmt.Errorf("find a category: %w", err)
		}
	}

	for _, p := range catalogue {
		if _, err := db.ExecContext(ctx, `
			INSERT INTO products (name, brand, calories, proteins, fats, carbs, source, category_id)
			VALUES ($1, $2, $3, $4, $5, $6, 'database', $7)`,
			p.name, p.brand, p.calories, p.proteins, p.fats, p.carbs, categoryID); err != nil {
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
