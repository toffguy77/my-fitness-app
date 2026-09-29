// Command free-existing-clients переводит живых клиентов в бесплатные.
//
// Разовая работа перед объявлением платного доступа: до неё у клиентов,
// заведённых прежним автоназначением, связь с куратором бессрочная — то есть
// платная услуга остаётся у них навсегда. Решение владельца продукта: доступ
// снять, о снятии предупредить, переписку сохранить.
//
//	DATABASE_URL=... go run ./cmd/free-existing-clients            # сухой прогон
//	DATABASE_URL=... go run ./cmd/free-existing-clients -apply     # выполнить
//
// Сухой прогон — поведение по умолчанию: он печатает, кого затронет, и ничего
// не меняет. Обратной команды нет, а список перед глазами стоит дешевле, чем
// выданные заново пятнадцать доступов.
//
// Почему команда, а не SQL-миграция: живых клиентов нужно отличить от служебных
// учётных записей прогона, а шаблон таких записей объявлен один раз в
// internal/shared/testaccounts и уже повторён в двух местах, где Go не позвать,
// под охраной TestPatternMatchesTooling. Миграция стала бы третьей копией —
// ровно тем расхождением, которое этот сторож заведён предотвращать. Здесь Go
// позвать можно, и шаблон берётся из первоисточника.
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/curatoraccess"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/testaccounts"
)

// affected — связь, которую команда собирается снять.
type affected struct {
	clientID     int64
	clientEmail  string
	curatorID    int64
	curatorEmail string
}

// live возвращает действующие связи живых клиентов.
//
// Служебные учётные записи прогона пропускаются: без куратора набор сквозных
// проверок упёрся бы в собственный платный доступ. Решает это
// testaccounts.IsTest, а не условие в SQL.
func live(ctx context.Context, db *sql.DB) ([]affected, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT r.client_id, c.email, r.curator_id, u.email
		  FROM curator_client_relationships r
		  JOIN users c ON c.id = r.client_id
		  JOIN users u ON u.id = r.curator_id
		 WHERE r.status = 'active'
		   AND c.deleted_at IS NULL
		 ORDER BY c.email`)
	if err != nil {
		return nil, fmt.Errorf("действующие связи: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var out []affected
	for rows.Next() {
		var a affected
		if err := rows.Scan(&a.clientID, &a.clientEmail, &a.curatorID, &a.curatorEmail); err != nil {
			return nil, fmt.Errorf("чтение связи: %w", err)
		}
		if testaccounts.IsTest(a.clientEmail) {
			continue
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("обход связей: %w", err)
	}
	return out, nil
}

func main() {
	apply := flag.Bool("apply", false, "выполнить снятие; без него — сухой прогон")
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	raw, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("подключение: %v", err)
	}
	defer func() { _ = raw.Close() }()
	if err := raw.PingContext(ctx); err != nil {
		log.Fatalf("база недоступна: %v", err)
	}

	// Имя базы печатается всегда: DATABASE_URL берётся из окружения, а окружение
	// переживает смену задачи.
	var dbName string
	if err := raw.QueryRowContext(ctx, `SELECT current_database()`).Scan(&dbName); err != nil {
		log.Fatalf("имя базы: %v", err)
	}
	fmt.Printf("база: %s\n", dbName)

	targets, err := live(ctx, raw)
	if err != nil {
		log.Fatalf("%v", err)
	}
	if len(targets) == 0 {
		fmt.Println("живых клиентов с действующим доступом нет — делать нечего")
		return
	}

	fmt.Printf("клиентов с действующим доступом: %d\n", len(targets))
	for _, a := range targets {
		fmt.Printf("  %s (куратор %s)\n", a.clientEmail, a.curatorEmail)
	}

	if !*apply {
		fmt.Println("\nсухой прогон: ничего не изменено. Повторите с -apply")
		return
	}

	db := &database.DB{DB: raw}
	log := logger.New()
	notifier := notifications.NewService(db, log)

	for _, a := range targets {
		if _, err := raw.ExecContext(ctx, `
			UPDATE curator_client_relationships
			   SET status = $1, updated_at = now()
			 WHERE client_id = $2 AND status = $3`,
			curatoraccess.StatusInactive, a.clientID, curatoraccess.StatusActive); err != nil {
			log.Errorw("Не удалось снять доступ", "error", err, "client_id", a.clientID)
			continue
		}

		// Тот же механизм, что при истечении срока: молча исчезнувший куратор
		// читается как поломка сервиса, а куратор, не знающий о прекращении,
		// продолжает работу, за которую больше не платят.
		if err := notifier.Notify(ctx, a.clientID,
			string(notifications.TypeCuratorAccessEnded),
			"Доступ к куратору закончился",
			"Переписка с куратором осталась доступной для чтения. Продлите доступ, чтобы снова писать.",
			"/pricing"); err != nil {
			log.Errorw("Не удалось уведомить клиента", "error", err, "client_id", a.clientID)
		}
		if err := notifier.Notify(ctx, a.curatorID,
			string(notifications.TypeCuratorAccessEnded),
			"У клиента закончился доступ",
			"Клиент больше не может писать вам, пока не продлит доступ.",
			"/curator/chat"); err != nil {
			log.Errorw("Не удалось уведомить куратора", "error", err, "curator_id", a.curatorID)
		}

		fmt.Printf("снят доступ: %s\n", a.clientEmail)
	}

	fmt.Printf("\nготово: обработано %d\n", len(targets))
	fmt.Println("переписки сохранены и доступны для чтения")
}
