//go:build integration

package content

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/burcev/api/internal/testsupport"
	"github.com/burcev/api/migrations"
	"github.com/stretchr/testify/require"
)

// Migration 090 fills slugs for the articles that existed before slugs did,
// in SQL. From then on Go assigns them. The two must agree, or an article
// edited after the migration would be addressed differently from one created
// before it — and a repeat would be numbered by rules nobody wrote down.
func TestMigration090_SlugsAgreeWithGo(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "contentslug")

	up, err := migrations.FS.ReadFile("090_article_slugs_up.sql")
	require.NoError(t, err)
	down, err := migrations.FS.ReadFile("090_article_slugs_down.sql")
	require.NoError(t, err)

	// The state before the migration: articles without the column.
	_, err = db.ExecContext(ctx, string(down))
	require.NoError(t, err)

	var authorID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('a@example.test', 'x', 'Автор', 'coordinator') RETURNING id`,
	).Scan(&authorID))

	longTitle := strings.Repeat("питание ", 20)
	titles := []string{longTitle}
	for _, tc := range slugCases {
		titles = append(titles, tc.title)
	}
	// Two repeats of the same title, published in a known order.
	titles = append(titles, "Что такое КБЖУ и зачем его считать?", "Что такое КБЖУ и зачем его считать?")

	ids := make([]string, len(titles))
	base := time.Date(2026, 3, 8, 8, 0, 0, 0, time.UTC)
	for i, title := range titles {
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO articles (author_id, title, status, published_at)
			 VALUES ($1, $2, 'published', $3) RETURNING id`,
			authorID, title, base.Add(time.Duration(i)*time.Minute),
		).Scan(&ids[i]))
	}

	_, err = db.ExecContext(ctx, string(up))
	require.NoError(t, err)

	slugOf := func(id string) string {
		var slug string
		require.NoError(t, db.QueryRowContext(ctx, `SELECT slug FROM articles WHERE id = $1`, id).Scan(&slug))
		return slug
	}

	seen := map[string]int{}
	for i, title := range titles {
		base := BaseSlug(title)
		seen[base]++
		want := base
		if n := seen[base]; n > 1 {
			want = SuffixedSlug(base, n)
		}
		require.Equal(t, want, slugOf(ids[i]), "title %q", title)
	}

	// Every article has one, and no two share it.
	var missing, dupes int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FILTER (WHERE slug IS NULL), count(*) - count(DISTINCT slug) FROM articles`,
	).Scan(&missing, &dupes))
	require.Zero(t, missing)
	require.Zero(t, dupes)

	_, err = db.ExecContext(ctx,
		`INSERT INTO articles (author_id, title) VALUES ($1, 'Без адреса')`, authorID)
	require.Error(t, err, "an article without a slug must be refused")
}
