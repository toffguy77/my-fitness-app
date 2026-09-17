package auth

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// expiresAtMatcher checks that expires_at is within tolerance of expected TTL from now.
type expiresAtMatcher struct{ ttl time.Duration }

func (m expiresAtMatcher) Match(v driver.Value) bool {
	t, ok := v.(time.Time)
	if !ok {
		return false
	}
	expected := time.Now().Add(m.ttl)
	return t.After(expected.Add(-5*time.Second)) && t.Before(expected.Add(5*time.Second))
}

func setupTestService(t *testing.T) (*Service, sqlmock.Sqlmock, func()) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)

	cfg := &config.Config{
		JWTSecret: "test-secret-key",
	}
	log := logger.New()
	service := NewService(db, cfg, log)

	cleanup := func() {
		db.Close()
	}

	return service, mock, cleanup
}

// expectUserRow sets up the sqlmock expectation for Login's user lookup
// query, with the given stored password: nil for a NULL column (external
// provider or magic-link account), or a pointer to a string for a stored
// value (possibly empty). Columns and their order are taken from the actual
// query in Login, not invented.
func expectUserRow(mock sqlmock.Sqlmock, email string, password *string) {
	var passwordArg any
	if password != nil {
		passwordArg = *password
	}
	mock.ExpectQuery("SELECT id, email").
		WithArgs(email).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "email", "name", "password", "role", "email_verified",
			"onboarding_completed", "created_at", "deletion_requested_at", "token_version",
		}).AddRow(1, email, "Test User", passwordArg, "client", true, true, time.Now(), nil, 0))
}

// strPtr is a small helper for building *string literals inline in tests.
func strPtr(s string) *string { return &s }

// bcryptOf hashes a password for use as a stored value in test fixtures.
func bcryptOf(t *testing.T, password string) string {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	require.NoError(t, err)
	return string(hash)
}

func TestRegisterService(t *testing.T) {
	t.Run("successful registration returns LoginResult with refresh token", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("INSERT INTO users").
			WithArgs("test@example.com", sqlmock.AnyArg(), "Test User").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at"}).
				AddRow(1, "test@example.com", "Test User", "client", false, false, time.Now()))

		mock.ExpectExec("INSERT INTO user_settings").
			WithArgs(int64(1)).
			WillReturnResult(sqlmock.NewResult(1, 1))

		// Expect refresh token insertion (6 args: userID, hash, expiresAt, ip, ua, rememberMe)
		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(1), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent", false).
			WillReturnResult(sqlmock.NewResult(1, 1))

		result, err := service.Register(ctx, "test@example.com", "Password1!", "Test User", "127.0.0.1", "TestAgent", nil)
		require.NoError(t, err)
		require.NotNil(t, result)
		assert.NotNil(t, result.User)
		assert.Equal(t, "test@example.com", result.User.Email)
		assert.Equal(t, "Test User", result.User.Name)
		assert.Equal(t, "client", result.User.Role)
		assert.NotEmpty(t, result.Token)
		assert.NotEmpty(t, result.RefreshToken)
	})

	t.Run("registration without name", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("INSERT INTO users").
			WithArgs("test2@example.com", sqlmock.AnyArg(), "").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at"}).
				AddRow(2, "test2@example.com", "", "client", false, false, time.Now()))

		// Expect default identity update
		mock.ExpectExec("UPDATE users SET name").
			WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), int64(2)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		mock.ExpectExec("INSERT INTO user_settings").
			WithArgs(int64(2)).
			WillReturnResult(sqlmock.NewResult(1, 1))

		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(2), sqlmock.AnyArg(), sqlmock.AnyArg(), "", "", false).
			WillReturnResult(sqlmock.NewResult(1, 1))

		result, err := service.Register(ctx, "test2@example.com", "Password1!", "", "", "", nil)
		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, "test2@example.com", result.User.Email)
		assert.NotEmpty(t, result.User.Name, "should have a default name")
		assert.Contains(t, result.User.Name, " ", "default name should be 'Color Animal' format")
	})
}

func TestLoginService(t *testing.T) {
	t.Run("successful login returns tokens", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		hashedPw, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

		mock.ExpectQuery("SELECT id, email").
			WithArgs("test@example.com").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "email_verified", "onboarding_completed", "created_at", "deletion_requested_at", "token_version"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", false, false, time.Now(), nil, 0))

		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(1), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent", false).
			WillReturnResult(sqlmock.NewResult(1, 1))

		result, err := service.Login(ctx, "test@example.com", "password123", "127.0.0.1", "TestAgent", false)
		assert.NoError(t, err)
		assert.NotNil(t, result)
		assert.NotNil(t, result.User)
		assert.NotEmpty(t, result.Token)
		assert.NotEmpty(t, result.RefreshToken)
		assert.Equal(t, "test@example.com", result.User.Email)
	})

	t.Run("wrong password", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		hashedPw, _ := bcrypt.GenerateFromPassword([]byte("correctpassword"), bcrypt.DefaultCost)

		mock.ExpectQuery("SELECT id, email").
			WithArgs("test@example.com").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "email_verified", "onboarding_completed", "created_at", "deletion_requested_at", "token_version"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", false, false, time.Now(), nil, 0))

		result, err := service.Login(ctx, "test@example.com", "wrongpassword", "", "", false)
		assert.Error(t, err)
		assert.Nil(t, result)
	})
}

