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

// apple_sign_in включён только со всеми четырьмя APPLE_*.
func TestAppleSignInNeedsAllFourVariables(t *testing.T) {
	all := map[string]string{
		"APPLE_TEAM_ID":     "TEAM123456",
		"APPLE_BUNDLE_ID":   "team.burcev.app",
		"APPLE_KEY_ID":      "KEY1234567",
		"APPLE_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----",
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
