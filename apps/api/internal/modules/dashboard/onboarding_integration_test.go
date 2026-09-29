//go:build integration

package dashboard

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The first-week checklist against the real schema.
//
// Every condition here is a claim about the schema rather than about Go: whether
// `created_by` distinguishes a client's own entry from one their curator made
// for them, whether `anonymized_at` hides an erased conversation. sqlmock would
// confirm whichever SQL we happened to write, so these run against a database.
//
// Run with:
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 ./internal/modules/dashboard/

func onboardingSchema(t *testing.T) *database.DB {
	t.Helper()
	return testsupport.SchemaWithMigrations(t, "onboarding")
}

func onboardingService(db *database.DB) *Service {
	return NewService(db, logger.New(), nil, nil)
}

var accountSeq int

// account creates a user the way registration does, registered `age` ago.
func account(t *testing.T, db *database.DB, role string, age time.Duration) int64 {
	t.Helper()
	accountSeq++

	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role, created_at, updated_at)
		 VALUES ($1, 'x', 'Кто-то', $2, NOW() - $3::interval, NOW()) RETURNING id`,
		fmt.Sprintf("onboarding-%d-%d@burcev.example", os.Getpid(), accountSeq),
		role,
		fmt.Sprintf("%d seconds", int(age.Seconds())),
	).Scan(&id))

	_, err := db.ExecContext(context.Background(),
		`INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, id)
	require.NoError(t, err)

	return id
}

// client is the common case: a client registered an hour ago.
func client(t *testing.T, db *database.DB) int64 {
	t.Helper()
	return account(t, db, "client", time.Hour)
}

func fillProfile(t *testing.T, db *database.DB, userID int64) {
	t.Helper()
	_, err := db.ExecContext(context.Background(),
		`UPDATE user_settings
		 SET birth_date = '1990-01-01', biological_sex = 'male', height = 180
		 WHERE user_id = $1`, userID)
	require.NoError(t, err)
}

// someFood gives food_entries something to point at: food_id is NOT NULL and
// references food_items.
func someFood(t *testing.T, db *database.DB) string {
	t.Helper()
	var id string
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO food_items (name, category, calories_per_100)
		 VALUES ('Овсянка', 'grains', 380) RETURNING id`).Scan(&id))
	return id
}

// logMeal writes a food entry. createdBy nil is the ordinary tracker path,
// which leaves the column NULL; a value is the chat path, where a curator turns
// a client's message into an entry.
func logMeal(t *testing.T, db *database.DB, userID int64, createdBy *int64) {
	t.Helper()
	foodID := someFood(t, db)
	_, err := db.ExecContext(context.Background(),
		`INSERT INTO food_entries
		   (user_id, food_id, food_name, meal_type, portion_type, portion_amount,
		    calories, protein, fat, carbs, time, date, created_by)
		 VALUES ($1, $2, 'Овсянка', 'breakfast', 'grams', 100,
		         380, 12, 6, 65, '08:00', CURRENT_DATE, $3)`,
		userID, foodID, createdBy)
	require.NoError(t, err)
}

func recognisePlate(t *testing.T, db *database.DB, userID int64) {
	t.Helper()
	_, err := db.ExecContext(context.Background(),
		`INSERT INTO food_recognition_usage (user_id, foods_count) VALUES ($1, 2)`, userID)
	require.NoError(t, err)
}

// conversation pairs a client with a curator. anonymised marks the relationship
// as erased.
func conversation(t *testing.T, db *database.DB, clientID, curatorID int64, anonymised bool) string {
	t.Helper()
	var id string
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO conversations (client_id, curator_id, anonymized_at)
		 VALUES ($1, $2, CASE WHEN $3 THEN NOW() ELSE NULL END) RETURNING id`,
		clientID, curatorID, anonymised).Scan(&id))
	return id
}

// grantAccess выдаёт право на работу с куратором — то, что теперь покупается.
//
// Без него пункт знакомства с куратором в чек-лист не попадает вовсе: задание,
// заведомо оканчивающееся отказом, человеку не предлагается.
func grantAccess(t *testing.T, db *database.DB, clientID, curatorID int64) {
	t.Helper()
	_, err := db.ExecContext(context.Background(),
		`INSERT INTO curator_client_relationships (curator_id, client_id, status, access_expires_at)
		 VALUES ($1, $2, 'active', CURRENT_DATE + 30)`, curatorID, clientID)
	require.NoError(t, err)
}

func say(t *testing.T, db *database.DB, conversationID string, senderID int64, text string) {
	t.Helper()
	_, err := db.ExecContext(context.Background(),
		`INSERT INTO messages (conversation_id, sender_id, type, content)
		 VALUES ($1, $2, 'text', $3)`, conversationID, senderID, text)
	require.NoError(t, err)
}

func stepDone(t *testing.T, state *OnboardingState, key OnboardingStepKey) bool {
	t.Helper()
	for _, step := range state.Steps {
		if step.Key == key {
			return step.Done
		}
	}
	t.Fatalf("step %q is not in the answer: %+v", key, state.Steps)
	return false
}

