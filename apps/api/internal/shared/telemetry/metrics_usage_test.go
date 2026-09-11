package telemetry

import (
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The share is computed from two counters, so what matters is that the split
// adds up: cached plus fresh must equal what was actually sent. A metric that
// double-counts or loses tokens gives a share nobody can act on.
func TestObserveModelUsageSplitsTokens(t *testing.T) {
	m := New("burcev", nil)

	m.ObserveModelUsage(12000, 11800)
	m.ObserveModelUsage(12000, 0)

	dump := gather(t, m)
	assert.Contains(t, dump, `burcev_model_prompt_tokens_total{cached="yes"} 11800`)
	assert.Contains(t, dump, `burcev_model_prompt_tokens_total{cached="no"} 12200`)
}

// Numbers a provider cannot mean are dropped rather than recorded. Once a
// counter has taken an impossible value it keeps it until the process restarts,
// and the share is wrong for as long as anybody is looking at it.
func TestObserveModelUsageIgnoresImpossibleReports(t *testing.T) {
	m := New("burcev", nil)

	m.ObserveModelUsage(-1, 0)
	m.ObserveModelUsage(100, -5)
	m.ObserveModelUsage(100, 500) // из кэша больше, чем отправлено

	assert.NotContains(t, gather(t, m), "burcev_model_prompt_tokens_total",
		"nothing plausible was reported, so nothing should have been counted")
}

func gather(t *testing.T, m *Metrics) string {
	t.Helper()
	var sb strings.Builder
	families, err := m.registry.Gather()
	require.NoError(t, err)
	for _, f := range families {
		if !strings.Contains(f.GetName(), "model_prompt_tokens") {
			continue
		}
		for _, metric := range f.GetMetric() {
			labels := ""
			for _, l := range metric.GetLabel() {
				labels = l.GetName() + `="` + l.GetValue() + `"`
			}
			sb.WriteString(f.GetName() + "{" + labels + "} " +
				trimFloat(metric.GetCounter().GetValue()) + "\n")
		}
	}
	return sb.String()
}

func trimFloat(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}
