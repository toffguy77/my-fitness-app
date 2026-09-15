//go:build integration

package notifications

import (
	"context"
	"fmt"
	"testing"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeTelegram struct {
	chat   int64
	linked bool
	sent   []string
	fail   error
}

func (f *fakeTelegram) ChatID(context.Context, int64) (int64, bool, error) {
	return f.chat, f.linked, nil
}
func (f *fakeTelegram) Send(_ context.Context, _ int64, text string) error {
	if f.fail != nil {
		return f.fail
	}
	f.sent = append(f.sent, text)
	return nil
}

func note(userID int64) *Notification {
	return &Notification{
		UserID: userID, Category: CategoryMain, Type: TypeSupportEscalated,
		Title: "Заголовок", Content: "Текст",
	}
}

// Привязавший Telegram получает уведомление и там — поверх обычных каналов.
func TestNotificationAlsoGoesToTelegram(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "notif_tg")
	ctx := context.Background()
	tg := &fakeTelegram{chat: 4242, linked: true}
	service := NewService(db, logger.New()).WithTelegram(tg)

	var id int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email,password,name,role) VALUES ('тг@e.test','x','Т','client') RETURNING id`).Scan(&id))

	require.NoError(t, service.CreateNotification(ctx, note(id)))

	var stored int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM notifications WHERE user_id = $1`, id).Scan(&stored))
	assert.Equal(t, 1, stored, "уведомление не сохранено")
	require.Len(t, tg.sent, 1, "в Telegram не ушло")
	assert.Contains(t, tg.sent[0], "Заголовок")
}

// Без привязки — только обычные каналы, и это не отказ.
func TestWithoutALinkNothingGoesToTelegram(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "notif_tg_none")
	ctx := context.Background()
	tg := &fakeTelegram{linked: false}
	service := NewService(db, logger.New()).WithTelegram(tg)

	var id int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email,password,name,role) VALUES ('без@e.test','x','Б','client') RETURNING id`).Scan(&id))

	require.NoError(t, service.CreateNotification(ctx, note(id)))

	var stored int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM notifications WHERE user_id = $1`, id).Scan(&stored))
	assert.Equal(t, 1, stored)
	assert.Empty(t, tg.sent)
}

// Отказ Telegram не отменяет уведомления.
//
// Оно уже создано и видно в приложении; откатывать его из-за недоставленного
// сообщения — потерять то, о чём человека надо было известить.
func TestTelegramFailureDoesNotCancelTheNotification(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "notif_tg_fail")
	ctx := context.Background()
	tg := &fakeTelegram{chat: 1, linked: true, fail: fmt.Errorf("bot was blocked by the user")}
	service := NewService(db, logger.New()).WithTelegram(tg)

	var id int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email,password,name,role) VALUES ('отказ@e.test','x','О','client') RETURNING id`).Scan(&id))

	require.NoError(t, service.CreateNotification(ctx, note(id)), "отказ Telegram отменил уведомление")

	var stored int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM notifications WHERE user_id = $1`, id).Scan(&stored))
	assert.Equal(t, 1, stored, "уведомление пропало из-за отказа Telegram")
}