func hasStep(state *OnboardingState, key OnboardingStepKey) bool {
	for _, step := range state.Steps {
		if step.Key == key {
			return true
		}
	}
	return false
}

// --- 1.2 profile ---

func TestOnboarding_ProfileFilled(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	fillProfile(t, db, userID)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.True(t, stepDone(t, state, OnboardingStepProfile))
}

func TestOnboarding_ProfileEmpty(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.False(t, stepDone(t, state, OnboardingStepProfile))
}

// A partly filled profile is not a filled one: the calculation needs all three.
func TestOnboarding_ProfilePartlyFilled(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	_, err := db.ExecContext(context.Background(),
		`UPDATE user_settings SET height = 180 WHERE user_id = $1`, userID)
	require.NoError(t, err)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.False(t, stepDone(t, state, OnboardingStepProfile))
}

// --- 1.3 the curator's work is not credited to the client ---

// The defect this guards: without the created_by condition, somebody who never
// opened the tracker gets a tick for an entry their curator made for them.
func TestOnboarding_FirstMealMadeByCuratorDoesNotCount(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	logMeal(t, db, userID, &curatorID)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.False(t, stepDone(t, state, OnboardingStepFirstMeal),
		"an entry created by the curator is the curator's work, not the client's")
}

func TestOnboarding_FirstMealMadeByTrackerCounts(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	logMeal(t, db, userID, nil) // the ordinary tracker path leaves created_by NULL

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.True(t, stepDone(t, state, OnboardingStepFirstMeal))
}

func TestOnboarding_FirstMealMadeByTheClientThemselvesCounts(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	logMeal(t, db, userID, &userID)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.True(t, stepDone(t, state, OnboardingStepFirstMeal))
}

func TestOnboarding_NoMealsAtAll(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.False(t, stepDone(t, state, OnboardingStepFirstMeal))
}

// --- 1.4 knowing the curator means writing to them ---

func TestOnboarding_OnlyTheCuratorWrote(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	grantAccess(t, db, userID, curatorID)
	conv := conversation(t, db, userID, curatorID, false)
	say(t, db, conv, curatorID, "Здравствуйте!")

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.False(t, stepDone(t, state, OnboardingStepCuratorHello),
		"being greeted is not knowing someone")
}

func TestOnboarding_ClientWrote(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	grantAccess(t, db, userID, curatorID)
	conv := conversation(t, db, userID, curatorID, false)
	say(t, db, conv, curatorID, "Здравствуйте!")
	say(t, db, conv, userID, "Здравствуйте, я готов")

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.True(t, stepDone(t, state, OnboardingStepCuratorHello))
}

func TestOnboarding_MessagesOnlyInAnonymisedConversation(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	grantAccess(t, db, userID, curatorID)
	conv := conversation(t, db, userID, curatorID, true)
	say(t, db, conv, userID, "Это было в прошлой жизни")

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.False(t, stepDone(t, state, OnboardingStepCuratorHello),
		"an erased relationship's messages must not count")
}

// --- 1.5 the plate-photo task follows the capability, in both directions ---

func TestOnboarding_PlatePhotoAbsentWhenCapabilityOff(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, false)
	require.NoError(t, err)

	assert.False(t, hasStep(state, OnboardingStepPlatePhoto),
		"a task that would end in the capability's 503 must not be offered")
	// Два пункта, а не три: у этого клиента нет права на куратора, значит нет и
	// пункта знакомства с ним.
	assert.Len(t, state.Steps, 2)
}

// The other direction is the one that matters: a guard tested only in its
// disabled state passes just as well when the capability never turns on.
func TestOnboarding_PlatePhotoPresentWhenCapabilityOn(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.True(t, hasStep(state, OnboardingStepPlatePhoto))
	assert.Len(t, state.Steps, 3, "пункта знакомства с куратором нет: права на куратора у клиента нет")
	assert.False(t, stepDone(t, state, OnboardingStepPlatePhoto))
}

func TestOnboarding_PlatePhotoDoneAfterRecognition(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	recognisePlate(t, db, userID)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.True(t, stepDone(t, state, OnboardingStepPlatePhoto))
}

// With the capability off, completeness is judged on the remaining tasks — so a
// person who did everything reachable is done, not stuck at three of four.
func TestOnboarding_CompleteWithoutTheDisabledTask(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	fillProfile(t, db, userID)
	logMeal(t, db, userID, nil)
	conv := conversation(t, db, userID, curatorID, false)
	say(t, db, conv, userID, "Привет")

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, false)
	require.NoError(t, err)

	assert.False(t, state.Active, "everything reachable is done")
}

// --- 1.6 when the checklist applies ---

func TestOnboarding_ActiveOnDayThreeWithTasksLeft(t *testing.T) {
	db := onboardingSchema(t)
	userID := account(t, db, "client", 3*24*time.Hour)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.True(t, state.Active)
}

func TestOnboarding_NotActiveOnDayEightWithTasksLeft(t *testing.T) {
	db := onboardingSchema(t)
	userID := account(t, db, "client", 8*24*time.Hour)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.False(t, state.Active, "the checklist is not a permanent reproach")
}

