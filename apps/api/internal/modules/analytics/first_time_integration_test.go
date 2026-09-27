//go:build integration

package analytics_test

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/burcev/api/internal/modules/analytics"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Событие, случающееся однажды, — против настоящей схемы.
//
// Утверждение здесь о поведении базы: вставка с `NOT EXISTS` по паре
// «пользователь и имя». Подменённый драйвер подтвердил бы любой запрос, который
// мы напишем, — а прежняя версия этого признака жила отметкой в localStorage и
// врала при смене устройства.
//
// Run with:
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 ./internal/modules/analytics/

var seq int

func somebody(t *testing.T, db *database.DB) int64 {
	t.Helper()
	seq++
	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role)
		 VALUES ($1, 'x', 'Кто-то', 'client') RETURNING id`,
		fmt.Sprintf("firsttime-%d-%d@burcev.example", os.Getpid(), seq)).Scan(&id))
	return id
}

func countEvents(t *testing.T, db *database.DB, userID int64, name string) int {
	t.Helper()
	var n int
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM analytics_events WHERE user_id = $1 AND name = $2`,
		userID, name).Scan(&n))
	return n
}

func TestRecordFirstTimeEvent_WritesOnceAndOnlyOnce(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "firsttime")
	service := analytics.NewService(db.DB, logger.New())
	userID := somebody(t, db)
	ctx := context.Background()

	service.RecordFirstTimeEvent(ctx, analytics.EventFirstFoodEntry, userID)
	assert.Equal(t, 1, countEvents(t, db, userID, analytics.EventFirstFoodEntry))

	// Второй, третий и четвёртый раз ничего не добавляют — независимо от того,
	// что помнит или не помнит браузер.
	service.RecordFirstTimeEvent(ctx, analytics.EventFirstFoodEntry, userID)
	service.RecordFirstTimeEvent(ctx, analytics.EventFirstFoodEntry, userID)
	assert.Equal(t, 1, countEvents(t, db, userID, analytics.EventFirstFoodEntry))
}

// Разные имена не мешают друг другу: «первая запись о еде» и «первое сообщение
// куратору» — два разных признака.
func TestRecordFirstTimeEvent_KeepsNamesApart(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "firsttime_names")
	service := analytics.NewService(db.DB, logger.New())
	userID := somebody(t, db)
	ctx := context.Background()

	service.RecordFirstTimeEvent(ctx, analytics.EventFirstFoodEntry, userID)
	service.RecordFirstTimeEvent(ctx, analytics.EventFirstMessage, userID)

	assert.Equal(t, 1, countEvents(t, db, userID, analytics.EventFirstFoodEntry))
	assert.Equal(t, 1, countEvents(t, db, userID, analytics.EventFirstMessage))
}

// Разные люди — разные первые разы.
func TestRecordFirstTimeEvent_KeepsPeopleApart(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "firsttime_people")
	service := analytics.NewService(db.DB, logger.New())
	first := somebody(t, db)
	second := somebody(t, db)
	ctx := context.Background()

	service.RecordFirstTimeEvent(ctx, analytics.EventFirstFoodEntry, first)
	service.RecordFirstTimeEvent(ctx, analytics.EventFirstFoodEntry, second)

	assert.Equal(t, 1, countEvents(t, db, first, analytics.EventFirstFoodEntry))
	assert.Equal(t, 1, countEvents(t, db, second, analytics.EventFirstFoodEntry))
}

// Неизвестное имя не вставляется: словарь — единственный источник имён, и
// свободная строка превращается в словарь опечаток за месяц.
func TestRecordFirstTimeEvent_RefusesAnUnknownName(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "firsttime_unknown")
	service := analytics.NewService(db.DB, logger.New())
	userID := somebody(t, db)

	service.RecordFirstTimeEvent(context.Background(), "made_up_first_thing", userID)

	assert.Equal(t, 0, countEvents(t, db, userID, "made_up_first_thing"))
}

// Событие с настоящей схемой пишется целиком: `platform` — серверная,
// `properties` — пустой объект, а не NULL, иначе запросы по свойствам
// спотыкаются на этой строке.
func TestRecordFirstTimeEvent_WritesAServerShapedRow(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "firsttime_shape")
	service := analytics.NewService(db.DB, logger.New())
	userID := somebody(t, db)

	service.RecordFirstTimeEvent(context.Background(), analytics.EventFirstMessage, userID)

	var platform string
	var properties string
	var visitorPresent bool
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT platform, properties::text, visitor_id IS NOT NULL
		   FROM analytics_events WHERE user_id = $1 AND name = $2`,
		userID, analytics.EventFirstMessage).Scan(&platform, &properties, &visitorPresent))

	assert.Equal(t, "server", platform)
	assert.Equal(t, "{}", properties)
	assert.True(t, visitorPresent, "идентификатор посетителя обязателен: по нему привязывается рекламная конверсия")
}
