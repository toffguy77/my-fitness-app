package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// client-config: «Неверный формат» — IOS_MIN_SUPPORTED_VERSION=1.2 в проде
// останавливает старт с именем переменной.
func TestIOSMinSupportedVersionInvalidInProductionIsFatal(t *testing.T) {
	for _, value := range []string{"1.2", "1.2.3.4", "v1.2.3", "1.2.x", "01.2.3", " 1.2.3"} {
		t.Run(value, func(t *testing.T) {
			prodEnv(t)
			t.Setenv("IOS_MIN_SUPPORTED_VERSION", value)

			_, err := loadIn(t)

			require.Error(t, err)
			assert.Contains(t, err.Error(), "IOS_MIN_SUPPORTED_VERSION")
		})
	}
}

func TestIOSMinSupportedVersionValidInProduction(t *testing.T) {
	prodEnv(t)
	t.Setenv("IOS_MIN_SUPPORTED_VERSION", "0.4.0")

	cfg, err := loadIn(t)

	require.NoError(t, err)
	assert.Equal(t, "0.4.0", cfg.IOSMinSupportedVersion)
}

// Без переменной поле равно 0.0.0: обновляться не требуется никому.
func TestIOSMinSupportedVersionDefaultsToZero(t *testing.T) {
	prodEnv(t)

	cfg, err := loadIn(t)

	require.NoError(t, err)
	assert.Equal(t, "0.0.0", cfg.IOSMinSupportedVersion)
}

// Вне прода неверный формат старт не останавливает — как и прочие проверки
// обязательных значений.
func TestIOSMinSupportedVersionInvalidOutsideProductionStarts(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("NODE_ENV", "development")
	t.Setenv("DB_PASSWORD", "local")
	t.Setenv("IOS_MIN_SUPPORTED_VERSION", "1.2")

	_, err := loadIn(t)

	require.NoError(t, err)
}

// apple_sign_in включён только со всеми четырьмя APPLE_* и ключом шифрования
// токенов Apple.
func TestAppleSignInNeedsAllItsVariables(t *testing.T) {
	all := map[string]string{
		"APPLE_TEAM_ID":              "TEAM123456",
		"APPLE_BUNDLE_ID":            "team.burcev.app",
		"APPLE_KEY_ID":               "KEY1234567",
		"APPLE_PRIVATE_KEY":          "-----BEGIN PRIVATE KEY-----",
		"APPLE_TOKEN_ENCRYPTION_KEY": "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
	}

	prodEnv(t)
	for k, v := range all {
		t.Setenv(k, v)
	}
	cfg, err := loadIn(t)
	require.NoError(t, err)
	assert.True(t, cfg.Features.AppleSignIn)
	assert.True(t, cfg.Features.Map()["apple_sign_in"])
	assert.NotContains(t, cfg.Features.Disabled(), "apple_sign_in")

	for missing := range all {
		if missing == "APPLE_TOKEN_ENCRYPTION_KEY" {
			continue // ниже: в проде это ошибка старта, а не выключенная возможность
		}
		t.Run("without "+missing, func(t *testing.T) {
			prodEnv(t)
			for k, v := range all {
				if k != missing {
					t.Setenv(k, v)
				}
			}
			cfg, err := loadIn(t)
			require.NoError(t, err)
			assert.False(t, cfg.Features.AppleSignIn)
			assert.False(t, cfg.Features.Map()["apple_sign_in"])
			assert.Contains(t, cfg.Features.Disabled(), "apple_sign_in")
		})
	}
}

// Apple настроена, а ключа шифрования нет или он не 32 байта: в проде старт
// останавливается с именем переменной, вне прода возможность выключена.
func TestAppleTokenEncryptionKeyIsRequiredWithApple(t *testing.T) {
	apple := func(t *testing.T) {
		t.Setenv("APPLE_TEAM_ID", "TEAM123456")
		t.Setenv("APPLE_BUNDLE_ID", "team.burcev.app")
		t.Setenv("APPLE_KEY_ID", "KEY1234567")
		t.Setenv("APPLE_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----")
	}
	for name, key := range map[string]string{"absent": "", "short": "c2hvcnQ=", "not base64": "not base64!"} {
		t.Run(name+" in production", func(t *testing.T) {
			prodEnv(t)
			apple(t)
			t.Setenv("APPLE_TOKEN_ENCRYPTION_KEY", key)
			_, err := loadIn(t)
			require.Error(t, err)
			assert.Contains(t, err.Error(), "APPLE_TOKEN_ENCRYPTION_KEY")
		})
		t.Run(name+" outside production", func(t *testing.T) {
			clearConfigEnv(t)
			t.Setenv("NODE_ENV", "development")
			t.Setenv("DB_PASSWORD", "local")
			apple(t)
			t.Setenv("APPLE_TOKEN_ENCRYPTION_KEY", key)
			cfg, err := loadIn(t)
			require.NoError(t, err)
			assert.False(t, cfg.Features.AppleSignIn)
		})
	}
}
