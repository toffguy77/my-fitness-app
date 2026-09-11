package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

// The service used to take its environment's name from NODE_ENV, a Node.js
// convention that compose set to "production" for this Go service in both
// deployments. Dev therefore called itself production in its health answer, in
// every log line, and — once error reporting is switched on — in every report
// it would file, landing dev noise in the production project.
//
// APP_ENV is what the deployment actually sets per environment.
func TestTheEnvironmentIsNamedByAppEnv(t *testing.T) {
	t.Run("APP_ENV wins", func(t *testing.T) {
		t.Setenv("APP_ENV", "dev")
		t.Setenv("NODE_ENV", "production")

		assert.Equal(t, "dev", getEnvWithFallback("APP_ENV", "NODE_ENV", "development"))
	})

	t.Run("NODE_ENV still answers when APP_ENV is absent", func(t *testing.T) {
		os.Unsetenv("APP_ENV")
		t.Setenv("NODE_ENV", "production")

		assert.Equal(t, "production", getEnvWithFallback("APP_ENV", "NODE_ENV", "development"))
	})

	t.Run("neither means development", func(t *testing.T) {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("NODE_ENV")

		assert.Equal(t, "development", getEnvWithFallback("APP_ENV", "NODE_ENV", "development"))
	})
}

// Both spellings count. The deployment says "prod" and Node says "production";
// accepting only one would quietly switch off the strict startup checks in the
// environment that needs them most.
func TestProductionIsRecognisedByEitherName(t *testing.T) {
	for _, name := range []string{"prod", "production", "Production", "PROD"} {
		assert.True(t, (&Config{Env: name}).IsProduction(), "%q must count as production", name)
	}
	for _, name := range []string{"dev", "development", "staging", ""} {
		assert.False(t, (&Config{Env: name}).IsProduction(), "%q must not count as production", name)
	}
}
