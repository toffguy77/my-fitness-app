//go:build integration

package supportbridge_test

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/burcev/api/internal/modules/supportbridge"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/telegram"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeSender записывает, о чём просили Telegram.
type fakeSender struct {
	mu            sync.Mutex
	created       []string
	closed        []int64
	messages      []string
	nextID        int64
	lastMessageID int64
	failNext      error
	state         telegram.ForumState
}

func (f *fakeSender) CreateForumTopic(_ context.Context, _ int64, name string) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failNext != nil {
		err := f.failNext
		f.failNext = nil
		return 0, err
	}
	f.created = append(f.created, name)
	f.nextID++
	return f.nextID, nil
}

func (f *fakeSender) CloseForumTopic(_ context.Context, _, threadID int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failNext != nil {
		err := f.failNext
		f.failNext = nil
		return err
	}
	f.closed = append(f.closed, threadID)
	return nil
}

func (f *fakeSender) SendToTopic(_ context.Context, _, threadID int64, text string) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.messages = append(f.messages, fmt.Sprintf("%d|%s", threadID, text))
	f.lastMessageID++
	return f.lastMessageID, nil
}

func (f *fakeSender) CheckForum(_ context.Context, _ int64) (telegram.ForumState, error) {
	return f.state, nil
}

func newService(t *testing.T, prefix string, sender *fakeSender) (*supportbridge.Service, *database.DB) {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, prefix)
	return supportbridge.NewService(db.DB, sender, logger.New(), -100390, "https://app.test"), db
}

func client(t *testing.T, db *database.DB, email string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role) VALUES ($1,'x','Клиент','client') RETURNING id`,
		email).Scan(&id))
	return id
}

// Тема заводится один раз на клиента, а не на канал и не на сообщение.
func TestTopicIsCreatedOncePerClient(t *testing.T) {
	sender := &fakeSender{}
	service, db := newService(t, "bridge_topic", sender)
	ctx := context.Background()
	id := client(t, db, "тема@example.test")

	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceTelegram, "первый"))
	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceApp, "второй"))
	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceTelegram, "третий"))

	assert.Len(t, sender.created, 1, "на каждое сообщение завели новую тему")
	assert.Len(t, sender.messages, 3)

	// Все три — в одной теме.
	for _, m := range sender.messages {
		assert.True(t, strings.HasPrefix(m, "1|"), "сообщение ушло не в тему клиента: %s", m)
	}
}

// Источник подписан: от него зависит, куда вернётся ответ.
func TestEachMessageCarriesItsSource(t *testing.T) {
	sender := &fakeSender{}
	service, db := newService(t, "bridge_source", sender)
	ctx := context.Background()
	id := client(t, db, "источник@example.test")

	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceApp, "из приложения"))
	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceTelegram, "из бота"))

	require.Len(t, sender.messages, 2)
	assert.Contains(t, sender.messages[0], "[приложение]")
	assert.Contains(t, sender.messages[1], "[telegram]")
}

// В тему уходит ссылка на карточку, а не показатели.
func TestTopicCarriesALinkNotTheNumbers(t *testing.T) {
	sender := &fakeSender{}
	service, db := newService(t, "bridge_link", sender)
	ctx := context.Background()
	id := client(t, db, "ссылка@example.test")

	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceApp, "вопрос"))

	require.Len(t, sender.messages, 1)
	assert.Contains(t, sender.messages[0], fmt.Sprintf("https://app.test/curator/clients/%d", id))
}

// Имя темы позволяет узнать человека и не несёт показателей.
func TestTopicNameIdentifiesWithoutExposing(t *testing.T) {
	sender := &fakeSender{}
	service, db := newService(t, "bridge_name", sender)
	ctx := context.Background()
	id := client(t, db, "имя@example.test")

	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceApp, "вопрос"))

	require.Len(t, sender.created, 1)
	assert.Contains(t, sender.created[0], "Анна К.")
	assert.Contains(t, sender.created[0], fmt.Sprintf("#%d", id),
		"две тёзки дадут две неразличимые темы")
	for _, leak := range []string{"кг", "вес", "ккал"} {
		assert.NotContains(t, sender.created[0], leak)
	}
}

// Закрытие темы: отметка ставится, и отказ Telegram её не отменяет.
func TestCloseMarksTheTopicEvenIfTelegramRefuses(t *testing.T) {
	sender := &fakeSender{}
	service, db := newService(t, "bridge_close", sender)
	ctx := context.Background()
	id := client(t, db, "закрытие@example.test")
	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceApp, "вопрос"))

	sender.failNext = fmt.Errorf("telegram refused closeForumTopic: topic not found")
	require.NoError(t, service.Close(ctx, id), "отказ Telegram отменил стирание")

	var closed int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM support_topics WHERE client_id = $1 AND closed_at IS NOT NULL`,
		id).Scan(&closed))
	assert.Equal(t, 1, closed, "тема осталась открытой после стирания аккаунта")
}

