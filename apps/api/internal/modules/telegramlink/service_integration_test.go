//go:build integration

package telegramlink_test

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/burcev/api/internal/modules/telegramlink"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Билет должен пролезать в ссылку Telegram.
//
// Параметр `start` — не более 64 символов из `A-Za-z0-9_-`. Билет длиннее или с
// посторонним символом не вызовет ошибки у нас: ссылка просто не сработает у
// человека, и узнаем мы об этом от него.
func TestTicketFitsTelegramStartParameter(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "tglink_format")
	ctx := context.Background()
	service := telegramlink.NewService(db.DB)

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('формат@example.test','x','Ф','client') RETURNING id`).Scan(&userID))

	ticket, err := service.Issue(ctx, userID)

	require.NoError(t, err)
	assert.LessOrEqual(t, len(ticket), 64, "билет не умещается в параметр start")
	assert.Regexp(t, regexp.MustCompile(`^[A-Za-z0-9_-]+$`), ticket,
		"в билете символ, которого Telegram в start не примет")
}

// Погашение занимает строку билета, а не проходит мимо неё.
//
// Тест берёт на строку блокировку `SELECT ... FOR UPDATE` и в это время
// пытается погасить билет: погашение обязано ждать, а не создавать привязку.
// Реализация, которая пометку пропускает вовсе, здесь падает.
//
// **Чего этот тест не проверяет, и это стоит знать.** Он не отличает погашение
// одним запросом от разнесённых проверки и пометки: в обоих случаях `UPDATE`
// упирается в ту же блокировку. Разница между ними — в том, скольким
// вызывающим ответят «готово» при одновременном переходе по одной ссылке, и
// воспроизвести её расписанием не удалось: двадцать горутин с общим стартом
// дают одно успешное погашение и при сломанной реализации — абляция прошла.
//
// Поэтому погашение одним запросом выбрано не потому, что этот тест на нём
// настаивает, а потому что оно убирает окно по построению и повторяет образец
// `RedeemWSTicket`, уже принятый в этом коде.
func TestRedemptionCompetesForTheTicketRow(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "tglink_race")
	ctx := context.Background()
	service := telegramlink.NewService(db.DB)

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('гонка@example.test','x','Г','client') RETURNING id`).Scan(&userID))
	ticket, err := service.Issue(ctx, userID)
	require.NoError(t, err)

	tx, err := db.BeginTx(ctx, nil)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback() }()

	var locked int64
	require.NoError(t, tx.QueryRowContext(ctx,
		`SELECT user_id FROM telegram_link_tickets WHERE used_at IS NULL FOR UPDATE`).Scan(&locked))

	done := make(chan error, 1)
	go func() {
		_, err := service.Redeem(ctx, ticket, 1234, "ник")
		done <- err
	}()

	// Пока блокировка держится, привязки быть не должно.
	select {
	case err := <-done:
		t.Fatalf("погашение прошло мимо блокировки (%v) — значит строку читают, а не занимают", err)
	case <-time.After(700 * time.Millisecond):
	}

	var links int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM telegram_links WHERE user_id = $1`, userID).Scan(&links))
	require.Zero(t, links, "привязка появилась, пока билет ещё никем не занят")

	// Отпускаем — и погашение доходит до конца ровно одно.
	require.NoError(t, tx.Rollback())
	require.NoError(t, <-done)

	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM telegram_links WHERE user_id = $1`, userID).Scan(&links))
	assert.Equal(t, 1, links)
}

// Неизвестный, просроченный и использованный отвечают одинаково.
//
// Разные ответы рассказали бы держателю билета, какие билеты существуют.
func TestUnredeemableTicketsAnswerTheSame(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "tglink_refuse")
	ctx := context.Background()
	service := telegramlink.NewService(db.DB)

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('отказ@example.test','x','О','client') RETURNING id`).Scan(&userID))

	used, err := service.Issue(ctx, userID)
	require.NoError(t, err)
	_, err = service.Redeem(ctx, used, 2001, "ник")
	require.NoError(t, err)

	expired, err := service.Issue(ctx, userID)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`UPDATE telegram_link_tickets SET expires_at = NOW() - INTERVAL '1 minute'
		  WHERE used_at IS NULL`)
	require.NoError(t, err)

	for name, ticket := range map[string]string{
		"неизвестный":    "совершенно-посторонний-билет",
		"использованный": used,
		"просроченный":   expired,
		"пустой":         "",
	} {
		_, err := service.Redeem(ctx, ticket, 3001, "ник")
		require.Error(t, err, "%s билет приняли", name)
		assert.ErrorIs(t, err, apperrors.ErrTokenInvalid,
			"%s билет отвечает не тем, чем остальные", name)
	}
}

// Один Telegram не может быть двумя людьми сразу.
func TestOneChatBelongsToOneAccount(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "tglink_unique")
	ctx := context.Background()
	service := telegramlink.NewService(db.DB)

	var first, second int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('первый@example.test','x','П','client') RETURNING id`).Scan(&first))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('второй@example.test','x','В','client') RETURNING id`).Scan(&second))

	t1, err := service.Issue(ctx, first)
	require.NoError(t, err)
	_, err = service.Redeem(ctx, t1, 4242, "общий")
	require.NoError(t, err)

	t2, err := service.Issue(ctx, second)
	require.NoError(t, err)
	_, err = service.Redeem(ctx, t2, 4242, "общий")

	require.Error(t, err, "один чат привязался к двум учётным записям")
}

// Привязка снимается, и состояние определяется ею, а не именем в профиле.
func TestUnlinkAndState(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "tglink_unlink")
	ctx := context.Background()
	service := telegramlink.NewService(db.DB)

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('отвязка@example.test','x','О','client') RETURNING id`).Scan(&userID))

	link, err := service.Of(ctx, userID)
	require.NoError(t, err)
	assert.Nil(t, link, "привязки не было, а состояние говорит обратное")

	ticket, err := service.Issue(ctx, userID)
	require.NoError(t, err)
	_, err = service.Redeem(ctx, ticket, 5150, "ivanov")
	require.NoError(t, err)

	link, err = service.Of(ctx, userID)
	require.NoError(t, err)
	require.NotNil(t, link)
	assert.Equal(t, "ivanov", link.Username)
	assert.WithinDuration(t, time.Now(), link.LinkedAt, time.Minute)

	chatID, linked, err := service.ChatID(ctx, userID)
	require.NoError(t, err)
	assert.True(t, linked)
	assert.Equal(t, int64(5150), chatID)

	require.NoError(t, service.Unlink(ctx, userID))
	require.NoError(t, service.Unlink(ctx, userID), "повторная отвязка — не ошибка")

	_, linked, err = service.ChatID(ctx, userID)
	require.NoError(t, err)
	assert.False(t, linked, "после отвязки бот всё ещё считает, что может написать")
}
