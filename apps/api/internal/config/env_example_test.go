package config

import (
	"os"
	"regexp"
	"sort"
	"testing"

	"github.com/stretchr/testify/require"
)

// envReadPattern matches every environment variable name that config.go reads
// through its getEnv* helpers.
//
// The suffix is matched loosely on purpose. It used to list the helpers by
// name, so adding getEnvAsDuration quietly took its variables out of every
// check here — a variable nobody documents and nothing forwards is exactly
// what these tests exist to catch.
var envReadPattern = regexp.MustCompile(`getEnv(?:[A-Za-z]+)?\("([A-Z0-9_]+)"(?:,\s*"([A-Z0-9_]+)")?`)

// A variable that config.go reads but .env.example never mentions is invisible
// to whoever provisions an environment — which is how a service ends up
// booting with a missing credential and degrading silently.
func TestEnvExampleCoversEveryReadVariable(t *testing.T) {
	source, err := os.ReadFile("config.go")
	require.NoError(t, err)

	example, err := os.ReadFile("../../.env.example")
	require.NoError(t, err)

	// getEnvWithFallback takes a second variable name; only that helper's
	// second capture group is a variable rather than a default value.
	wanted := map[string]struct{}{}
	for _, m := range envReadPattern.FindAllStringSubmatch(string(source), -1) {
		wanted[m[1]] = struct{}{}
		if m[2] != "" && len(m[0]) > len("getEnvWithFallback") && m[0][:18] == "getEnvWithFallback" {
			wanted[m[2]] = struct{}{}
		}
	}
	// APP_DOMAIN is read directly by getResetPasswordURL, not via a helper.
	wanted["APP_DOMAIN"] = struct{}{}
	require.NotEmpty(t, wanted, "regex failed to find any variables — it is out of date")

	var missing []string
	for name := range wanted {
		if !regexp.MustCompile(`(?m)^` + name + `=`).Match(example) {
			missing = append(missing, name)
		}
	}
	sort.Strings(missing)
	require.Empty(t, missing, "variables read by config.go but absent from .env.example: %v", missing)
}
