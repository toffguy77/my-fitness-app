package config

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
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
//
// Every package is scanned, not only config.go. A variable read straight from
// os.Getenv somewhere else is the same hole in a different wall: tracing and
// error reporting are configured that way, and neither goes through Config.
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

	// The same question, asked of every other package: a variable read with
	// os.Getenv is read just as surely as one read through Config.
	direct := regexp.MustCompile(`os\.Getenv\("([A-Z0-9_]+)"\)`)
	seen := map[string]bool{}
	err = filepath.Walk("..", func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || filepath.Ext(path) != ".go" {
			return err
		}
		if strings.HasSuffix(path, "_test.go") {
			return nil
		}
		// Test scaffolding, compiled only under the integration tag: what it
		// reads is set by whoever runs the tests, not by the container.
		if strings.Contains(path, "testsupport") {
			return nil
		}
		body, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, m := range direct.FindAllStringSubmatch(string(body), -1) {
			if !seen[m[1]] {
				seen[m[1]] = true
				reads = append(reads, []string{m[1]})
			}
		}
		return nil
	})
	require.NoError(t, err)

	// Variables the container gets by other means, or deliberately never gets.
	exempt := map[string]struct{}{
		// The service assembles the connection string from these parts when
		// DATABASE_URL is absent, and compose passes the parts.
		"DATABASE_URL": {},
		// Set by the runtime, not by an operator.
		"PORT": {}, "NODE_ENV": {},
		// Test-only knob. Production must never scale its auth limits.
		"AUTH_RATE_LIMIT_SCALE": {},
		// Read by the OpenTelemetry SDK itself from the endpoint above; there
		// is nothing for an operator to set separately.
		"OTEL_EXPORTER_OTLP_HEADERS": {},
		// Falls back to the connection host, which is how every environment
		// runs; it exists for a certificate whose name differs from the host.
		"DB_TLS_SERVER_NAME": {},
		// Set by the operating system.
		"HOME": {},
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
		"read by the service but not passed to the container in docker-compose.yml: %v", missing)
}
