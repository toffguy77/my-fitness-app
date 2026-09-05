package notifications

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The database has its own opinion about which notification types exist, in a
// CHECK constraint. It went out of step once already: export_ready and
// client_left were added in Go, the constraint was not, and every attempt to
// tell somebody their data archive was ready would have failed on insert.
//
// A failure like that is invisible from the outside — the notification simply
// never appears — so it is worth a test that cannot be forgotten.
func TestNotificationTypesMatchTheDatabaseConstraint(t *testing.T) {
	inGo := []string{}
	for _, candidate := range allKnownTypeStrings() {
		if NotificationType(candidate).IsValid() {
			inGo = append(inGo, candidate)
		}
	}

	inSQL := typesFromLatestConstraint(t)

	sort.Strings(inGo)
	sort.Strings(inSQL)
	require.Equal(t, inGo, inSQL,
		"the Go type list and the database CHECK constraint disagree; "+
			"add a migration that redefines notifications_type_check")
}

// allKnownTypeStrings lists every type this package declares, so the test
// fails when one is added in Go and nowhere else.
func allKnownTypeStrings() []string {
	return []string{
		string(TypeTrainerFeedback), string(TypeAchievement), string(TypeReminder),
		string(TypeSystemUpdate), string(TypeNewFeature), string(TypeGeneral),
		string(TypeNewContent), string(TypePlanUpdated), string(TypeTaskAssigned),
		string(TypeTaskOverdue), string(TypeFeedbackReceived), string(TypeExportReady),
		string(TypeClientLeft),
	}
}

// typesFromLatestConstraint reads the newest migration that redefines the
// constraint and returns the types it allows.
func typesFromLatestConstraint(t *testing.T) []string {
	t.Helper()

	files, err := filepath.Glob(filepath.Join("..", "..", "..", "migrations", "*_up.sql"))
	require.NoError(t, err)
	sort.Strings(files)

	pattern := regexp.MustCompile(`(?s)ADD CONSTRAINT notifications_type_check\s*CHECK \(type IN \((.*?)\)\)`)

	var latest string
	for _, file := range files {
		content, err := os.ReadFile(file)
		require.NoError(t, err)
		if match := pattern.FindStringSubmatch(string(content)); match != nil {
			latest = match[1]
		}
	}
	require.NotEmpty(t, latest, "no migration defines notifications_type_check")

	types := []string{}
	for _, piece := range strings.Split(latest, ",") {
		piece = strings.TrimSpace(strings.Trim(strings.TrimSpace(piece), "'"))
		if piece != "" {
			types = append(types, piece)
		}
	}
	return types
}
