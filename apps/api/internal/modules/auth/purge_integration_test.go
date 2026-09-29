//go:build integration

package auth_test

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Ссылки для входа и коды из письма писались на каждый вход и каждое
// подтверждение, и не удалялись никогда. Обе таблицы росли монотонно.
//
// Проверка на настоящей базе: запас в сутки — утверждение об интервалах в
// SQL, и верен он или нет, решает Postgres.
//
// Запускать:
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 ./internal/modules/auth/

func purgeFixtures(t *testing.T) (*database.DB, int64) {
	t.Helper()

	db := testsupport.SchemaWithMigrations(t, "auth_purge")

	var userID int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role)
		 VALUES ($1, 'x', 'Кто-то', 'client') RETURNING id`,
		fmt.Sprintf("purge-%d@example.test", os.Getpid()),
	).Scan(&userID))

	return db, userID
}

func TestPurgeExpiredMagicLinksKeepsADayOfMargin(t *testing.T) {
	db, userID := purgeFixtures(t)
	ctx := context.Background()
	service := auth.NewService(db.DB, &config.Config{}, logger.New())

	// Три ссылки: живая, истёкшая час назад и истёкшая неделю назад.
	for i, expiry := range []string{"+1 hour", "-1 hour", "-7 days"} {
		_, err := db.ExecContext(ctx,
			`INSERT INTO magic_links (token_hash, email, user_id, expires_at)
			 VALUES ($1, 'who@example.test', $2, NOW() + $3::interval)`,
			fmt.Sprintf("hash-%d", i), userID, expiry)
		require.NoError(t, err)
	}

	removed, err := service.PurgeExpiredMagicLinks(ctx)
	require.NoError(t, err)
	assert.Equal(t, 1, removed, "уходит только та, что истекла больше суток назад")

	var left int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM magic_links`).Scan(&left))
	assert.Equal(t, 2, left, "живая и недавно истёкшая остаются")
}

// Запас существует ради окна ограничения повторной отправки: issueCode
// считает строки по created_at за последние десять минут, и если чистка
// заберёт их раньше, потраченные попытки вернутся обратно.
func TestPurgeExpiredCodesLeavesTheResendWindowIntact(t *testing.T) {
	db, userID := purgeFixtures(t)
	ctx := context.Background()
	vs := auth.NewVerificationService(db.DB, logger.New(), nil)

	// Код, выданный только что и уже истёкший: ровно тот случай, на котором
	// держится ограничение повторной отправки — истёк, но потрачен минуту
	// назад и обязан считаться.
	_, err := db.ExecContext(ctx,
		`INSERT INTO email_verification_codes (user_id, code_hash, expires_at, created_at)
		 VALUES ($1, 'h1', NOW() - INTERVAL '1 minute', NOW() - INTERVAL '2 minutes')`, userID)
	require.NoError(t, err)

	// И давно истёкший — этот не нужен никому.
	_, err = db.ExecContext(ctx,
		`INSERT INTO email_verification_codes (user_id, code_hash, expires_at, created_at)
		 VALUES ($1, 'h2', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days')`, userID)
	require.NoError(t, err)

	removed, err := vs.PurgeExpiredVerificationCodes(ctx)
	require.NoError(t, err)
	assert.Equal(t, 1, removed)

	var recent int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM email_verification_codes
		 WHERE user_id = $1 AND created_at > NOW() - INTERVAL '10 minutes'`, userID).Scan(&recent))
	assert.Equal(t, 1, recent,
		"недавний код должен уцелеть, иначе чистка раздаёт попытки заново")
}
