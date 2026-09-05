package config

import (
	"os"
	"regexp"
	"sort"
	"testing"

	"github.com/stretchr/testify/require"
)

// The compose file lists every environment variable it passes to the API,
// one by one. A variable the service reads but compose does not forward is
// silently empty in every deployed environment — the operator sets it in the
// panel, it never reaches the process, and the capability stays off with no
// error anywhere.
//
// That is exactly how web push shipped switched off: VAPID_* were added to the
// config and to .env.example, and the compose file was not touched.
func TestComposePassesEveryVariableTheServiceReads(t *testing.T) {
	source, err := os.ReadFile("config.go")
	require.NoError(t, err)

	compose, err := os.ReadFile("../../../../docker-compose.yml")
	require.NoError(t, err)

	// Each entry is the names that would satisfy one read: the variable
	// itself, plus whatever it falls back to. Passing either is enough — the
	// data-export buckets, for instance, fall back to the shared S3 credentials
	// and are configured that way in every environment we run.
	var reads [][]string
	for _, m := range envReadPattern.FindAllStringSubmatch(string(source), -1) {
		names := []string{m[1]}
		if m[2] != "" && len(m[0]) > len("getEnvWithFallback") && m[0][:18] == "getEnvWithFallback" {
			names = append(names, m[2])
		}
		reads = append(reads, names)
	}
	require.NotEmpty(t, reads, "regex failed to find any variables — it is out of date")

	// Variables the container gets by other means, or deliberately never gets.
	exempt := map[string]struct{}{
		// The service assembles the connection string from these parts when
		// DATABASE_URL is absent, and compose passes the parts.
		"DATABASE_URL": {},
		// Set by the runtime, not by an operator.
		"PORT": {}, "NODE_ENV": {},
		// Test-only knob. Production must never scale its auth limits.
		"AUTH_RATE_LIMIT_SCALE": {},
	}

	passed := func(name string) bool {
		return regexp.MustCompile(`(?m)^\s*-\s*` + name + `=`).Match(compose)
	}

	var missing []string
	for _, names := range reads {
		if _, ok := exempt[names[0]]; ok {
			continue
		}
		satisfied := false
		for _, name := range names {
			if passed(name) {
				satisfied = true
				break
			}
		}
		if !satisfied {
			missing = append(missing, names[0])
		}
	}
	sort.Strings(missing)
	require.Empty(t, missing,
		"read by config.go but not passed to the container in docker-compose.yml: %v", missing)
}
