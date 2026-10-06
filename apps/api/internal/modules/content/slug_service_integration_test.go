//go:build integration

package content

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Slugs are SQL as much as Go: uniqueness, the published-article rule and the
// public lookup all live in queries. sqlmock would accept any of them naming a
// column that does not exist, so these run against the real schema.

func slugFixture(t *testing.T) (*Service, *database.DB, int64) {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, "contentslugsvc")
	var authorID int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role) VALUES ('author@example.test', 'x', 'Красный Кот', 'super_admin') RETURNING id`,
	).Scan(&authorID))
	return NewService(db, logger.New(), nil, nil), db, authorID
}

func createArticle(t *testing.T, s *Service, authorID int64, title, audience string) *Article {
	t.Helper()
	a, err := s.CreateArticle(context.Background(), authorID, CreateArticleRequest{
		Title: title, Category: "nutrition", AudienceScope: audience,
	})
	require.NoError(t, err)
	return a
}

func publish(t *testing.T, s *Service, authorID int64, id string) {
	t.Helper()
	require.NoError(t, s.PublishArticle(context.Background(), authorID, id, true))
}

func TestSlug_AssignedOnCreate(t *testing.T) {
	s, _, author := slugFixture(t)

	a := createArticle(t, s, author, "Что такое КБЖУ и зачем его считать?", "all")
	assert.Equal(t, "chto-takoe-kbzhu-i-zachem-ego-schitat", a.Slug)

	again := createArticle(t, s, author, "Что такое КБЖУ и зачем его считать?", "all")
	assert.Equal(t, "chto-takoe-kbzhu-i-zachem-ego-schitat-2", again.Slug)

	third := createArticle(t, s, author, "Что такое КБЖУ — и зачем его считать", "all")
	assert.Equal(t, "chto-takoe-kbzhu-i-zachem-ego-schitat-3", third.Slug)
}

func TestSlug_ExplicitOnCreate(t *testing.T) {
	s, _, author := slugFixture(t)
	ctx := context.Background()

	explicit := "raschet-kbzhu"
	a, err := s.CreateArticle(ctx, author, CreateArticleRequest{
		Title: "Расчёт", Category: "nutrition", AudienceScope: "all", Slug: &explicit,
	})
	require.NoError(t, err)
	assert.Equal(t, "raschet-kbzhu", a.Slug)

	_, err = s.CreateArticle(ctx, author, CreateArticleRequest{
		Title: "Другая", Category: "nutrition", AudienceScope: "all", Slug: &explicit,
	})
	assert.ErrorIs(t, err, apperrors.ErrConflict, "an address that is taken is refused, not silently renumbered")
}

func TestSlug_StableAfterPublication(t *testing.T) {
	s, _, author := slugFixture(t)
	ctx := context.Background()

	a := createArticle(t, s, author, "Первый заголовок", "all")
	publish(t, s, author, a.ID)

	newTitle := "Совсем другой заголовок"
	updated, err := s.UpdateArticle(ctx, author, a.ID, UpdateArticleRequest{Title: &newTitle}, true)
	require.NoError(t, err)
	assert.Equal(t, "pervyy-zagolovok", updated.Slug, "a title edit must not move a published address")

	other := "drugoy-adres"
	_, err = s.UpdateArticle(ctx, author, a.ID, UpdateArticleRequest{Slug: &other}, true)
	assert.ErrorIs(t, err, apperrors.ErrConflict)

	got, err := s.GetPublicArticle(ctx, "pervyy-zagolovok")
	require.NoError(t, err)
	assert.Equal(t, a.ID, got.ID)
}

func TestSlug_DraftMayChange(t *testing.T) {
	s, _, author := slugFixture(t)
	ctx := context.Background()

	a := createArticle(t, s, author, "Черновик", "all")
	taken := createArticle(t, s, author, "Занято", "all")

	free := "novyy-adres"
	updated, err := s.UpdateArticle(ctx, author, a.ID, UpdateArticleRequest{Slug: &free}, true)
	require.NoError(t, err)
	assert.Equal(t, "novyy-adres", updated.Slug)

	_, err = s.UpdateArticle(ctx, author, a.ID, UpdateArticleRequest{Slug: &taken.Slug}, true)
	assert.ErrorIs(t, err, apperrors.ErrConflict)
}

func TestSlug_PublicLookup(t *testing.T) {
	s, _, author := slugFixture(t)
	ctx := context.Background()

	public := createArticle(t, s, author, "Публичная статья", "all")
	publish(t, s, author, public.ID)
	private := createArticle(t, s, author, "Для своих клиентов", "my_clients")
	publish(t, s, author, private.ID)

	bySlug, err := s.GetPublicArticle(ctx, "publichnaya-statya")
	require.NoError(t, err)
	assert.Equal(t, public.ID, bySlug.ID)
	assert.Equal(t, "publichnaya-statya", bySlug.Slug)

	byID, err := s.GetPublicArticle(ctx, public.ID)
	require.NoError(t, err)
	assert.Equal(t, "publichnaya-statya", byID.Slug)

	_, err = s.GetPublicArticle(ctx, private.Slug)
	assert.ErrorIs(t, err, apperrors.ErrNotFound)

	_, err = s.GetPublicArticle(ctx, "takoy-stati-net")
	assert.ErrorIs(t, err, apperrors.ErrNotFound)

	feed, err := s.GetPublicFeed(ctx, "", 20, 0)
	require.NoError(t, err)
	require.Len(t, feed.Articles, 1)
	assert.Equal(t, "publichnaya-statya", feed.Articles[0].Slug)
}

// A client's own feed carries articles meant only for them. Their public
// address would not open — the public page cannot see them — so the card
// links by id instead.
func TestSlug_PersonalFeedOmitsSlugOfRestrictedArticles(t *testing.T) {
	s, db, curator := slugFixture(t)
	ctx := context.Background()

	var clientID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('client@example.test', 'x', 'Клиент', 'client') RETURNING id`,
	).Scan(&clientID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1, $2, 'active')`,
		curator, clientID)
	require.NoError(t, err)

	public := createArticle(t, s, curator, "Для всех", "all")
	publish(t, s, curator, public.ID)
	mine := createArticle(t, s, curator, "Только моим", "my_clients")
	publish(t, s, curator, mine.ID)

	feed, err := s.GetFeed(ctx, clientID, "", 20, 0)
	require.NoError(t, err)
	slugs := map[string]string{}
	for _, card := range feed.Articles {
		slugs[card.ID] = card.Slug
	}
	require.Len(t, slugs, 2)
	assert.Equal(t, "dlya-vsekh", slugs[public.ID])
	assert.Empty(t, slugs[mine.ID])
}
