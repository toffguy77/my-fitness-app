//go:build integration

package analytics_test

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/burcev/api/internal/modules/analytics"
	"github.com/burcev/api/internal/modules/chat"
	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Кто именно отправляет два перенесённых события — против настоящей схемы.
//
// Проверяется не «служба позвала получателя», а что в таблице появилась строка:
// подменённый получатель подтвердил бы вызов и на неверном условии, а вопрос
// здесь ровно в условии — чья это была запись и кто написал первым.
//
// Run with:
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 ./internal/modules/analytics/

var callerSeq int

func account(t *testing.T, db *database.DB, role string) int64 {
	t.Helper()
	callerSeq++
	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role)
		 VALUES ($1, 'x', 'Кто-то', $2) RETURNING id`,
		fmt.Sprintf("callers-%d-%d@burcev.example", os.Getpid(), callerSeq), role).Scan(&id))
	return id
}

func someFood(t *testing.T, db *database.DB) string {
	t.Helper()
	var id string
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO food_items (name, category, calories_per_100)
		 VALUES ('Овсянка', 'grains', 380) RETURNING id`).Scan(&id))
	return id
}

// --- первая запись о еде ---

func TestFoodTracker_RecordsTheFirstEntryOnce(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "caller_food")
	events := analytics.NewService(db.DB, logger.New())
	service := foodtracker.NewService(db, logger.New()).WithAnalytics(events)
	userID := account(t, db, "client")
	foodID := someFood(t, db)
	ctx := context.Background()

	entry := func() *foodtracker.CreateEntryRequest {
		return &foodtracker.CreateEntryRequest{
			FoodID:        foodID,
			MealType:      "breakfast",
			PortionType:   "grams",
			PortionAmount: 100,
			Time:          "08:00",
			Date:          "2026-09-27",
		}
	}

	_, err := service.CreateEntry(ctx, userID, entry())
	require.NoError(t, err)
	assert.Equal(t, 1, countEvents(t, db, userID, analytics.EventFirstFoodEntry),
		"первая запись о еде — это факт, и до сих пор он не приходил ни разу")

	// Вторая запись второго события не даёт.
	_, err = service.CreateEntry(ctx, userID, entry())
	require.NoError(t, err)
	assert.Equal(t, 1, countEvents(t, db, userID, analytics.EventFirstFoodEntry))
}

// Без получателя служба работает как раньше: аналитика не может быть причиной,
// по которой не сохранилась еда.
func TestFoodTracker_WorksWithoutARecorder(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "caller_food_none")
	service := foodtracker.NewService(db, logger.New())
	userID := account(t, db, "client")
	foodID := someFood(t, db)

	_, err := service.CreateEntry(context.Background(), userID, &foodtracker.CreateEntryRequest{
		FoodID:        foodID,
		MealType:      "lunch",
		PortionType:   "grams",
		PortionAmount: 150,
		Time:          "13:00",
		Date:          "2026-09-27",
	})

	require.NoError(t, err)
	assert.Equal(t, 0, countEvents(t, db, userID, analytics.EventFirstFoodEntry))
}

// Запись, сделанную куратором из переписки, человеку не зачитываем: это её
// работа, а не его. Путь куратора пишет в food_entries своим запросом и через
// службу трекера не проходит — тест закрепляет, что так и остаётся.
func TestChat_CuratorsEntryIsNotTheClientsFirst(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "caller_curator_entry")
	events := analytics.NewService(db.DB, logger.New())
	chatService := chat.NewService(db, logger.New()).WithAnalytics(events)
	clientID := account(t, db, "client")
	curatorID := account(t, db, "coordinator")
	ctx := context.Background()

	conv, err := chatService.GetOrCreateConversation(ctx, clientID, curatorID)
	require.NoError(t, err)

	// Запись за клиента куратор делает только при действующей связи — так же,
	// как на проде.
	_, err = db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status)
		 VALUES ($1, $2, 'active')`, curatorID, clientID)
	require.NoError(t, err)

	// Куратор превращает сообщение клиента в запись о еде.
	_, err = chatService.CreateFoodEntryFromChat(ctx, conv.ID, curatorID, chat.CreateFoodEntryRequest{
		FoodName: "Овсянка", MealType: "breakfast", Weight: 100,
		Calories: 380, Protein: 12, Fat: 6, Carbs: 65,
	})
	require.NoError(t, err)

	// Запись в дневнике появилась...
	var entries int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM food_entries WHERE user_id = $1`, clientID).Scan(&entries))
	assert.Equal(t, 1, entries)

	// ...а «первой записью человека» не считается.
	assert.Equal(t, 0, countEvents(t, db, clientID, analytics.EventFirstFoodEntry),
		"еду записал куратор — человеку это не зачитывается")
}

// --- первое сообщение куратору ---

func strptr(s string) *string { return &s }

func TestChat_RecordsTheClientsFirstMessageOnce(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "caller_chat")
	events := analytics.NewService(db.DB, logger.New())
	service := chat.NewService(db, logger.New()).WithAnalytics(events)
	clientID := account(t, db, "client")
	curatorID := account(t, db, "coordinator")
	ctx := context.Background()

	conv, err := service.GetOrCreateConversation(ctx, clientID, curatorID)
	require.NoError(t, err)

	_, err = service.SendMessage(ctx, conv.ID, clientID, chat.SendMessageRequest{
		Type: "text", Content: strptr("Здравствуйте!"),
	})
	require.NoError(t, err)
	assert.Equal(t, 1, countEvents(t, db, clientID, analytics.EventFirstMessage))

	_, err = service.SendMessage(ctx, conv.ID, clientID, chat.SendMessageRequest{
		Type: "text", Content: strptr("И ещё вопрос"),
	})
	require.NoError(t, err)
	assert.Equal(t, 1, countEvents(t, db, clientID, analytics.EventFirstMessage),
		"второе сообщение второго события не даёт")
}

// Полученное приветствие знакомством не считается.
func TestChat_CuratorsMessageIsNotTheClientsFirst(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "caller_chat_curator")
	events := analytics.NewService(db.DB, logger.New())
	service := chat.NewService(db, logger.New()).WithAnalytics(events)
	clientID := account(t, db, "client")
	curatorID := account(t, db, "coordinator")
	ctx := context.Background()

	conv, err := service.GetOrCreateConversation(ctx, clientID, curatorID)
	require.NoError(t, err)

	_, err = service.SendMessage(ctx, conv.ID, curatorID, chat.SendMessageRequest{
		Type: "text", Content: strptr("Здравствуйте, я ваш куратор"),
	})
	require.NoError(t, err)

	assert.Equal(t, 0, countEvents(t, db, clientID, analytics.EventFirstMessage))
	assert.Equal(t, 0, countEvents(t, db, curatorID, analytics.EventFirstMessage),
		"куратор не знакомится сам с собой")
}