func TestRefreshTokens(t *testing.T) {
	t.Run("successful refresh rotates tokens", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		plainToken := "test-refresh-token"
		tokenHash := service.tokens.HashToken(plainToken)
		expiresAt := time.Now().Add(24 * time.Hour)

		// Lookup refresh token
		mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, replaced_by_hash, remember_me").
			WithArgs(tokenHash).
			WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at", "replaced_by_hash", "remember_me"}).
				AddRow(1, int64(42), expiresAt, nil, nil, false))

		// Begin transaction
		mock.ExpectBegin()

		// Revoke old token
		mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
			WithArgs(sqlmock.AnyArg(), int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// Insert new token
		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(42), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent", false).
			WillReturnResult(sqlmock.NewResult(2, 1))

		// Commit transaction
		mock.ExpectCommit()

		// Look up user
		mock.ExpectQuery("SELECT id, email").
			WithArgs(int64(42)).
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at", "token_version"}).
				AddRow(42, "user@example.com", "User", "client", true, true, time.Now(), 0))

		result, err := service.RefreshTokens(ctx, plainToken, "127.0.0.1", "TestAgent")
		assert.NoError(t, err)
		assert.NotNil(t, result)
		assert.NotEmpty(t, result.Token)
		assert.NotEmpty(t, result.RefreshToken)
		assert.NotEqual(t, plainToken, result.RefreshToken)
		assert.Equal(t, "user@example.com", result.User.Email)
	})

	t.Run("expired refresh token is rejected", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		plainToken := "expired-token"
		tokenHash := service.tokens.HashToken(plainToken)
		expiredAt := time.Now().Add(-1 * time.Hour)

		mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, replaced_by_hash, remember_me").
			WithArgs(tokenHash).
			WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at", "replaced_by_hash", "remember_me"}).
				AddRow(1, int64(42), expiredAt, nil, nil, false))

		result, err := service.RefreshTokens(ctx, plainToken, "", "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "expired")
		assert.Nil(t, result)
	})

	t.Run("revoked token triggers reuse detection", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		plainToken := "revoked-token"
		tokenHash := service.tokens.HashToken(plainToken)
		revokedAt := sql.NullTime{Time: time.Now().Add(-1 * time.Hour), Valid: true}

		mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, replaced_by_hash, remember_me").
			WithArgs(tokenHash).
			WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at", "replaced_by_hash", "remember_me"}).
				AddRow(1, int64(42), time.Now().Add(24*time.Hour), revokedAt, nil, false))

		// Expect all tokens to be revoked
		mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
			WithArgs(int64(42)).
			WillReturnResult(sqlmock.NewResult(0, 3))

		result, err := service.RefreshTokens(ctx, plainToken, "", "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "reuse detected")
		assert.Nil(t, result)
	})

	t.Run("unknown token is rejected", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		plainToken := "unknown-token"
		tokenHash := service.tokens.HashToken(plainToken)

		mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, replaced_by_hash, remember_me").
			WithArgs(tokenHash).
			WillReturnError(sql.ErrNoRows)

		result, err := service.RefreshTokens(ctx, plainToken, "", "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid token")
		assert.Nil(t, result)
	})
}

func TestRevokeRefreshToken(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()
	ctx := context.Background()

	plainToken := "token-to-revoke"
	tokenHash := service.tokens.HashToken(plainToken)

	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
		WithArgs(tokenHash).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := service.RevokeRefreshToken(ctx, plainToken)
	assert.NoError(t, err)
}

func TestGenerateJWTToken(t *testing.T) {
	service, _, cleanup := setupTestService(t)
	defer cleanup()

	user := &User{
		ID:    1,
		Email: "test@example.com",
		Role:  "client",
	}

	token, err := service.generateToken(user)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	// Verify token can be parsed
	parsedToken, err := jwt.Parse(token, func(token *jwt.Token) (any, error) {
		return []byte(service.cfg.JWTSecret), nil
	})
	require.NoError(t, err)
	assert.True(t, parsedToken.Valid)

	// Verify claims
	claims, ok := parsedToken.Claims.(jwt.MapClaims)
	require.True(t, ok)
	assert.Equal(t, float64(user.ID), claims["user_id"])
	assert.Equal(t, user.Email, claims["email"])
	assert.Equal(t, user.Role, claims["role"])

	// Verify 15 min expiry (not 7 days)
	exp := int64(claims["exp"].(float64))
	iat := int64(claims["iat"].(float64))
	assert.InDelta(t, 15*60, exp-iat, 5) // 15 minutes +/- 5 seconds
}

