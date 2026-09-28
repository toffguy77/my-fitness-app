//go:build integration

package curatoraccess_test

import (
	"context"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/curatoraccess"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Право читается с настоящей схемы, а не с подмены: колонка добавлена
// миграцией, и подмена показала бы зелёное даже там, где её нет.

type fixture struct {
	db      *database.DB
	curator int64
	client  int64
}

func newFixture(t *testing.T, name string) fixture {
	t.Helper()
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, name)

	var curator, client int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('curator@example.test', 'x', 'Куратор', 'coordinator', true) RETURNING id`).Scan(&curator))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('client@example.test', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&client))
	return fixture{db: db, curator: curator, client: client}
}

func (f fixture) link(t *testing.T, status string, expires *time.Time) {
	t.Helper()
	_, err := f.db.ExecContext(context.Background(),
		`INSERT INTO curator_client_relationships (curator_id, client_id, status, access_expires_at)
		 VALUES ($1, $2, $3, $4)`, f.curator, f.client, status, expires)
	require.NoError(t, err)
}

func TestOf_НетСвязи(t *testing.T) {
	f := newFixture(t, "access_none")

	state, err := curatoraccess.Of(context.Background(), f.db.DB, f.client)
	require.NoError(t, err)

	assert.False(t, state.Assigned(), "куратора нет")
	assert.False(t, state.Allowed())
	assert.False(t, state.Expired(), "куратора никогда не было — это не истёкшее право")
}

func TestOf_БессрочноеПраво(t *testing.T) {
	f := newFixture(t, "access_perpetual")
	f.link(t, curatoraccess.StatusActive, nil)

	state, err := curatoraccess.Of(context.Background(), f.db.DB, f.client)
	require.NoError(t, err)

	assert.True(t, state.Allowed())
	assert.True(t, state.Perpetual(), "NULL в колонке означает бессрочно")
	assert.Equal(t, f.curator, state.CuratorID)
}

func TestOf_СрочноеПраво(t *testing.T) {
	f := newFixture(t, "access_dated")
	tomorrow := curatoraccess.Today().AddDate(0, 0, 1)
	f.link(t, curatoraccess.StatusActive, &tomorrow)

	state, err := curatoraccess.Of(context.Background(), f.db.DB, f.client)
	require.NoError(t, err)

	require.NotNil(t, state.ExpiresAt)
	assert.Equal(t, tomorrow, *state.ExpiresAt, "дата возвращается датой, без времени суток")
	assert.True(t, state.Allowed())
}

// Право обязано кончиться с наступлением дня после предельной даты, а не тогда,
// когда до строки доберётся задача.
func TestOf_ПравоКончилосьДоРаботыЗадачи(t *testing.T) {
	f := newFixture(t, "access_expired_before_job")
	yesterday := curatoraccess.Today().AddDate(0, 0, -1)
	f.link(t, curatoraccess.StatusActive, &yesterday)

	state, err := curatoraccess.Of(context.Background(), f.db.DB, f.client)
	require.NoError(t, err)

	assert.False(t, state.Allowed(), "статус ещё active, но день предельной даты прошёл")
	assert.True(t, state.Expired())
}

// Строк связи у клиента может быть несколько: ограничение уникальности стоит на
// паре куратор-клиент. Действующая связь важнее прочих.
func TestOf_ДействующаяСвязьВажнееПрежней(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t, "access_two_rows")
	f.link(t, curatoraccess.StatusInactive, nil)

	var second int64
	require.NoError(t, f.db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('curator2@example.test', 'x', 'Второй', 'coordinator', true) RETURNING id`).Scan(&second))
	future := curatoraccess.Today().AddDate(0, 0, 30)
	_, err := f.db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status, access_expires_at)
		 VALUES ($1, $2, 'active', $3)`, second, f.client, future)
	require.NoError(t, err)

	state, err := curatoraccess.Of(ctx, f.db.DB, f.client)
	require.NoError(t, err)

	assert.Equal(t, second, state.CuratorID, "вернулась действующая связь, а не прежняя")
	assert.True(t, state.Allowed())
}

func TestExpire_СнимаетТолькоПросроченные(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t, "access_expire")
	yesterday := curatoraccess.Today().AddDate(0, 0, -1)
	f.link(t, curatoraccess.StatusActive, &yesterday)

	// Бессрочная связь другого клиента не должна пострадать: так живут
	// служебные учётные записи прогона.
	var other int64
	require.NoError(t, f.db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('perpetual@burcev.test', 'x', 'Служебный', 'client', true) RETURNING id`).Scan(&other))
	_, err := f.db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status, access_expires_at)
		 VALUES ($1, $2, 'active', NULL)`, f.curator, other)
	require.NoError(t, err)

	expired, err := curatoraccess.Expire(ctx, f.db.DB, curatoraccess.Today())
	require.NoError(t, err)

	require.Len(t, expired, 1, "снята одна связь — просроченная")
	assert.Equal(t, f.client, expired[0].ClientID)
	assert.Equal(t, f.curator, expired[0].CuratorID, "куратора нужно уведомить, поэтому он возвращается")

	overdue, err := curatoraccess.Overdue(ctx, f.db.DB, curatoraccess.Today())
	require.NoError(t, err)
	assert.Zero(t, overdue, "после прекращения расхождений не остаётся")

	perpetual, err := curatoraccess.Of(ctx, f.db.DB, other)
	require.NoError(t, err)
	assert.True(t, perpetual.Allowed(), "бессрочное право не затронуто")
}

// Последний день действует целиком: задача, запущенная в этот день, ничего не
// снимает.
func TestExpire_ПоследнийДеньНеСнимается(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t, "access_expire_last_day")
	today := curatoraccess.Today()
	f.link(t, curatoraccess.StatusActive, &today)

	expired, err := curatoraccess.Expire(ctx, f.db.DB, today)
	require.NoError(t, err)
	assert.Empty(t, expired)

	state, err := curatoraccess.Of(ctx, f.db.DB, f.client)
	require.NoError(t, err)
	assert.True(t, state.Allowed())
}

func TestOverdue_ВидитНесработавшееПрекращение(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t, "access_overdue")
	long := curatoraccess.Today().AddDate(0, 0, -10)
	f.link(t, curatoraccess.StatusActive, &long)

	overdue, err := curatoraccess.Overdue(ctx, f.db.DB, curatoraccess.Today())
	require.NoError(t, err)
	assert.Equal(t, 1, overdue, "активная связь с датой в прошлом — признак отказавшей задачи")
}

func TestExpiring_РовноЧерезЗаданныйСрок(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t, "access_expiring")
	inThree := curatoraccess.Today().AddDate(0, 0, 3)
	f.link(t, curatoraccess.StatusActive, &inThree)

	soon, err := curatoraccess.Expiring(ctx, f.db.DB, curatoraccess.Today(), 3)
	require.NoError(t, err)
	require.Len(t, soon, 1)
	assert.Equal(t, f.client, soon[0].ClientID)

	// Ровно через, а не «не позже чем через»: иначе предупреждение уходило бы
	// каждый день до самого конца срока.
	none, err := curatoraccess.Expiring(ctx, f.db.DB, curatoraccess.Today(), 2)
	require.NoError(t, err)
	assert.Empty(t, none)
}
