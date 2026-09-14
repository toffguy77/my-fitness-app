//go:build integration

package database_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/require"
)

// Отпечаток схемы, собранной миграциями, против записанного в репозиторий.
//
// Нужен потому, что описание схемы однажды разошлось с тем, что есть на самом
// деле, и заметить это было нечем. Каталог еды залили в базу до появления
// миграций; миграция 005 создаёт products через CREATE TABLE IF NOT EXISTS,
// поэтому на живых средах она молча не сделала ничего, записавшись
// применённой. Репозиторий полтора года описывал таблицу, которой нигде нет:
// без categories и nutrients, без полнотекстового индекса поиска еды.
//
// Этот снимок ловит половину задачи — изменение схемы, не отражённое в
// обозримом виде. Вторую половину (расхождение с живой средой) снимком не
// поймать: до прода отсюда не дотянуться. Порядок сверки описан в
// docs/operations/руководство-администратора.md.
//
// Обновлять: UPDATE_GOLDEN=1 go test -tags=integration ./internal/shared/database/
const goldenPath = "testdata/schema.golden"

func TestSchemaMatchesGolden(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "schema_golden")
	ctx := context.Background()

	rows, err := db.QueryContext(ctx, `
		SELECT table_name || '.' || column_name || ' ' || data_type ||
		       CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
		       CASE WHEN column_default IS NULL THEN ''
		            ELSE ' DEFAULT ' || regexp_replace(column_default, '::[a-z ]+', '', 'g') END
		FROM information_schema.columns
		WHERE table_schema = current_schema()
		UNION ALL
		SELECT 'INDEX ' || tablename || ' ' || indexname || ' ' ||
		       regexp_replace(indexdef, '^CREATE( UNIQUE)? INDEX [^ ]+ ON [^ ]+ USING ', '')
		FROM pg_indexes WHERE schemaname = current_schema()`)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	var lines []string
	for rows.Next() {
		var line string
		require.NoError(t, rows.Scan(&line))
		lines = append(lines, strings.Join(strings.Fields(line), " "))
	}
	require.NoError(t, rows.Err())
	require.NotEmpty(t, lines, "схема пуста — миграции не применились")
	sort.Strings(lines)

	actual := strings.Join(lines, "\n") + "\n"

	if os.Getenv("UPDATE_GOLDEN") == "1" {
		require.NoError(t, os.MkdirAll(filepath.Dir(goldenPath), 0o755))
		require.NoError(t, os.WriteFile(goldenPath, []byte(actual), 0o644))
		t.Log("снимок схемы обновлён")
		return
	}

	expected, err := os.ReadFile(goldenPath)
	require.NoError(t, err, "нет снимка схемы — создайте его: UPDATE_GOLDEN=1 go test -tags=integration ./internal/shared/database/")

	if string(expected) != actual {
		require.Equal(t, string(expected), actual, diffHint(string(expected), actual))
	}
}

// diffHint показывает, что именно разошлось, а не два файла целиком.
func diffHint(expected, actual string) string {
	was := map[string]bool{}
	for _, l := range strings.Split(expected, "\n") {
		was[l] = true
	}
	now := map[string]bool{}
	for _, l := range strings.Split(actual, "\n") {
		now[l] = true
	}

	var added, removed []string
	for l := range now {
		if !was[l] && l != "" {
			added = append(added, "  + "+l)
		}
	}
	for l := range was {
		if !now[l] && l != "" {
			removed = append(removed, "  - "+l)
		}
	}
	sort.Strings(added)
	sort.Strings(removed)

	return fmt.Sprintf(
		"схема разошлась со снимком.\nПоявилось:\n%s\nПропало:\n%s\n"+
			"Если изменение намеренное — обновите снимок и посмотрите на диф в обзоре:\n"+
			"  UPDATE_GOLDEN=1 go test -tags=integration ./internal/shared/database/",
		strings.Join(added, "\n"), strings.Join(removed, "\n"))
}
