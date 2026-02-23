package users

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
)

func setupTestService() *Service {
	cfg := &config.Config{
		Env:       "test",
		JWTSecret: "test-secret",
	}
	log := logger.New()
	return NewService(nil, nil, cfg, log)
}

func TestNewService(t *testing.T) {
	service := setupTestService()
	assert.NotNil(t, service)
	assert.NotNil(t, service.cfg)
	assert.NotNil(t, service.log)
}

func TestService_GetProfile_NilDB(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	_, err := service.GetProfile(ctx, int64(123))
	assert.Error(t, err, "GetProfile should fail with nil DB")
}

func TestService_UpdateProfile_NilDB(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	_, err := service.UpdateProfile(ctx, int64(123), "New Name")
	assert.Error(t, err, "UpdateProfile should fail with nil DB")
}

func TestService_CompleteOnboarding_NilDB(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	err := service.CompleteOnboarding(ctx, int64(123))
	assert.Error(t, err, "CompleteOnboarding should fail with nil DB")
}

func TestService_UploadAvatar_NilS3(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	_, err := service.UploadAvatar(ctx, int64(123), nil, "image/jpeg", 1024)
	assert.Error(t, err, "UploadAvatar should fail with nil S3 client")
}
