package users

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestService() *Service {
	cfg := &config.Config{
		Env:       "test",
		JWTSecret: "test-secret",
	}
	log := logger.New()
	return NewService(cfg, log)
}

func TestNewService(t *testing.T) {
	service := setupTestService()
	assert.NotNil(t, service)
	assert.NotNil(t, service.cfg)
	assert.NotNil(t, service.log)
}

func TestService_GetProfile(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	profile, err := service.GetProfile(ctx, int64(123))

	require.NoError(t, err)
	assert.NotNil(t, profile)
	assert.Equal(t, int64(123), profile.ID)
	assert.NotEmpty(t, profile.Email)
	assert.NotEmpty(t, profile.Name)
	assert.NotEmpty(t, profile.Role)
}

func TestService_GetProfile_DifferentUserIDs(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	tests := []struct {
		name   string
		userID int64
	}{
		{"User ID 1", 1},
		{"User ID 123", 123},
		{"User ID 999", 999},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profile, err := service.GetProfile(ctx, tt.userID)
			require.NoError(t, err)
			assert.Equal(t, tt.userID, profile.ID)
		})
	}
}

func TestService_UpdateProfile(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	profile, err := service.UpdateProfile(ctx, int64(123), "New Name")

	require.NoError(t, err)
	assert.NotNil(t, profile)
	assert.Equal(t, int64(123), profile.ID)
	assert.Equal(t, "New Name", profile.Name)
	assert.NotEmpty(t, profile.Email)
	assert.NotEmpty(t, profile.Role)
}

func TestService_UpdateProfile_EmptyName(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	profile, err := service.UpdateProfile(ctx, int64(123), "")

	require.NoError(t, err)
	assert.NotNil(t, profile)
	assert.Equal(t, "", profile.Name)
}

func TestService_UpdateProfile_LongName(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	longName := "This is a very long name that might exceed typical database limits"
	profile, err := service.UpdateProfile(ctx, int64(123), longName)

	require.NoError(t, err)
	assert.NotNil(t, profile)
	assert.Equal(t, longName, profile.Name)
}

func TestService_UpdateProfile_SpecialCharacters(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	tests := []struct {
		name     string
		userName string
	}{
		{"Cyrillic", "Иван Петров"},
		{"Special chars", "O'Brien-Smith"},
		{"Numbers", "User123"},
		{"Emoji", "User 😊"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profile, err := service.UpdateProfile(ctx, int64(123), tt.userName)
			require.NoError(t, err)
			assert.Equal(t, tt.userName, profile.Name)
		})
	}
}
