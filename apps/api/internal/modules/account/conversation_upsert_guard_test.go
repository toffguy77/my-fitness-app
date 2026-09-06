package account_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// conversations no longer carries a plain UNIQUE(client_id, curator_id): the
// rule applies to live conversations only, so that a curator can lose more than
// one client to erasure. It is a partial index now, and Postgres matches an
// ON CONFLICT to a partial index only when the statement repeats the predicate.
//
// Without it the insert fails at runtime with "no unique or exclusion
// constraint matching the ON CONFLICT specification" — which is to say, when a
// curator is assigned a client, in production, and never in a unit test that
// mocks the database.
func TestConversationUpsertsTargetThePartialIndex(t *testing.T) {
	conflict := regexp.MustCompile(`ON CONFLICT \((?:client_id, curator_id|curator_id, client_id)\)([^\n]*)`)

	var offenders []string
	root := filepath.Join("..", "..", "..", "internal")
	require.NoError(t, filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		source, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, match := range conflict.FindAllStringSubmatch(string(source), -1) {
			// curator_client_relationships keeps its own plain constraint; only
			// the conversations table changed.
			if !strings.Contains(match[0], "client_id, curator_id") {
				continue
			}
			if !strings.Contains(match[1], "anonymized_at IS NULL") {
				offenders = append(offenders, path+": "+strings.TrimSpace(match[0]))
			}
		}
		return nil
	}))

	assert.Empty(t, offenders,
		"an upsert on conversations must name the partial index's predicate "+
			"(WHERE anonymized_at IS NULL), or Postgres cannot match it: %v", offenders)
}
