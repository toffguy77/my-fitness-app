package auth

import (
	"context"
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
	t.Run("successful registration", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("INSERT INTO users").
			WithArgs("test@example.com", sqlmock.AnyArg(), "Test User").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "created_at"}).
				AddRow(1, "test@example.com", "Test User", "client", time.Now()))

		user, err := service.Register(ctx, "test@example.com", "password123", "Test User")
		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "test@example.com", user.Email)
		assert.Equal(t, "Test User", user.Name)
		assert.Equal(t, "client", user.Role)
	})

	t.Run("registration without name", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("INSERT INTO users").
			WithArgs("test2@example.com", sqlmock.AnyArg(), "").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "created_at"}).
				AddRow(2, "test2@example.com", "", "client", time.Now()))

		user, err := service.Register(ctx, "test2@example.com", "password123", "")
		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, "test2@example.com", user.Email)
	})
}

func TestLoginService(t *testing.T) {
	t.Run("successful login", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		hashedPw, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

		mock.ExpectQuery("SELECT id, email, name, password, role, created_at").
			WithArgs("test@example.com").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "created_at"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", time.Now()))

		result, err := service.Login(ctx, "test@example.com", "password123")
		assert.NoError(t, err)
		assert.NotNil(t, result)
		assert.NotNil(t, result.User)
		assert.NotEmpty(t, result.Token)
		assert.Equal(t, "test@example.com", result.User.Email)
	})

	t.Run("wrong password", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		hashedPw, _ := bcrypt.GenerateFromPassword([]byte("correctpassword"), bcrypt.DefaultCost)

		mock.ExpectQuery("SELECT id, email, name, password, role, created_at").
			WithArgs("test@example.com").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "created_at"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", time.Now()))

		result, err := service.Login(ctx, "test@example.com", "wrongpassword")
		assert.Error(t, err)
		assert.Nil(t, result)
	})
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
}
