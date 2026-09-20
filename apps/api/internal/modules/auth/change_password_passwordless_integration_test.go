//go:build integration

package auth_test

import (
	"context"
	"errors"
	"testing"

	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Проверяется на живой базе намеренно: NULL в password не воспроизводится на
// sqlmock. ChangePassword читал пароль в string тем же способом, каким это
// делал Login до соседней правки: для аккаунта без пароля (внешний провайдер
// или вход по ссылке) Scan падал с "converting NULL to string is
// unsupported", и человек получал внутреннюю ошибку вместо осмысленного
// ответа "нечего менять".
//
// У беспарольного аккаунта нет текущего пароля, который форма требует, — это
// не то же самое, что дефект A/B в Login. Здесь правильный ответ не "пропусти
// проверку и смени пароль", а понятный отказ: тот же приём, что уже применён
// в oauth_service.ConfirmLinkWithPassword для точно такой же ситуации
// ("аккаунту нечего доказывать паролем").
func TestChangePasswordForPasswordlessAccountIsRefusedNotBroken(t *testing.T) {
	service, _, db := newSessionServiceWithDB(t)
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, created_at, updated_at)
		 VALUES ('passwordless-changepw@example.test', NULL, 'Кто-то', 'client', NOW(), NOW())
		 RETURNING id`).Scan(&userID))

	err := service.ChangePassword(ctx, userID, "", "AnotherPass2@", &auth.LoginResult{})

	require.Error(t, err, "у беспарольного аккаунта смена пароля не должна падать внутренней ошибкой")
	assert.True(t, errors.Is(err, apperrors.ErrConflict),
		"беспарольному аккаунту нечего менять — ответ должен быть понятным конфликтом, а не внутренней ошибкой: %v", err)
}
