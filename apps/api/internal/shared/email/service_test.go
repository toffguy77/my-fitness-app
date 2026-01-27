package email

import (
	"context"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewService(t *testing.T) {
	log := logger.New()

	tests := []struct {
		name        string
		config      Config
		expectError bool
		errorMsg    string
	}{
		{
			name: "Valid configuration",
			config: Config{
				SMTPHost:     "smtp.yandex.ru",
				SMTPPort:     465,
				SMTPUsername: "test@yandex.ru",
				SMTPPassword: "password",
				FromAddress:  "noreply@burcev.team",
				FromName:     "BURCEV",
			},
			expectError: false,
		},
		{
			name: "Missing SMTP host",
			config: Config{
				SMTPPort:     465,
				SMTPUsername: "test@yandex.ru",
				SMTPPassword: "password",
				FromAddress:  "noreply@burcev.team",
			},
			expectError: true,
			errorMsg:    "SMTP host is required",
		},
		{
			name: "Missing SMTP username",
			config: Config{
				SMTPHost:     "smtp.yandex.ru",
				SMTPPort:     465,
				SMTPPassword: "password",
				FromAddress:  "noreply@burcev.team",
			},
			expectError: true,
			errorMsg:    "SMTP username is required",
		},
		{
			name: "Missing SMTP password",
			config: Config{
				SMTPHost:     "smtp.yandex.ru",
				SMTPPort:     465,
				SMTPUsername: "test@yandex.ru",
				FromAddress:  "noreply@burcev.team",
			},
			expectError: true,
			errorMsg:    "SMTP password is required",
		},
		{
			name: "Missing from address",
			config: Config{
				SMTPHost:     "smtp.yandex.ru",
				SMTPPort:     465,
				SMTPUsername: "test@yandex.ru",
				SMTPPassword: "password",
			},
			expectError: true,
			errorMsg:    "from address is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service, err := NewService(tt.config, log)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorMsg)
				assert.Nil(t, service)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, service)
				assert.Equal(t, tt.config.SMTPHost, service.smtpHost)
				assert.Equal(t, tt.config.SMTPPort, service.smtpPort)
				assert.Equal(t, tt.config.SMTPUsername, service.smtpUsername)
				assert.Equal(t, tt.config.FromAddress, service.fromAddress)
			}
		})
	}
}

func TestRenderTemplate(t *testing.T) {
	log := logger.New()
	config := Config{
		SMTPHost:     "smtp.yandex.ru",
		SMTPPort:     465,
		SMTPUsername: "test@yandex.ru",
		SMTPPassword: "password",
		FromAddress:  "noreply@burcev.team",
		FromName:     "BURCEV",
	}

	service, err := NewService(config, log)
	require.NoError(t, err)

	t.Run("Render password reset template", func(t *testing.T) {
		data := ResetEmailData{
			UserEmail:      "user@example.com",
			ResetURL:       "https://burcev.team/reset-password?token=abc123",
			ExpirationTime: time.Now().Add(1 * time.Hour),
			SupportEmail:   "support@burcev.team",
		}

		body, err := service.renderTemplate("password_reset", data)

		assert.NoError(t, err)
		assert.Contains(t, body, "Password Reset Request")
		assert.Contains(t, body, data.UserEmail)
		assert.Contains(t, body, data.ResetURL)
		assert.Contains(t, body, data.SupportEmail)
		assert.Contains(t, body, "<!DOCTYPE html>")
	})

	t.Run("Render password changed template", func(t *testing.T) {
		data := PasswordChangedEmailData{
			UserEmail:    "user@example.com",
			ChangedAt:    time.Now(),
			IPAddress:    "192.168.1.1",
			SupportEmail: "support@burcev.team",
		}

		body, err := service.renderTemplate("password_changed", data)

		assert.NoError(t, err)
		assert.Contains(t, body, "Password Successfully Changed")
		assert.Contains(t, body, data.UserEmail)
		assert.Contains(t, body, data.IPAddress)
		assert.Contains(t, body, data.SupportEmail)
		assert.Contains(t, body, "<!DOCTYPE html>")
	})

	t.Run("Invalid template name", func(t *testing.T) {
		_, err := service.renderTemplate("nonexistent", nil)
		assert.Error(t, err)
	})
}