func TestOnboarding_NotActiveWhenEverythingDoneOnDayOne(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	fillProfile(t, db, userID)
	logMeal(t, db, userID, nil)
	recognisePlate(t, db, userID)
	conv := conversation(t, db, userID, curatorID, false)
	say(t, db, conv, userID, "Привет")

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.False(t, state.Active)
}

// --- 1.7 the curator block ---

func TestOnboarding_CuratorPresence(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	_, err := db.ExecContext(context.Background(),
		`UPDATE users SET name = 'Анна', avatar_url = 'https://example.test/a.jpg' WHERE id = $1`,
		curatorID)
	require.NoError(t, err)

	conv := conversation(t, db, userID, curatorID, false)
	say(t, db, conv, userID, "Здравствуйте")
	say(t, db, conv, curatorID, "Посмотрела ваш дневник")

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	require.NotNil(t, state.Curator)
	assert.Equal(t, "Анна", state.Curator.Name)
	assert.Equal(t, "https://example.test/a.jpg", state.Curator.AvatarURL)
	assert.Equal(t, conv, state.Curator.ConversationID)
	require.NotNil(t, state.Curator.LastMessage)
	assert.Equal(t, "Посмотрела ваш дневник", state.Curator.LastMessage.Text)
	assert.True(t, state.Curator.LastMessage.FromCurator)
	assert.Equal(t, 1, state.Curator.UnreadCount, "the curator's message is unread")
}

func TestOnboarding_CuratorPresenceOwnLastMessage(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	conv := conversation(t, db, userID, curatorID, false)
	say(t, db, conv, curatorID, "Здравствуйте")
	say(t, db, conv, userID, "Спасибо!")

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	require.NotNil(t, state.Curator)
	require.NotNil(t, state.Curator.LastMessage)
	assert.False(t, state.Curator.LastMessage.FromCurator,
		"saying the client's own message came from the curator misreports the conversation")
}

// A conversation without messages is a normal state, not a missing curator.
func TestOnboarding_CuratorWithoutMessages(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	conversation(t, db, userID, curatorID, false)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	require.NotNil(t, state.Curator)
	assert.Nil(t, state.Curator.LastMessage)
	assert.Equal(t, 0, state.Curator.UnreadCount)
}

func TestOnboarding_NoCuratorAssigned(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.Nil(t, state.Curator,
		"no curator is a fact the dashboard states, so it arrives as an explicit absence")
}

// An erased relationship is not a curator either.
func TestOnboarding_AnonymisedConversationIsNotACurator(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	conversation(t, db, userID, curatorID, true)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.Nil(t, state.Curator)
}

// --- право на куратора определяет и состав чек-листа, и состояние карточки ---

// Задание, заведомо оканчивающееся отказом, человеку не предлагается — тем же
// правилом, каким из состава выпадает пункт отключённой способности.
func TestOnboarding_CuratorHelloAbsentWithoutAccess(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	// Переписка есть, а права нет: так выглядит клиент, у которого оплата
	// кончилась. Пункт всё равно не предлагается.
	conv := conversation(t, db, userID, curatorID, false)
	say(t, db, conv, curatorID, "Здравствуйте!")

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.False(t, hasStep(state, OnboardingStepCuratorHello))
	assert.False(t, state.CuratorAccess.Allowed)
}

func TestOnboarding_CuratorHelloPresentWithAccess(t *testing.T) {
	db := onboardingSchema(t)
	userID := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	grantAccess(t, db, userID, curatorID)

	state, err := onboardingService(db).GetOnboardingState(context.Background(), userID, true)
	require.NoError(t, err)

	assert.True(t, hasStep(state, OnboardingStepCuratorHello))
	assert.True(t, state.CuratorAccess.Allowed)
	assert.NotEmpty(t, state.CuratorAccess.ExpiresAt, "срок нужен, чтобы предложить продление вовремя")
}

// Отсутствие куратора и истёкшее право — разные состояния: первому нужно
// предложение купить, второму — предложение продлить и доступ к переписке.
func TestOnboarding_ExpiredAccessDiffersFromNever(t *testing.T) {
	db := onboardingSchema(t)
	ctx := context.Background()

	never := client(t, db)
	neverState, err := onboardingService(db).GetOnboardingState(ctx, never, true)
	require.NoError(t, err)
	assert.False(t, neverState.CuratorAccess.Allowed)
	assert.False(t, neverState.CuratorAccess.Expired, "куратора никогда не было")

	expired := client(t, db)
	curatorID := account(t, db, "coordinator", time.Hour)
	_, err = db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status, access_expires_at)
		 VALUES ($1, $2, 'active', CURRENT_DATE - 1)`, curatorID, expired)
	require.NoError(t, err)

	expiredState, err := onboardingService(db).GetOnboardingState(ctx, expired, true)
	require.NoError(t, err)
	assert.False(t, expiredState.CuratorAccess.Allowed)
	assert.True(t, expiredState.CuratorAccess.Expired)
}