// Выключенный мост молчит и ничего не ломает.
func TestDisabledBridgeDoesNothing(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "bridge_off")
	sender := &fakeSender{}
	service := supportbridge.NewService(db.DB, sender, logger.New(), 0, "https://app.test")
	ctx := context.Background()
	id := client(t, db, "выкл@example.test")

	assert.False(t, service.Enabled())
	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceApp, "вопрос"))
	require.NoError(t, service.Close(ctx, id))
	require.NoError(t, service.Healthy(ctx))
	assert.Empty(t, sender.created)
}

// Непригодная группа называет причину, а не молчит.
func TestHealthyNamesWhatIsWrong(t *testing.T) {
	ctx := context.Background()
	for name, c := range map[string]struct {
		state telegram.ForumState
		want  string
	}{
		"темы выключены":    {telegram.ForumState{IsForum: false, BotIsAdmin: true, CanManageTopic: true}, "выключены темы"},
		"не администратор":  {telegram.ForumState{IsForum: true, BotIsAdmin: false, CanManageTopic: true}, "не администратор"},
		"нет права на темы": {telegram.ForumState{IsForum: true, BotIsAdmin: true, CanManageTopic: false}, "управлять темами"},
	} {
		t.Run(name, func(t *testing.T) {
			sender := &fakeSender{state: c.state}
			service, _ := newService(t, "bridge_health", sender)

			err := service.Healthy(ctx)

			require.Error(t, err)
			assert.Contains(t, err.Error(), c.want)
		})
	}
}

// Ответ реплаем уходит в канал того сообщения, на которое отвечают.
func TestReplyGoesToTheChannelOfTheMessageAnsweredTo(t *testing.T) {
	sender := &fakeSender{}
	service, db := newService(t, "bridge_reply", sender)
	ctx := context.Background()
	id := client(t, db, "реплай@example.test")

	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceApp, "из приложения"))
	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceTelegram, "из бота"))

	// Первое зеркалированное сообщение — из приложения, второе — из бота.
	var threadID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT thread_id FROM support_topics WHERE client_id = $1`, id).Scan(&threadID))

	target, err := service.TargetFor(ctx, threadID, 1)
	require.NoError(t, err)
	require.NotNil(t, target)
	assert.Equal(t, supportbridge.SourceApp, target.Source, "ответ на сообщение из приложения ушёл бы в Telegram")
	assert.Equal(t, id, target.ClientID)

	target, err = service.TargetFor(ctx, threadID, 2)
	require.NoError(t, err)
	require.NotNil(t, target)
	assert.Equal(t, supportbridge.SourceTelegram, target.Source)
}

// Ответ без реплая уходит туда, откуда пришло последнее сообщение клиента.
func TestReplyWithoutAQuoteFollowsTheLastChannel(t *testing.T) {
	sender := &fakeSender{}
	service, db := newService(t, "bridge_last", sender)
	ctx := context.Background()
	id := client(t, db, "последний@example.test")

	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceTelegram, "из бота"))
	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceApp, "потом из приложения"))

	var threadID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT thread_id FROM support_topics WHERE client_id = $1`, id).Scan(&threadID))

	target, err := service.TargetFor(ctx, threadID, 0)

	require.NoError(t, err)
	require.NotNil(t, target)
	assert.Equal(t, supportbridge.SourceApp, target.Source, "ответ ушёл не в тот канал, где человек сейчас")
}

// Реплай на постороннее сообщение не теряет клиента: тема его знает.
func TestReplyToSomethingElseStillFindsTheClient(t *testing.T) {
	sender := &fakeSender{}
	service, db := newService(t, "bridge_stray", sender)
	ctx := context.Background()
	id := client(t, db, "постороннее@example.test")
	require.NoError(t, service.Relay(ctx, id, "Анна К.", supportbridge.SourceApp, "вопрос"))

	var threadID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT thread_id FROM support_topics WHERE client_id = $1`, id).Scan(&threadID))

	target, err := service.TargetFor(ctx, threadID, 9999)

	require.NoError(t, err)
	require.NotNil(t, target)
	assert.Equal(t, id, target.ClientID)
}

// Сообщение в теме, которой нет, никого не адресует.
func TestUnknownTopicHasNoTarget(t *testing.T) {
	sender := &fakeSender{}
	service, _ := newService(t, "bridge_unknown", sender)

	target, err := service.TargetFor(context.Background(), 777, 0)

	require.NoError(t, err)
	assert.Nil(t, target)
}