func TestLoginRememberMe(t *testing.T) {
	for _, tc := range []struct {
		name        string
		rememberMe  bool
		expectedTTL time.Duration
	}{
		{"rememberMe=false uses default TTL", false, RefreshTokenTTLDefault},
		{"rememberMe=true uses extended TTL", true, RefreshTokenTTLRememberMe},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()
			ctx := context.Background()

			hashedPw, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

			mock.ExpectQuery("SELECT id, email").
				WithArgs("test@example.com").
				WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "email_verified", "onboarding_completed", "created_at", "deletion_requested_at", "token_version"}).
					AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", false, false, time.Now(), nil, 0))

			mock.ExpectExec("INSERT INTO refresh_tokens").
				WithArgs(int64(1), sqlmock.AnyArg(), expiresAtMatcher{tc.expectedTTL}, "127.0.0.1", "TestAgent", tc.rememberMe).
				WillReturnResult(sqlmock.NewResult(1, 1))

			result, err := service.Login(ctx, "test@example.com", "password123", "127.0.0.1", "TestAgent", tc.rememberMe)
			assert.NoError(t, err)
			assert.NotNil(t, result)
			assert.NotEmpty(t, result.Token)
			assert.NotEmpty(t, result.RefreshToken)
		})
	}
}

func TestRefreshTokensInheritsRememberMe(t *testing.T) {
	for _, tc := range []struct {
		name        string
		rememberMe  bool
		expectedTTL time.Duration
	}{
		{"inherits rememberMe=false", false, RefreshTokenTTLDefault},
		{"inherits rememberMe=true", true, RefreshTokenTTLRememberMe},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()
			ctx := context.Background()

			plainToken := "test-refresh-token"
			tokenHash := service.tokens.HashToken(plainToken)
			expiresAt := time.Now().Add(24 * time.Hour)

			mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, replaced_by_hash, remember_me").
				WithArgs(tokenHash).
				WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at", "replaced_by_hash", "remember_me"}).
					AddRow(1, int64(42), expiresAt, nil, nil, tc.rememberMe))

			mock.ExpectBegin()

			mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
				WithArgs(sqlmock.AnyArg(), int64(1)).
				WillReturnResult(sqlmock.NewResult(0, 1))

			mock.ExpectExec("INSERT INTO refresh_tokens").
				WithArgs(int64(42), sqlmock.AnyArg(), expiresAtMatcher{tc.expectedTTL}, "127.0.0.1", "TestAgent", tc.rememberMe).
				WillReturnResult(sqlmock.NewResult(2, 1))

			mock.ExpectCommit()

			mock.ExpectQuery("SELECT id, email").
				WithArgs(int64(42)).
				WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at", "token_version"}).
					AddRow(42, "user@example.com", "User", "client", true, true, time.Now(), 0))

			result, err := service.RefreshTokens(ctx, plainToken, "127.0.0.1", "TestAgent")
			assert.NoError(t, err)
			assert.NotNil(t, result)
			assert.NotEmpty(t, result.Token)
			assert.NotEmpty(t, result.RefreshToken)
		})
	}
}

func TestGenerateDefaultIdentity(t *testing.T) {
	t.Run("deterministic by user ID", func(t *testing.T) {
		name1, avatar1 := generateDefaultIdentity(1)
		name2, avatar2 := generateDefaultIdentity(1)
		assert.Equal(t, name1, name2, "same ID should produce same name")
		assert.Equal(t, avatar1, avatar2, "same ID should produce same avatar")
	})

	t.Run("different IDs produce different names", func(t *testing.T) {
		name1, _ := generateDefaultIdentity(1)
		name2, _ := generateDefaultIdentity(2)
		assert.NotEqual(t, name1, name2)
	})

	t.Run("name has color and animal", func(t *testing.T) {
		name, _ := generateDefaultIdentity(42)
		parts := strings.Split(name, " ")
		assert.Len(t, parts, 2, "name should be 'Color Animal'")
	})

	t.Run("avatar URL points to SVG", func(t *testing.T) {
		_, avatar := generateDefaultIdentity(42)
		assert.True(t, strings.HasPrefix(avatar, "/avatars/default/"))
		assert.True(t, strings.HasSuffix(avatar, ".svg"))
	})
}

