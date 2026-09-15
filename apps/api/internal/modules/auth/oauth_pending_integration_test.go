//go:build integration

package auth_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Вход через провайдера, который не сообщает адрес почты.
//
// Человек вводит адрес сам; если адрес уже принадлежит кому-то, следующим
// шагом просят пароль от того аккаунта. Между шагами попытка живёт в базе — и
// адрес надо записать в неё, а не только в структуру, прочитанную из неё.
//
// Пока этого не делали, второй шаг находил попытку без адреса, отвечал
// ErrTokenInvalid, а человек видел «попытка входа истекла» — при живой попытке
// и через тринадцать секунд после первого шага. Ломалось только у VK: Яндекс
// отдаёт адрес сам, и эта ветка у него не срабатывает.
//
// На настоящей базе, а не на подмене: вопрос здесь ровно один — попал ли адрес
// в строку. Подмена ответила бы «да» в любом случае.
func TestCompleteWithEmail_RemembersTheAddressForTheConfirmationStep(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "oauth_pending")
	ctx := context.Background()
	service := auth.NewService(db.DB, &config.Config{}, logger.New())

	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('занят@example.test', 'x', 'Хозяин адреса', 'client')`)
	require.NoError(t, err)

	var pendingID string
	require.NoError(t, db.QueryRowContext(ctx, `
		INSERT INTO oauth_pending_links (provider, provider_user_id, name, expires_at)
		VALUES ('vk', 'vk-777', 'Без адреса', NOW() + INTERVAL '10 minutes')
		RETURNING id`).Scan(&pendingID))

	outcome, err := service.CompleteWithEmail(ctx, pendingID, "занят@example.test", "127.0.0.1", "test")

	require.NoError(t, err)
	require.Equal(t, auth.OAuthNeedsLinkConfirmation, outcome.Result)

	var stored *string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT email FROM oauth_pending_links WHERE id = $1`, pendingID).Scan(&stored))
	require.NotNil(t, stored, "адрес не записан — второй шаг не узнает, о ком речь")
	assert.Equal(t, "занят@example.test", *stored)
}
