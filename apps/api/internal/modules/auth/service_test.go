package auth

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestService() *Service {
	cfg := &config.Config{
		JWTSecret: "test-secret-key",
	}
	log := logger.New()
	return NewService(cfg, log)
}

func TestRegisterService(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	tests := []struct {
		name     string
		email    string
		password string
		userName string
		wantErr  bool
	}{
		{
			name:     "successful registration",
			email:    "test@example.com",
			password: "password123",
			userName: "Test User",
			wantErr:  false,
		},
		{
			name:     "registration without name",
			email:    "test2@example.com",
			password: "password123",
			userName: "",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			user, err := service.Register(ctx, tt.email, tt.password, tt.userName)

			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, user)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, user)
				assert.Equal(t, tt.email, user.Email)
				assert.Equal(t, tt.userName, user.Name)
				assert.Equal(t, "client", user.Role)
				assert.NotEmpty(t, user.ID)
			}
		})
	}
}

func TestLoginService(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	tests := []struct {
		name     string
		email    string
		password string
		wantErr  bool
	}{
		{
			name:     "successful login",
			email:    "test@example.com",
			password: "password123",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := service.Login(ctx, tt.email, tt.password)

			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, result)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, result)
				assert.NotNil(t, result.User)
				assert.NotEmpty(t, result.Token)
				assert.Equal(t, tt.email, result.User.Email)
			}
		})
	}
}

func TestGenerateJWTToken(t *testing.T) {
	service := setupTestService()

	user := &User{
		ID:    "user-123",
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
	assert.Equal(t, user.ID, claims["user_id"])
	assert.Equal(t, user.Email, claims["email"])
	assert.Equal(t, user.Role, claims["role"])
}

func BenchmarkRegister(b *testing.B) {
	service := setupTestService()
	ctx := context.Background()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = service.Register(ctx, "test@example.com", "password123", "Test User")
	}
}

func BenchmarkLogin(b *testing.B) {
	service := setupTestService()
	ctx := context.Background()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = service.Login(ctx, "test@example.com", "password123")
	}
}

func BenchmarkGenerateJWTToken(b *testing.B) {
	service := setupTestService()
	user := &User{
		ID:    "user-123",
		Email: "test@example.com",
		Role:  "client",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = service.generateToken(user)
	}
}
