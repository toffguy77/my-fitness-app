package auth

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

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

func TestRegisterService(t *testing.T) {
	t.Run("successful registration returns LoginResult with refresh token", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("INSERT INTO users").
			WithArgs("test@example.com", sqlmock.AnyArg(), "Test User").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "onboarding_completed", "created_at"}).
				AddRow(1, "test@example.com", "Test User", "client", false, time.Now()))

		mock.ExpectExec("INSERT INTO user_settings").
			WithArgs(int64(1)).
			WillReturnResult(sqlmock.NewResult(1, 1))

		// Expect refresh token insertion
		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(1), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent").
			WillReturnResult(sqlmock.NewResult(1, 1))

		result, err := service.Register(ctx, "test@example.com", "password123", "Test User", "127.0.0.1", "TestAgent")
		assert.NoError(t, err)
		assert.NotNil(t, result)
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
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "onboarding_completed", "created_at"}).
				AddRow(2, "test2@example.com", "", "client", false, time.Now()))

		// Expect default identity update
		mock.ExpectExec("UPDATE users SET name").
			WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), int64(2)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		mock.ExpectExec("INSERT INTO user_settings").
			WithArgs(int64(2)).
			WillReturnResult(sqlmock.NewResult(1, 1))

		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(2), sqlmock.AnyArg(), sqlmock.AnyArg(), "", "").
			WillReturnResult(sqlmock.NewResult(1, 1))

		result, err := service.Register(ctx, "test2@example.com", "password123", "", "", "")
		assert.NoError(t, err)
		assert.NotNil(t, result)
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
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "onboarding_completed", "created_at"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", false, time.Now()))

		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(1), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent").
			WillReturnResult(sqlmock.NewResult(1, 1))

		result, err := service.Login(ctx, "test@example.com", "password123", "127.0.0.1", "TestAgent")
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
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "onboarding_completed", "created_at"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", false, time.Now()))

		result, err := service.Login(ctx, "test@example.com", "wrongpassword", "", "")
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
		mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens").
			WithArgs(tokenHash).
			WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at"}).
				AddRow(1, int64(42), expiresAt, nil))

		// Begin transaction
		mock.ExpectBegin()

		// Revoke old token
		mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
			WithArgs(sqlmock.AnyArg(), int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// Insert new token
		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(42), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent").
			WillReturnResult(sqlmock.NewResult(2, 1))

		// Commit transaction
		mock.ExpectCommit()

		// Look up user
		mock.ExpectQuery("SELECT id, email").
			WithArgs(int64(42)).
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "onboarding_completed", "created_at"}).
				AddRow(42, "user@example.com", "User", "client", true, time.Now()))

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

		mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens").
			WithArgs(tokenHash).
			WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at"}).
				AddRow(1, int64(42), expiredAt, nil))

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

		mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens").
			WithArgs(tokenHash).
			WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at"}).
				AddRow(1, int64(42), time.Now().Add(24*time.Hour), revokedAt))

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

		mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens").
			WithArgs(tokenHash).
			WillReturnError(sql.ErrNoRows)

		result, err := service.RefreshTokens(ctx, plainToken, "", "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid refresh token")
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
	parsedToken, err := jwt.Parse(token, func(token *jwt.Token) (interface{}, error) {
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
