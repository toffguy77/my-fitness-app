//go:build integration

package admin_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/admin"
	"github.com/burcev/api/internal/shared/curatoraccess"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Выдача, продление и снятие права — против настоящей схемы.
//
// Подмена базы показала бы зелёное и там, где колонки срока нет, а главное —
// сохранность переписки при продлении подменой не проверить вовсе: она живёт
// в другой таблице, и вся суть решения в том, что строка связи не заводится
// заново.

type accessFixture struct {
	db      *database.DB
	service *admin.Service
	curator int64
	client  int64
}

func newAccessFixture(t *testing.T, name string) accessFixture {
	t.Helper()
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, name)

	var curator, client int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('curator@example.test', 'x', 'Куратор', 'coordinator', true) RETURNING id`).Scan(&curator))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('live@example.test', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&client))

	return accessFixture{db: db, service: admin.NewService(db, logger.New()), curator: curator, client: client}
}

func TestAssignCurator_ЖивомуКлиентуБезДатыОтказ(t *testing.T) {
	f := newAccessFixture(t, "admin_access_no_date")

	err := f.service.AssignCurator(context.Background(), f.client, f.curator, nil)

	require.ErrorIs(t, err, admin.ErrAccessExpiryRequired,
		"бессрочное право у живого человека неотличимо от забытой даты")
}

func TestAssignCurator_СохраняетДату(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(t, "admin_access_with_date")
	until := curatoraccess.Today().AddDate(0, 0, 30)

	require.NoError(t, f.service.AssignCurator(ctx, f.client, f.curator, &until))

	state, err := curatoraccess.Of(ctx, f.db.DB, f.client)
	require.NoError(t, err)
	require.NotNil(t, state.ExpiresAt)
	assert.Equal(t, until, *state.ExpiresAt)
	assert.True(t, state.Allowed())
}

// Продление меняет дату той же связи: новая строка на каждую оплату рвала бы
// историю работы, а клиент получал бы другого куратора.
func TestSetCuratorAccessExpiry_СохраняетКлючевоеИПереписку(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(t, "admin_access_extend")
	until := curatoraccess.Today().AddDate(0, 0, 3)
	require.NoError(t, f.service.AssignCurator(ctx, f.client, f.curator, &until))

	var conversationBefore string
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT id FROM conversations WHERE client_id = $1`, f.client).Scan(&conversationBefore))
	_, err := f.db.ExecContext(ctx,
		`INSERT INTO messages (conversation_id, sender_id, type, content)
		 VALUES ($1, $2, 'text', 'привет')`, conversationBefore, f.client)
	require.NoError(t, err)

	extended := curatoraccess.Today().AddDate(0, 0, 33)
	require.NoError(t, f.service.SetCuratorAccessExpiry(ctx, f.client, extended))

	state, err := curatoraccess.Of(ctx, f.db.DB, f.client)
	require.NoError(t, err)
	require.NotNil(t, state.ExpiresAt)
	assert.Equal(t, extended, *state.ExpiresAt, "дата изменена")
	assert.Equal(t, f.curator, state.CuratorID, "куратор остался тот же")

	var rows int
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM curator_client_relationships WHERE client_id = $1`, f.client).Scan(&rows))
	assert.Equal(t, 1, rows, "связь одна: продление не заводит новую строку")

	var messages int
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM messages WHERE conversation_id = $1`, conversationBefore).Scan(&messages))
	assert.Equal(t, 1, messages, "переписка сохранена целиком")
}

func TestSetCuratorAccessExpiry_БезДействующейСвязи(t *testing.T) {
	f := newAccessFixture(t, "admin_access_extend_none")
	until := curatoraccess.Today().AddDate(0, 0, 30)

	err := f.service.SetCuratorAccessExpiry(context.Background(), f.client, until)

	require.ErrorIs(t, err, admin.ErrNoActiveAccess)
}

func TestRevokeCuratorAccess_СнимаетПравоНоНеПереписку(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(t, "admin_access_revoke")
	until := curatoraccess.Today().AddDate(0, 0, 30)
	require.NoError(t, f.service.AssignCurator(ctx, f.client, f.curator, &until))

	var conversation string
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT id FROM conversations WHERE client_id = $1`, f.client).Scan(&conversation))

	require.NoError(t, f.service.RevokeCuratorAccess(ctx, f.client))

	state, err := curatoraccess.Of(ctx, f.db.DB, f.client)
	require.NoError(t, err)
	assert.False(t, state.Allowed(), "право снято до истечения даты — возврат денег или ошибка выдачи")
	assert.True(t, state.Expired())

	var conversations int
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM conversations WHERE id = $1`, conversation).Scan(&conversations))
	assert.Equal(t, 1, conversations, "переписка остаётся: читать её можно всегда")
}

func TestRevokeCuratorAccess_БезДействующейСвязи(t *testing.T) {
	f := newAccessFixture(t, "admin_access_revoke_none")

	err := f.service.RevokeCuratorAccess(context.Background(), f.client)

	require.ErrorIs(t, err, admin.ErrNoActiveAccess)
}

// Служебные учётные записи прогона остаются бессрочными: без них набор сквозных
// проверок упёрся бы в собственный платный доступ.
func TestAssignCurator_СлужебнойУчёткеБессрочно(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(t, "admin_access_service_account")

	var serviceClient int64
	require.NoError(t, f.db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('e2e-client@burcev.team', 'x', 'Прогон', 'client', true) RETURNING id`).Scan(&serviceClient))

	require.NoError(t, f.service.AssignCurator(ctx, serviceClient, f.curator, nil))

	state, err := curatoraccess.Of(ctx, f.db.DB, serviceClient)
	require.NoError(t, err)
	assert.True(t, state.Perpetual())
	assert.True(t, state.Allowed())
}

// Администратор обязан видеть срок: бессрочное право у живого клиента — признак
// ошибки выдачи, и отличить его от срочного можно только по этому полю.
func TestGetUser_ПоказываетСрокДействияПрава(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(t, "admin_access_get_user")
	until := curatoraccess.Today().AddDate(0, 0, 14)
	require.NoError(t, f.service.AssignCurator(ctx, f.client, f.curator, &until))

	user, err := f.service.GetUser(ctx, f.client)
	require.NoError(t, err)

	require.NotNil(t, user.CuratorID)
	assert.Equal(t, f.curator, *user.CuratorID)
	assert.Equal(t, until.Format("2006-01-02"), user.CuratorAccessExpiresAt)
}

func TestGetUser_БессрочноеПравоБезДаты(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(t, "admin_access_get_user_perpetual")

	var serviceClient int64
	require.NoError(t, f.db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('e2e-perpetual@burcev.team', 'x', 'Прогон', 'client', true) RETURNING id`).Scan(&serviceClient))
	require.NoError(t, f.service.AssignCurator(ctx, serviceClient, f.curator, nil))

	user, err := f.service.GetUser(ctx, serviceClient)
	require.NoError(t, err)

	assert.Empty(t, user.CuratorAccessExpiresAt, "пусто означает бессрочно")
	require.NotNil(t, user.CuratorID)
}
