package support

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The embedded corpus is a copy of docs/user-guide, because go:embed cannot
// reach outside the module. A silently stale copy would have the bot answering
// from documentation nobody is reading any more.
func TestKnowledgeMatchesUserGuide(t *testing.T) {
	const guideDir = "../../../../../docs/user-guide"

	guide, err := os.ReadDir(guideDir)
	require.NoError(t, err, "docs/user-guide must exist; run `make sync-knowledge` after moving it")

	embedded, err := corpusFS.ReadDir("knowledge")
	require.NoError(t, err)

	embeddedNames := map[string]bool{}
	for _, entry := range embedded {
		embeddedNames[entry.Name()] = true
	}

	for _, entry := range guide {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		assert.True(t, embeddedNames[entry.Name()],
			"%s is in the user guide but not embedded; run `make sync-knowledge`", entry.Name())
		delete(embeddedNames, entry.Name())

		want, err := os.ReadFile(filepath.Join(guideDir, entry.Name()))
		require.NoError(t, err)
		got, err := corpusFS.ReadFile("knowledge/" + entry.Name())
		require.NoError(t, err)

		assert.Equal(t, string(want), string(got),
			"%s has drifted from the user guide; run `make sync-knowledge`", entry.Name())
	}

	assert.Empty(t, embeddedNames, "embedded documents no longer in the user guide")
}

// The prefix is sent on every question and paid for once, provided it never
// changes. Anything varying here — a timestamp, a request id, a greeting —
// would turn every question into a cache miss.
func TestPrefix_IsByteStable(t *testing.T) {
	first, err := buildPrefix()
	require.NoError(t, err)
	second, err := buildPrefix()
	require.NoError(t, err)

	assert.Equal(t, first, second)
	assert.NotEmpty(t, first)
}

// The instruction is what stops the bot inventing an answer about money or
// health data, so its parts are asserted rather than assumed.
func TestPrefix_CarriesTheRulesAndTheWholeCorpus(t *testing.T) {
	prefix, err := buildPrefix()
	require.NoError(t, err)

	assert.Contains(t, prefix, EscalationMarker,
		"the refusal marker must be in the instruction, or refusal cannot be detected")
	assert.Contains(t, prefix, "ТОЛЬКО по документации")
	assert.Contains(t, prefix, "Не выдумывай цены")
	assert.Contains(t, prefix, "показатели здоровья")

	entries, err := corpusFS.ReadDir("knowledge")
	require.NoError(t, err)
	require.NotEmpty(t, entries)
	for _, entry := range entries {
		assert.Contains(t, prefix, strings.TrimSuffix(entry.Name(), ".md"),
			"every document must be in the prefix")
	}

	// The instruction has to precede the corpus: rules stated after the text
	// they govern are advice, not constraints.
	assert.Less(t, strings.Index(prefix, "ТОЛЬКО по документации"),
		strings.Index(prefix, "=== 01"))
}
