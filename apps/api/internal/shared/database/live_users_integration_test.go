//go:build integration

package database_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/burcev/api/internal/shared/testaccounts"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Представление live_users обязано отбирать ровно то же, что testaccounts.IsTest.
//
// Правило живёт в двух местах не по недосмотру: в Go его спрашивают при
// назначении куратора и смене роли, а в SQL — все отчёты, которые пишут не из
// Go. Две копии одного правила расходятся молча, и расхождение здесь означает
// отчёт, тихо считающий прогоны за людей.
//
// Поэтому тест не повторяет шаблон, а прогоняет одни и те же адреса через обе
// стороны и сравнивает ответы. Переписать шаблон в одном месте и забыть про
// второе теперь нельзя.
//
// Run with: go test -tags=integration ./internal/shared/database/
func TestLiveUsersViewMatchesIsTest(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "live_users")
	ctx := context.Background()

	emails := []string{
		// Служебные: домен, которого нет в интернете.
		"e2e-run-1@burcev.test",
		"whatever@burcev.test",
		"WhatEver@Burcev.Test",
		// Служебные: приставка прогона на настоящем домене.
		"e2e-client@burcev.team",
		"E2E-Curator@burcev.team",
		// Живые: приставка без домена продукта — чужой адрес, не наш прогон.
		"e2e-client@example.com",
		// Живые: домен продукта без приставки — это сотрудник.
		"anna@burcev.team",
		// Живые: обычные люди.
		"person@example.com",
		"someone@mail.ru",
		// Край: пробелы по краям адрес не меняют.
		"  e2e-run-2@burcev.test  ",
	}

	for i, email := range emails {
		_, err := db.ExecContext(ctx,
			`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', $2, 'client')`,
			email, fmt.Sprintf("Проверка %d", i))
		require.NoError(t, err, "не удалось завести %q", email)
	}

	rows, err := db.QueryContext(ctx, `SELECT email FROM live_users ORDER BY email`)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	inView := map[string]bool{}
	for rows.Next() {
		var email string
		require.NoError(t, rows.Scan(&email))
		inView[email] = true
	}
	require.NoError(t, rows.Err())

	for _, email := range emails {
		wantVisible := !testaccounts.IsTest(email)
		assert.Equal(t, wantVisible, inView[email],
			"адрес %q: IsTest=%v, а представление показывает его = %v — правила разошлись",
			email, testaccounts.IsTest(email), inView[email])
	}
}

// Анонимную часть воронки терять нельзя: в ней происходит почти всё, что
// интересно, и именно её съел бы наивный JOIN к users.
func TestLiveAnalyticsEventsKeepsAnonymous(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "live_events")
	ctx := context.Background()

	var liveID, testID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('person@example.com','x','Человек','client') RETURNING id`,
	).Scan(&liveID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('e2e-run@burcev.test','x','Прогон','client') RETURNING id`,
	).Scan(&testID))

	insert := func(name string, userID *int64) {
		_, err := db.ExecContext(ctx, `
			INSERT INTO analytics_events (name, visitor_id, user_id, platform, properties)
			VALUES ($1, gen_random_uuid(), $2, 'web', '{}'::jsonb)`, name, userID)
		require.NoError(t, err)
	}

	insert("landing_viewed", nil) // аноним — обязан остаться
	insert("signed_in", &liveID)  // живой — обязан остаться
	insert("signed_in", &testID)  // прогон — обязан исчезнуть

	var anonymous, live, fromTest int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT COUNT(*) FILTER (WHERE user_id IS NULL),
		       COUNT(*) FILTER (WHERE user_id = $1),
		       COUNT(*) FILTER (WHERE user_id = $2)
		FROM live_analytics_events`, liveID, testID,
	).Scan(&anonymous, &live, &fromTest))

	assert.Equal(t, 1, anonymous, "анонимное событие пропало — воронка до регистрации обрезана")
	assert.Equal(t, 1, live, "событие живого пользователя пропало")
	assert.Equal(t, 0, fromTest, "событие прогона просочилось в расчёты")
}