// Somebody signing in during the cancellation window has almost certainly
// changed their mind. The app can only offer them the way back if the sign-in
// tells it there is something to come back from.
func TestLogin_ReportsAPendingDeletion(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	hashedPw, err := bcrypt.GenerateFromPassword([]byte("Password123!"), bcrypt.MinCost)
	require.NoError(t, err)
	requestedAt := time.Now().Add(-3 * 24 * time.Hour)

	mock.ExpectQuery("SELECT id, email").
		WithArgs("leaving@example.com").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "email", "name", "password", "role", "email_verified",
			"onboarding_completed", "created_at", "deletion_requested_at", "token_version",
		}).AddRow(1, "leaving@example.com", "Leaving", string(hashedPw), "client", true, true,
			time.Now(), requestedAt, 0))
	mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))

	result, err := service.Login(context.Background(), "leaving@example.com", "Password123!", "ip", "ua", false)

	require.NoError(t, err)
	require.NotNil(t, result.PendingDeletion)
	assert.Equal(t, requestedAt.Add(accountCancellationWindow), result.PendingDeletion.ScheduledFor)
}

// An ordinary account says nothing about deletion, so a screen has nothing to
// react to.
func TestLogin_SaysNothingWhenNothingIsPending(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	hashedPw, err := bcrypt.GenerateFromPassword([]byte("Password123!"), bcrypt.MinCost)
	require.NoError(t, err)

	mock.ExpectQuery("SELECT id, email").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "email", "name", "password", "role", "email_verified",
			"onboarding_completed", "created_at", "deletion_requested_at", "token_version",
		}).AddRow(1, "user@example.com", "User", string(hashedPw), "client", true, true, time.Now(), nil, 0))
	mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))

	result, err := service.Login(context.Background(), "user@example.com", "Password123!", "ip", "ua", false)

	require.NoError(t, err)
	assert.Nil(t, result.PendingDeletion)
}

// Аккаунт без пароля не должен выдавать себя ответом: иначе вход по паролю
// становится способом узнать, каким образом человек регистрировался. Таких
// аккаунтов в системе уже два вида — заведённые внешним провайдером и, после
// этого изменения, заведённые по ссылке входа.
func TestLoginIntoPasswordlessAccountLooksLikeWrongPassword(t *testing.T) {
	svc, mock, cleanup := setupTestService(t)
	defer cleanup()

	expectUserRow(mock, "passwordless@example.com", nil)
	_, errNoPassword := svc.Login(context.Background(),
		"passwordless@example.com", "guess", "ip", "ua", false)

	expectUserRow(mock, "withpass@example.com", strPtr(bcryptOf(t, "correct horse")))
	_, errWrongPassword := svc.Login(context.Background(),
		"withpass@example.com", "guess", "ip", "ua", false)

	require.Error(t, errNoPassword)
	require.Error(t, errWrongPassword)
	assert.True(t, errors.Is(errNoPassword, apperrors.ErrInvalidCredentials),
		"беспарольный аккаунт обязан отвечать тем же, чем неверный пароль, получено: %v", errNoPassword)
	assert.True(t, errors.Is(errWrongPassword, apperrors.ErrInvalidCredentials))
}

// Пустая строка в базе не пароль, а отсутствие пароля. Ветка миграции
// plaintext-пароля в bcrypt сравнивает сохранённое значение с присланным
// напрямую, и на двух пустых строках это сравнение истинно — то есть вход
// удаётся без пароля вовсе.
func TestLoginRefusesEmptyStoredPassword(t *testing.T) {
	svc, mock, cleanup := setupTestService(t)
	defer cleanup()
	empty := ""
	expectUserRow(mock, "empty@example.com", &empty)
	_, errEmptyGuess := svc.Login(context.Background(), "empty@example.com", "", "ip", "ua", false)

	expectUserRow(mock, "empty@example.com", &empty)
	_, errAnyGuess := svc.Login(context.Background(), "empty@example.com", "что угодно", "ip", "ua", false)

	assert.True(t, errors.Is(errEmptyGuess, apperrors.ErrInvalidCredentials),
		"пустой пароль к пустому сохранённому значению обязан быть отказом, получено: %v", errEmptyGuess)
	assert.True(t, errors.Is(errAnyGuess, apperrors.ErrInvalidCredentials))
}

// Миграция настоящего plaintext-пароля должна продолжать работать: этот тест
// охраняет починку от того, чтобы она заодно сломала легаси-вход.
func TestLoginStillMigratesRealPlaintextPassword(t *testing.T) {
	svc, mock, cleanup := setupTestService(t)
	defer cleanup()

	stored := "legacy-plaintext"
	expectUserRow(mock, "legacy@example.com", &stored)
	mock.ExpectExec(`UPDATE users SET password`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))

	result, err := svc.Login(context.Background(), "legacy@example.com", "legacy-plaintext", "ip", "ua", false)

	require.NoError(t, err)
	require.NotNil(t, result)
	require.NoError(t, mock.ExpectationsWereMet())
}
