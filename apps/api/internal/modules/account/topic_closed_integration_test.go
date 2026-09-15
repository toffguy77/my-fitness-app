//go:build integration

package account_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type recordingCloser struct {
	closed []int64
	fail   error
}

func (r *recordingCloser) Close(_ context.Context, clientID int64) error {
	if r.fail != nil {
		return r.fail
	}
	r.closed = append(r.closed, clientID)
	return nil
}

// Стирание аккаунта закрывает тему переписки.
//
// История в Telegram при этом остаётся — решение принято отдельно. Закрытие
// означает ровно одно: новых сообщений в теме не появится.
func TestErasureClosesTheSupportTopic(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "erasure_topic")
	ctx := context.Background()
	closer := &recordingCloser{}
	service := account.NewService(db, logger.New(), nil).WithTopics(closer)

	client := account_(t, db, "тема@example.test", "client")

	require.NoError(t, service.Erase(ctx, client))

	assert.Equal(t, []int64{client}, closer.closed, "тема стёртого человека осталась открытой")
}

// Отказ при закрытии темы не отменяет стирания.
//
// Стирание — то, о чём человек попросил; неудача в чужом сервисе не повод его
// не делать. Та же логика, что у удаления файлов.
func TestErasureSurvivesAFailureToCloseTheTopic(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "erasure_topic_fail")
	ctx := context.Background()
	service := account.NewService(db, logger.New(), nil).
		WithTopics(&recordingCloser{fail: fmt.Errorf("telegram refused")})

	client := account_(t, db, "отказ@example.test", "client")

	require.NoError(t, service.Erase(ctx, client), "отказ Telegram отменил стирание")

	var email string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT email FROM users WHERE id = $1`, client).Scan(&email))
	assert.Contains(t, email, "deleted-", "человек не стёрт")
}
