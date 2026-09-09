package telemetry

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// An alert that names a metric nobody publishes never fires, and says nothing
// about it. It looks exactly like an alert that is not needed — which is how a
// rule survives a rename and gets discovered during the incident it was
// written for.
//
// The rules live in monitoring/alerts.yml; the metrics are declared here. This
// compares one against the other.
func TestAlertRulesNameMetricsThatExist(t *testing.T) {
	rules, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "monitoring", "alerts.yml"))
	require.NoError(t, err, "monitoring/alerts.yml must be readable from here")

	published := publishedMetricNames(t)
	require.NotEmpty(t, published)

	// Metric names as they appear in an expression: the namespace prefix plus
	// the name, before any label selector.
	referenced := regexp.MustCompile(`\bburcev_[a-z0-9_]+`).FindAllString(string(rules), -1)
	require.NotEmpty(t, referenced, "no metric references found — the pattern is out of date")

	var unknown []string
	for _, name := range referenced {
		if !published[name] {
			unknown = append(unknown, name)
		}
	}
	sort.Strings(unknown)
	assert.Empty(t, unknown,
		"alert rules reference metrics this service does not publish: %v", unknown)
}

// publishedMetricNames reads the declarations out of metrics.go rather than
// listing them again, for the same reason the rules are read from their own
// file: a copy is a thing that goes out of step.
func publishedMetricNames(t *testing.T) map[string]bool {
	t.Helper()

	source, err := os.ReadFile("metrics.go")
	require.NoError(t, err)

	names := map[string]bool{}

	// prometheus.CounterOpts{... Name: "x" ...} and the like.
	for _, m := range regexp.MustCompile(`Name:\s+"([a-z0-9_]+)"`).FindAllStringSubmatch(string(source), -1) {
		names["burcev_"+m[1]] = true
	}
	// gauge(namespace, "x", ...)
	for _, m := range regexp.MustCompile(`gauge\(namespace,\s*"([a-z0-9_]+)"`).FindAllStringSubmatch(string(source), -1) {
		names["burcev_"+m[1]] = true
	}

	// Counters are exposed with a _total suffix already present in the names
	// above; histograms also publish _bucket, _sum and _count.
	for name := range names {
		if strings.HasSuffix(name, "_seconds") {
			names[name+"_bucket"] = true
			names[name+"_sum"] = true
			names[name+"_count"] = true
		}
	}

	return names
}