func TestPasswordResetEmailContent(t *testing.T) {
	log := logger.New()
	config := Config{
		SMTPHost:     "smtp.yandex.ru",
		SMTPPort:     465,
		SMTPUsername: "test@yandex.ru",
		SMTPPassword: "password",
		FromAddress:  "noreply@burcev.team",
		FromName:     "BURCEV",
	}

	service, err := NewService(config, log)
	require.NoError(t, err)

	data := ResetEmailData{
		UserEmail:      "user@example.com",
		ResetURL:       "https://burcev.team/reset-password?token=abc123",
		ExpirationTime: time.Date(2026, 1, 27, 15, 0, 0, 0, time.UTC),
		SupportEmail:   "support@burcev.team",
	}

	body, err := service.renderTemplate("password_reset", data)
	require.NoError(t, err)

	// Verify all required content is present
	requiredContent := []string{
		"Password Reset Request",
		"user@example.com",
		"https://burcev.team/reset-password?token=abc123",
		"Reset Password",
		"This link will expire",
		"Security Notice",
		"If you did not request a password reset",
		"support@burcev.team",
	}

	for _, content := range requiredContent {
		assert.Contains(t, body, content, "Email should contain: %s", content)
	}
}

func TestPasswordChangedEmailContent(t *testing.T) {
	log := logger.New()
	config := Config{
		SMTPHost:     "smtp.yandex.ru",
		SMTPPort:     465,
		SMTPUsername: "test@yandex.ru",
		SMTPPassword: "password",
		FromAddress:  "noreply@burcev.team",
		FromName:     "BURCEV",
	}

	service, err := NewService(config, log)
	require.NoError(t, err)

	data := PasswordChangedEmailData{
		UserEmail:    "user@example.com",
		ChangedAt:    time.Date(2026, 1, 27, 15, 0, 0, 0, time.UTC),
		IPAddress:    "192.168.1.1",
		SupportEmail: "support@burcev.team",
	}

	body, err := service.renderTemplate("password_changed", data)
	require.NoError(t, err)

	// Verify all required content is present
	requiredContent := []string{
		"Password Successfully Changed",
		"user@example.com",
		"192.168.1.1",
		"Changed at:",
		"IP Address:",
		"Did not make this change?",
		"support@burcev.team",
	}

	for _, content := range requiredContent {
		assert.Contains(t, body, content, "Email should contain: %s", content)
	}
}

func TestParseTemplates(t *testing.T) {
	templates, err := parseTemplates()

	assert.NoError(t, err)
	assert.NotNil(t, templates)

	// Verify both templates are available
	assert.NotNil(t, templates.Lookup("password_reset"))
	assert.NotNil(t, templates.Lookup("password_changed"))
}

// Note: Actual SMTP sending tests are skipped as they require a real SMTP server
// In production, these would be integration tests with a test SMTP server
func TestSendPasswordResetEmail_Integration(t *testing.T) {
	t.Skip("Skipping integration test - requires real SMTP server")

	log := logger.New()
	config := Config{
		SMTPHost:     "smtp.yandex.ru",
		SMTPPort:     465,
		SMTPUsername: "test@yandex.ru",
		SMTPPassword: "password",
		FromAddress:  "noreply@burcev.team",
		FromName:     "BURCEV",
	}

	service, err := NewService(config, log)
	require.NoError(t, err)

	data := ResetEmailData{
		UserEmail:      "test@example.com",
		ResetURL:       "https://burcev.team/reset-password?token=test123",
		ExpirationTime: time.Now().Add(1 * time.Hour),
		SupportEmail:   "support@burcev.team",
	}

	err = service.SendPasswordResetEmail(context.Background(), data)
	assert.NoError(t, err)
}

func TestSendPasswordChangedEmail_Integration(t *testing.T) {
	t.Skip("Skipping integration test - requires real SMTP server")

	log := logger.New()
	config := Config{
		SMTPHost:     "smtp.yandex.ru",
		SMTPPort:     465,
		SMTPUsername: "test@yandex.ru",
		SMTPPassword: "password",
		FromAddress:  "noreply@burcev.team",
		FromName:     "BURCEV",
	}

	service, err := NewService(config, log)
	require.NoError(t, err)

	data := PasswordChangedEmailData{
		UserEmail:    "test@example.com",
		ChangedAt:    time.Now(),
		IPAddress:    "192.168.1.1",
		SupportEmail: "support@burcev.team",
	}

	err = service.SendPasswordChangedEmail(context.Background(), data)
	assert.NoError(t, err)
}
