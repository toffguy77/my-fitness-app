//go:build integration

package content

import (
	"context"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Статьи — общее пространство редакции: любой куратор и любой администратор
// правит, публикует, снимает и удаляет любую статью, не только свою. Раньше
// куратор упирался в проверку автора, а список прятал кнопки у чужих статей,
// и администратор видел «Редактировать» лишь у тех, что написал сам.
//
// Автор при этом не меняется: правка — не присвоение. От автора зависит, кому
// видна статья «Мои клиенты», и подпись в ленте.

func TestSharedWorkspace_AnyCuratorManagesAnyArticle(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "contentshared")
	ctx := context.Background()
	s := NewService(db, logger.New(), nil, nil)

	insert := func(email, name, role string) int64 {
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', $2, $3) RETURNING id`,
			email, name, role,
		).Scan(&id))
		return id
	}
	author := insert("gold@example.test", "Золотой Кот", "coordinator")
	colleague := insert("other@example.test", "Другой Кот", "coordinator")
	admin := insert("red@example.test", "Красный Кот", "super_admin")

	a := createArticle(t, s, author, "Норма белка в день", "all")

	got, err := s.GetArticle(ctx, colleague, a.ID)
	require.NoError(t, err, "a colleague opens the article for editing")
	assert.Equal(t, author, got.AuthorID)

	cover := ""
	title := "Норма белка в день: сколько граммов"
	updated, err := s.UpdateArticle(ctx, colleague, a.ID, UpdateArticleRequest{Title: &title, CoverImageURL: &cover})
	require.NoError(t, err, "a colleague edits it")
	assert.Equal(t, title, updated.Title)
	assert.Equal(t, author, updated.AuthorID, "editing does not change the author")
	assert.Equal(t, "Золотой Кот", updated.AuthorName, "the response names the author, not whoever saved")

	require.NoError(t, s.PublishArticle(ctx, colleague, a.ID), "a colleague publishes it")
	require.NoError(t, s.UnpublishArticle(ctx, admin, a.ID), "the admin takes it down")
	require.NoError(t, s.ScheduleArticle(ctx, colleague, a.ID, ScheduleArticleRequest{ScheduledAt: time.Now().Add(time.Hour)}),
		"a colleague schedules it")

	list, err := s.ListArticles(ctx, colleague, "", "")
	require.NoError(t, err)
	require.Len(t, list.Articles, 1)
	assert.False(t, list.Articles[0].IsOwn, "IsOwn still tells authorship apart; it no longer gates anything")

	require.NoError(t, s.DeleteArticle(ctx, admin, a.ID), "the admin deletes someone else's article")
	var left int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT count(*) FROM articles WHERE id = $1`, a.ID).Scan(&left))
	assert.Zero(t, left)

	b := createArticle(t, s, admin, "Как читать дашборд", "all")
	require.NoError(t, s.DeleteArticle(ctx, colleague, b.ID), "a curator deletes the admin's article too")
}
