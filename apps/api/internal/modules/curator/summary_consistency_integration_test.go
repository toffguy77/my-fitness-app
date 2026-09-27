//go:build integration

package curator_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
)

// Сводка на главной куратора и списки под ней отвечают на один вопрос — и
// отвечали по-разному. Проверка на настоящей базе, а не на подмене: оба правила
// выражены в SQL, и совпадают они или нет, решает база. Заготовленные строки
// подтвердили бы только сами себя — ровно так три живых дефекта и уехали на прод.
//
// Числа с прода, ради которых это написано: у куратора с восемью активными
// клиентами карточка говорила «требуют внимания: 0», а список под ней давал
// восемь клиентов и пятнадцать строк.
func TestSummaryAgreesWithTheListsBelowIt(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "curator_summary")
	ctx := context.Background()
	service := curator.NewService(db, logger.New(), nil)

	var curatorID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('summary-curator@example.test', 'x', 'Куратор', 'coordinator') RETURNING id`).Scan(&curatorID))

	newClient := func(t *testing.T, email string) int64 {
		t.Helper()
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role)
			 VALUES ($1, 'x', $1, 'client') RETURNING id`, email).Scan(&id))
		_, err := db.ExecContext(ctx,
			`INSERT INTO curator_client_relationships (curator_id, client_id, status)
			 VALUES ($1, $2, 'active')`, curatorID, id)
		require.NoError(t, err)
		return id
	}

	// Трое клиентов без плана куратора, без заполненного профиля и без записей о
	// питании — то есть ровно то состояние, в котором находятся живые клиенты на
	// проде. Прежнее правило карточки не видело ни одного из них.
	clientA := newClient(t, "summary-a@example.test")
	clientB := newClient(t, "summary-b@example.test")
	clientC := newClient(t, "summary-c@example.test")

	t.Run("число требующих внимания равно списку внимания", func(t *testing.T) {
		analytics, err := service.GetAnalytics(ctx, curatorID)
		require.NoError(t, err)

		items, err := service.GetAttentionList(ctx, curatorID)
		require.NoError(t, err)

		distinct := map[int64]struct{}{}
		for _, item := range items {
			distinct[item.ClientID] = struct{}{}
		}

		assert.Equal(t, len(distinct), analytics.AttentionClients,
			"карточка и список под ней должны считать одно и то же")
		assert.Equal(t, 3, analytics.AttentionClients,
			"клиент без плана куратора и без записей о питании требует внимания")
		assert.NotZero(t, len(items), "иначе проверка проходит вхолостую")
	})

	t.Run("клиент с несколькими причинами посчитан один раз", func(t *testing.T) {
		items, err := service.GetAttentionList(ctx, curatorID)
		require.NoError(t, err)

		reasons := map[int64]int{}
		for _, item := range items {
			reasons[item.ClientID]++
		}
		require.Greater(t, reasons[clientA], 1,
			"у клиента без профиля и без питания причин минимум две — иначе проверять нечего")

		analytics, err := service.GetAnalytics(ctx, curatorID)
		require.NoError(t, err)
		assert.Equal(t, len(reasons), analytics.AttentionClients)
	})

	t.Run("число активных клиентов равно списку клиентов", func(t *testing.T) {
		analytics, err := service.GetAnalytics(ctx, curatorID)
		require.NoError(t, err)

		clients, err := service.GetClients(ctx, curatorID)
		require.NoError(t, err)

		assert.Equal(t, len(clients), analytics.TotalClients)
		assert.Equal(t, 3, analytics.TotalClients)
	})

	t.Run("клиент в окне удаления не попадает ни в число, ни в список", func(t *testing.T) {
		_, err := db.ExecContext(ctx,
			`UPDATE users SET deletion_requested_at = NOW() WHERE id = $1`, clientC)
		require.NoError(t, err)
		t.Cleanup(func() {
			_, err := db.ExecContext(ctx,
				`UPDATE users SET deletion_requested_at = NULL WHERE id = $1`, clientC)
			require.NoError(t, err)
		})

		analytics, err := service.GetAnalytics(ctx, curatorID)
		require.NoError(t, err)

		clients, err := service.GetClients(ctx, curatorID)
		require.NoError(t, err)

		assert.Equal(t, 2, analytics.TotalClients,
			"карточка считала по COUNT(*) без фильтра окна удаления и расходилась со списком")
		assert.Len(t, clients, 2)
		assert.Equal(t, len(clients), analytics.TotalClients)
	})

	t.Run("непрочитанное в сводке равно непрочитанному по разговорам", func(t *testing.T) {
		var convID string
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO conversations (client_id, curator_id) VALUES ($1, $2) RETURNING id`,
			clientB, curatorID).Scan(&convID))
		_, err := db.ExecContext(ctx,
			`INSERT INTO messages (conversation_id, sender_id, type, content)
			 VALUES ($1, $2, 'text', 'жду ответа')`, convID, clientB)
		require.NoError(t, err)

		analytics, err := service.GetAnalytics(ctx, curatorID)
		require.NoError(t, err)

		assert.Equal(t, 1, analytics.TotalUnread)
		assert.Equal(t, 1, analytics.ClientsWaiting)

		items, err := service.GetAttentionList(ctx, curatorID)
		require.NoError(t, err)
		var unreadReason bool
		for _, item := range items {
			if item.ClientID == clientB && item.Reason == curator.AttentionReasonUnreadMessage {
				unreadReason = true
			}
		}
		assert.True(t, unreadReason, "активный клиент с непрочитанным должен быть в списке внимания")
	})

	t.Run("непрочитанное от бывшего клиента считается, но внимания не требует", func(t *testing.T) {
		// Человек, которому куратор больше не куратор: его сообщение всё равно
		// ждёт ответа и видно в списке чатов, поэтому карточка его считает. В
		// списке внимания ему места нет — тот про работу с клиентом.
		var formerID int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role)
			 VALUES ('summary-former@example.test', 'x', 'Бывший', 'client') RETURNING id`).Scan(&formerID))
		_, err := db.ExecContext(ctx,
			`INSERT INTO curator_client_relationships (curator_id, client_id, status)
			 VALUES ($1, $2, 'inactive')`, curatorID, formerID)
		require.NoError(t, err)

		var convID string
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO conversations (client_id, curator_id) VALUES ($1, $2) RETURNING id`,
			formerID, curatorID).Scan(&convID))
		_, err = db.ExecContext(ctx,
			`INSERT INTO messages (conversation_id, sender_id, type, content)
			 VALUES ($1, $2, 'text', 'а мне ответят?')`, convID, formerID)
		require.NoError(t, err)

		analytics, err := service.GetAnalytics(ctx, curatorID)
		require.NoError(t, err)
		assert.Equal(t, 2, analytics.TotalUnread,
			"сообщение ждёт ответа независимо от статуса связи — в чатах оно видно")
		assert.Equal(t, 2, analytics.ClientsWaiting)

		items, err := service.GetAttentionList(ctx, curatorID)
		require.NoError(t, err)
		for _, item := range items {
			assert.NotEqual(t, formerID, item.ClientID,
				"человек без активной связи не должен требовать внимания")
		}
	})
}

// Дневной снапшот пишет те же величины, что показывает сводка: иначе график
// истории и карточка над ним разошлись бы между собой.
func TestDailySnapshotRecordsWhatTheSummaryShows(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "curator_summary_snapshot")
	ctx := context.Background()
	service := curator.NewService(db, logger.New(), nil)

	var curatorID, clientID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('snap-curator@example.test', 'x', 'Куратор', 'coordinator') RETURNING id`).Scan(&curatorID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('snap-client@example.test', 'x', 'Клиент', 'client') RETURNING id`).Scan(&clientID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status)
		 VALUES ($1, $2, 'active')`, curatorID, clientID)
	require.NoError(t, err)

	analytics, err := service.GetAnalytics(ctx, curatorID)
	require.NoError(t, err)
	require.NoError(t, service.CollectDailySnapshot(ctx, curatorID))

	var totalClients, attentionClients, totalUnread int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT total_clients, attention_clients, total_unread
		 FROM curator_daily_snapshots WHERE curator_id = $1 AND date = CURRENT_DATE`,
		curatorID).Scan(&totalClients, &attentionClients, &totalUnread))

	assert.Equal(t, analytics.TotalClients, totalClients)
	assert.Equal(t, analytics.AttentionClients, attentionClients)
	assert.Equal(t, analytics.TotalUnread, totalUnread)
	assert.Equal(t, 1, attentionClients,
		"клиент без профиля и без питания требует внимания — снапшот должен это записать")
}

// Отсутствие активных клиентов обнуляло сводку целиком, включая непрочитанное:
// на проде куратор с тремя непрочитанными сообщениями, видимыми в списке чатов,
// получал сводку из нулей.
func TestUnreadSurvivesHavingNoActiveClients(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "curator_summary_noclients")
	ctx := context.Background()
	service := curator.NewService(db, logger.New(), nil)

	var curatorID, formerID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('lonely-curator@example.test', 'x', 'Куратор', 'coordinator') RETURNING id`).Scan(&curatorID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('lonely-client@example.test', 'x', 'Бывший', 'client') RETURNING id`).Scan(&formerID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status)
		 VALUES ($1, $2, 'inactive')`, curatorID, formerID)
	require.NoError(t, err)

	var convID string
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO conversations (client_id, curator_id) VALUES ($1, $2) RETURNING id`,
		formerID, curatorID).Scan(&convID))
	_, err = db.ExecContext(ctx,
		`INSERT INTO messages (conversation_id, sender_id, type, content)
		 VALUES ($1, $2, 'text', 'первое'), ($1, $2, 'text', 'второе')`, convID, formerID)
	require.NoError(t, err)

	analytics, err := service.GetAnalytics(ctx, curatorID)
	require.NoError(t, err)

	assert.Equal(t, 0, analytics.TotalClients)
	assert.Equal(t, 2, analytics.TotalUnread, "непрочитанное — про разговоры, а не про активные связи")
	assert.Equal(t, 1, analytics.ClientsWaiting)
	// Остальное считать не по кому.
	assert.Equal(t, 0, analytics.AttentionClients)
	assert.Equal(t, 0, analytics.ActiveTasks)
}
