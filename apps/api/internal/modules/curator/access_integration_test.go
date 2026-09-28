//go:build integration

package curator_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/curatoraccess"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Прекращение права и предупреждение о нём — против настоящей схемы.
//
// Уведомления проверяются по строкам в таблице, а не по подмене: перечисление
// типов охраняется ограничением базы, и незаявленный тип — отказ вставки, то
// есть уведомление, которое не придёт никому. Подмена показала бы зелёное
// именно в этом случае.

type expirySpy struct {
	events []spiedEvent
}

type spiedEvent struct {
	name   string
	userID int64
	props  map[string]any
}

func (s *expirySpy) RecordServerEvent(_ context.Context, name string, userID int64, props map[string]any) {
	s.events = append(s.events, spiedEvent{name: name, userID: userID, props: props})
}

type expiryFixture struct {
	db      *database.DB
	service *curator.Service
	spy     *expirySpy
	curator int64
	client  int64
}

func newExpiryFixture(t *testing.T, name string) expiryFixture {
	t.Helper()
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, name)
	log := logger.New()
	spy := &expirySpy{}
	service := curator.NewService(db, log, notifications.NewService(db, log)).WithAccessEvents(spy)

	var curatorID, clientID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('curator@example.test', 'x', 'Куратор', 'coordinator', true) RETURNING id`).Scan(&curatorID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('client@example.test', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&clientID))

	return expiryFixture{db: db, service: service, spy: spy, curator: curatorID, client: clientID}
}

// linkUntil выдаёт право со сроком, отсчитанным от сегодняшнего дня.
func (f expiryFixture) linkUntil(t *testing.T, offsetDays int) {
	t.Helper()
	until := curatoraccess.Today().AddDate(0, 0, offsetDays)
	_, err := f.db.ExecContext(context.Background(),
		`INSERT INTO curator_client_relationships (curator_id, client_id, status, access_expires_at)
		 VALUES ($1, $2, 'active', $3)`, f.curator, f.client, until)
	require.NoError(t, err)
}

func (f expiryFixture) notificationsOf(t *testing.T, userID int64, kind string) int {
	t.Helper()
	var count int
	require.NoError(t, f.db.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = $2`,
		userID, kind).Scan(&count))
	return count
}

func TestExpireCuratorAccess_СнимаетПросроченное(t *testing.T) {
	ctx := context.Background()
	f := newExpiryFixture(t, "curator_expire")
	f.linkUntil(t, -1)

	count, err := f.service.ExpireCuratorAccess(ctx)
	require.NoError(t, err)
	assert.Equal(t, 1, count)

	state, err := curatoraccess.Of(ctx, f.db.DB, f.client)
	require.NoError(t, err)
	assert.False(t, state.Allowed())
	assert.Equal(t, curatoraccess.StatusInactive, state.Status,
		"статус приведён в соответствие с датой: от него зависят десятки запросов о работе куратора")
}

// Последний день действует целиком: ошибка здесь стоит денег тому, кто заплатил.
func TestExpireCuratorAccess_ПоследнийДеньНеТрогает(t *testing.T) {
	ctx := context.Background()
	f := newExpiryFixture(t, "curator_expire_last_day")
	f.linkUntil(t, 0)

	count, err := f.service.ExpireCuratorAccess(ctx)
	require.NoError(t, err)
	assert.Zero(t, count)

	state, err := curatoraccess.Of(ctx, f.db.DB, f.client)
	require.NoError(t, err)
	assert.True(t, state.Allowed())
}

func TestExpireCuratorAccess_БессрочноеНеТрогает(t *testing.T) {
	ctx := context.Background()
	f := newExpiryFixture(t, "curator_expire_perpetual")
	_, err := f.db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status, access_expires_at)
		 VALUES ($1, $2, 'active', NULL)`, f.curator, f.client)
	require.NoError(t, err)

	count, err := f.service.ExpireCuratorAccess(ctx)
	require.NoError(t, err)
	assert.Zero(t, count, "служебные учётные записи прогона живут бессрочно")
}

// Молча исчезнувший куратор читается как поломка сервиса, а куратор, не знающий
// о прекращении, продолжает работу бесплатно.
func TestExpireCuratorAccess_УведомляетОбеСтороны(t *testing.T) {
	ctx := context.Background()
	f := newExpiryFixture(t, "curator_expire_notifies")
	f.linkUntil(t, -1)

	_, err := f.service.ExpireCuratorAccess(ctx)
	require.NoError(t, err)

	assert.Equal(t, 1, f.notificationsOf(t, f.client, string(notifications.TypeCuratorAccessEnded)),
		"клиент должен узнать о прекращении")
	assert.Equal(t, 1, f.notificationsOf(t, f.curator, string(notifications.TypeCuratorAccessEnded)),
		"куратор должен узнать о прекращении")
}

func TestExpireCuratorAccess_ЗаписываетСобытиеСПричиной(t *testing.T) {
	ctx := context.Background()
	f := newExpiryFixture(t, "curator_expire_event")
	f.linkUntil(t, -1)

	_, err := f.service.ExpireCuratorAccess(ctx)
	require.NoError(t, err)

	require.Len(t, f.spy.events, 1)
	assert.Equal(t, "curator_access_ended", f.spy.events[0].name)
	assert.Equal(t, f.client, f.spy.events[0].userID)
	assert.Equal(t, "expired", f.spy.events[0].props["reason"],
		"истечение срока и снятие вручную — разные причины оттока")
}

func TestWarnExpiringCuratorAccess_РовноЗаТриДня(t *testing.T) {
	ctx := context.Background()
	f := newExpiryFixture(t, "curator_warn")
	f.linkUntil(t, 3)

	warned, err := f.service.WarnExpiringCuratorAccess(ctx)
	require.NoError(t, err)
	assert.Equal(t, 1, warned)
	assert.Equal(t, 1, f.notificationsOf(t, f.client, string(notifications.TypeCuratorAccessEnding)))
}

// Ровно за три дня, а не «не позже чем за три»: иначе предупреждение уходило бы
// каждый день до самого конца срока и перестало бы читаться.
func TestWarnExpiringCuratorAccess_НеКаждыйДень(t *testing.T) {
	ctx := context.Background()
	f := newExpiryFixture(t, "curator_warn_once")
	f.linkUntil(t, 2)

	warned, err := f.service.WarnExpiringCuratorAccess(ctx)
	require.NoError(t, err)
	assert.Zero(t, warned)
	assert.Zero(t, f.notificationsOf(t, f.client, string(notifications.TypeCuratorAccessEnding)))
}
