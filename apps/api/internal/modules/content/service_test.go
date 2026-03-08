package content

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupTestService creates a test service with a mock database and nil S3 client.
// Methods that use S3 should not be tested with this setup.
func setupTestService(t *testing.T) (*Service, sqlmock.Sqlmock, func()) {
	mockDB, mock, err := sqlmock.New()
	require.NoError(t, err)

	db := &database.DB{DB: mockDB}
	log := logger.New()

	service := NewService(db, log, nil, nil)

	cleanup := func() {
		mockDB.Close()
	}

	return service, mock, cleanup
}

// articleListColumns defines the columns returned by ListArticles queries
var articleListColumns = []string{
	"id", "author_id", "author_name",
	"title", "excerpt", "cover_image_url", "category", "status", "audience_scope",
	"scheduled_at", "published_at", "created_at", "updated_at",
}

// ============================================================================
// PublishArticle Tests
// ============================================================================

func TestPublishArticle(t *testing.T) {
	ctx := context.Background()

	t.Run("publishes article successfully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-123"

		// verifyOwnership query
		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(authorID))

		// Publish update
		mock.ExpectExec(`UPDATE articles SET status = 'published'`).
			WithArgs(articleID, authorID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.PublishArticle(ctx, authorID, articleID, false)

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error when article not found", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "nonexistent"

		// verifyOwnership: article not found
		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnError(sql.ErrNoRows)

		err := service.PublishArticle(ctx, authorID, articleID, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "article not found")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error when article belongs to different author", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		otherAuthorID := int64(2)
		articleID := "article-456"

		// verifyOwnership: different owner
		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(otherAuthorID))

		err := service.PublishArticle(ctx, authorID, articleID, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error when update affects no rows", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-789"

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(authorID))

		mock.ExpectExec(`UPDATE articles SET status = 'published'`).
			WithArgs(articleID, authorID).
			WillReturnResult(sqlmock.NewResult(0, 0))

		err := service.PublishArticle(ctx, authorID, articleID, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "article not found")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// ScheduleArticle Tests
// ============================================================================

func TestScheduleArticle(t *testing.T) {
	ctx := context.Background()

	t.Run("schedules article successfully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-123"
		scheduledAt := time.Now().Add(24 * time.Hour)

		// verifyOwnership
		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(authorID))

		// Schedule update
		mock.ExpectExec(`UPDATE articles SET status = 'scheduled', scheduled_at = \$1`).
			WithArgs(scheduledAt, articleID, authorID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.ScheduleArticle(ctx, authorID, articleID, ScheduleArticleRequest{
			ScheduledAt: scheduledAt,
		}, false)

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error when article not found", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "nonexistent"

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnError(sql.ErrNoRows)

		err := service.ScheduleArticle(ctx, authorID, articleID, ScheduleArticleRequest{
			ScheduledAt: time.Now().Add(24 * time.Hour),
		}, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "article not found")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error when update affects no rows", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-456"
		scheduledAt := time.Now().Add(48 * time.Hour)

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(authorID))

		mock.ExpectExec(`UPDATE articles SET status = 'scheduled', scheduled_at = \$1`).
			WithArgs(scheduledAt, articleID, authorID).
			WillReturnResult(sqlmock.NewResult(0, 0))

		err := service.ScheduleArticle(ctx, authorID, articleID, ScheduleArticleRequest{
			ScheduledAt: scheduledAt,
		}, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "article not found")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// UnpublishArticle Tests
// ============================================================================

func TestUnpublishArticle(t *testing.T) {
	ctx := context.Background()

	t.Run("unpublishes article successfully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-123"

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(authorID))

		mock.ExpectExec(`UPDATE articles SET status = 'draft'`).
			WithArgs(articleID, authorID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.UnpublishArticle(ctx, authorID, articleID, false)

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error when unauthorized", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-123"

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(int64(999)))

		err := service.UnpublishArticle(ctx, authorID, articleID, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error when update affects no rows", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-123"

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(authorID))

		mock.ExpectExec(`UPDATE articles SET status = 'draft'`).
			WithArgs(articleID, authorID).
			WillReturnResult(sqlmock.NewResult(0, 0))

		err := service.UnpublishArticle(ctx, authorID, articleID, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "article not found")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// PublishScheduledArticles Tests
// ============================================================================

func TestPublishScheduledArticles(t *testing.T) {
	ctx := context.Background()

	t.Run("publishes scheduled articles that are due", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		rows := sqlmock.NewRows([]string{"id"}).
			AddRow("article-1").
			AddRow("article-2").
			AddRow("article-3")
		mock.ExpectQuery(`UPDATE articles`).
			WillReturnRows(rows)

		err := service.PublishScheduledArticles(ctx)

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("succeeds when no articles are due", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		rows := sqlmock.NewRows([]string{"id"})
		mock.ExpectQuery(`UPDATE articles`).
			WillReturnRows(rows)

		err := service.PublishScheduledArticles(ctx)

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on database failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery(`UPDATE articles`).
			WillReturnError(fmt.Errorf("connection refused"))

		err := service.PublishScheduledArticles(ctx)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to publish scheduled articles")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// ListArticles Tests
// ============================================================================

func TestListArticles(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	t.Run("sets IsOwn false for other authors articles", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		otherAuthorID := int64(99)

		rows := sqlmock.NewRows(articleListColumns).
			AddRow("art-1", authorID, "My Name",
				"My Article", "Excerpt", "", "nutrition", "published", "all",
				nil, now, now, now).
			AddRow("art-2", otherAuthorID, "Other Author",
				"Their Article", "Excerpt", "", "training", "draft", "all",
				nil, nil, now, now)

		mock.ExpectQuery(`SELECT a\.id, a\.author_id, COALESCE`).
			WillReturnRows(rows)

		result, err := service.ListArticles(ctx, authorID, "", "", false)

		require.NoError(t, err)
		require.Len(t, result.Articles, 2)
		assert.True(t, result.Articles[0].IsOwn)
		assert.False(t, result.Articles[1].IsOwn)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns all articles with IsOwn flag", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)

		rows := sqlmock.NewRows(articleListColumns).
			AddRow("art-1", authorID, "Author Name",
				"First Article", "Excerpt 1", "", "nutrition", "published", "all",
				nil, now, now, now).
			AddRow("art-2", authorID, "Author Name",
				"Second Article", "Excerpt 2", "https://img.example.com/cover.jpg", "training", "draft", "my_clients",
				nil, nil, now, now)

		mock.ExpectQuery(`SELECT a\.id, a\.author_id, COALESCE`).
			WillReturnRows(rows)

		result, err := service.ListArticles(ctx, authorID, "", "", false)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Len(t, result.Articles, 2)
		assert.Equal(t, 2, result.Total)

		assert.Equal(t, "art-1", result.Articles[0].ID)
		assert.Equal(t, "First Article", result.Articles[0].Title)
		assert.Equal(t, "published", result.Articles[0].Status)
		assert.Equal(t, "nutrition", result.Articles[0].Category)
		assert.NotNil(t, result.Articles[0].PublishedAt)
		assert.True(t, result.Articles[0].IsOwn)

		assert.Equal(t, "art-2", result.Articles[1].ID)
		assert.Equal(t, "draft", result.Articles[1].Status)
		assert.Equal(t, "https://img.example.com/cover.jpg", result.Articles[1].CoverImageURL)
		assert.Nil(t, result.Articles[1].PublishedAt)
		assert.True(t, result.Articles[1].IsOwn)

		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("filters by status", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)

		rows := sqlmock.NewRows(articleListColumns).
			AddRow("art-1", authorID, "Author",
				"Published Article", "Excerpt", "", "nutrition", "published", "all",
				nil, now, now, now)

		mock.ExpectQuery(`SELECT a\.id, a\.author_id, COALESCE`).
			WithArgs("published").
			WillReturnRows(rows)

		result, err := service.ListArticles(ctx, authorID, "published", "", false)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Len(t, result.Articles, 1)
		assert.Equal(t, "published", result.Articles[0].Status)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("filters by category", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)

		rows := sqlmock.NewRows(articleListColumns).
			AddRow("art-1", authorID, "Author",
				"Training Article", "Excerpt", "", "training", "draft", "all",
				nil, nil, now, now)

		mock.ExpectQuery(`SELECT a\.id, a\.author_id, COALESCE`).
			WithArgs("training").
			WillReturnRows(rows)

		result, err := service.ListArticles(ctx, authorID, "", "training", false)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Len(t, result.Articles, 1)
		assert.Equal(t, "training", result.Articles[0].Category)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("filters by both status and category", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)

		rows := sqlmock.NewRows(articleListColumns)

		mock.ExpectQuery(`SELECT a\.id, a\.author_id, COALESCE`).
			WithArgs("published", "nutrition").
			WillReturnRows(rows)

		result, err := service.ListArticles(ctx, authorID, "published", "nutrition", false)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Empty(t, result.Articles)
		assert.Equal(t, 0, result.Total)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns empty list when no articles exist", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)

		rows := sqlmock.NewRows(articleListColumns)

		mock.ExpectQuery(`SELECT a\.id, a\.author_id, COALESCE`).
			WillReturnRows(rows)

		result, err := service.ListArticles(ctx, authorID, "", "", false)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Empty(t, result.Articles)
		assert.Equal(t, 0, result.Total)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("handles scheduled_at correctly", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		scheduledTime := now.Add(24 * time.Hour)

		rows := sqlmock.NewRows(articleListColumns).
			AddRow("art-1", authorID, "Author",
				"Scheduled Article", "Excerpt", "", "nutrition", "scheduled", "all",
				scheduledTime, nil, now, now)

		mock.ExpectQuery(`SELECT a\.id, a\.author_id, COALESCE`).
			WillReturnRows(rows)

		result, err := service.ListArticles(ctx, authorID, "", "", false)

		require.NoError(t, err)
		require.Len(t, result.Articles, 1)
		assert.Equal(t, "scheduled", result.Articles[0].Status)
		assert.True(t, result.Articles[0].IsOwn)
		require.NotNil(t, result.Articles[0].ScheduledAt)
		assert.WithinDuration(t, scheduledTime, *result.Articles[0].ScheduledAt, time.Second)
		assert.Nil(t, result.Articles[0].PublishedAt)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on database failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)

		mock.ExpectQuery(`SELECT a\.id, a\.author_id, COALESCE`).
			WillReturnError(fmt.Errorf("connection refused"))

		result, err := service.ListArticles(ctx, authorID, "", "", false)

		require.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "failed to list articles")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// DeleteArticle Tests (DB-only; S3 cleanup is best-effort so nil S3 will panic,
// but we test ownership verification and DB deletion logic)
// ============================================================================

func TestDeleteArticle(t *testing.T) {
	ctx := context.Background()

	t.Run("returns error when article not found for ownership check", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "nonexistent"

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnError(sql.ErrNoRows)

		err := service.DeleteArticle(ctx, authorID, articleID, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "article not found")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error when article belongs to different author", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-123"

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(int64(999)))

		err := service.DeleteArticle(ctx, authorID, articleID, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error when delete query fails", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-123"

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(authorID))

		mock.ExpectExec(`DELETE FROM articles WHERE id = \$1 AND author_id = \$2`).
			WithArgs(articleID, authorID).
			WillReturnError(fmt.Errorf("foreign key violation"))

		err := service.DeleteArticle(ctx, authorID, articleID, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to delete article")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error when delete affects no rows", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-123"

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(authorID))

		mock.ExpectExec(`DELETE FROM articles WHERE id = \$1 AND author_id = \$2`).
			WithArgs(articleID, authorID).
			WillReturnResult(sqlmock.NewResult(0, 0))

		err := service.DeleteArticle(ctx, authorID, articleID, false)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "article not found")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// CreateArticle Tests (DB-only parts)
// ============================================================================

func TestCreateArticle(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	t.Run("creates article with correct fields", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		req := CreateArticleRequest{
			Title:         "Test Article",
			Excerpt:       "Test excerpt",
			Category:      "nutrition",
			AudienceScope: "all",
		}

		mock.ExpectBegin()

		// INSERT RETURNING
		mock.ExpectQuery(`INSERT INTO articles`).
			WithArgs(
				sqlmock.AnyArg(), // uuid
				authorID,
				req.Title,
				req.Excerpt,
				req.Category,
				req.AudienceScope,
				sqlmock.AnyArg(), // content_s3_key
			).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "author_id", "title", "excerpt", "cover_image_url",
				"category", "status", "audience_scope",
				"scheduled_at", "published_at", "created_at", "updated_at",
			}).AddRow(
				"generated-uuid", authorID, req.Title, req.Excerpt, "",
				req.Category, "draft", req.AudienceScope,
				nil, nil, now, now,
			))

		mock.ExpectCommit()

		// Author name lookup
		mock.ExpectQuery(`SELECT COALESCE\(name, ''\) FROM users WHERE id = \$1`).
			WithArgs(authorID).
			WillReturnRows(sqlmock.NewRows([]string{"name"}).AddRow("Test Author"))

		article, err := service.CreateArticle(ctx, authorID, req)

		require.NoError(t, err)
		require.NotNil(t, article)
		assert.Equal(t, "generated-uuid", article.ID)
		assert.Equal(t, authorID, article.AuthorID)
		assert.Equal(t, "Test Article", article.Title)
		assert.Equal(t, "Test excerpt", article.Excerpt)
		assert.Equal(t, "nutrition", article.Category)
		assert.Equal(t, "draft", article.Status)
		assert.Equal(t, "all", article.AudienceScope)
		assert.Equal(t, "Test Author", article.AuthorName)
		assert.Nil(t, article.ScheduledAt)
		assert.Nil(t, article.PublishedAt)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("creates article with selected audience scope and client IDs", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		req := CreateArticleRequest{
			Title:         "Targeted Article",
			Excerpt:       "For specific clients",
			Category:      "training",
			AudienceScope: "selected",
			ClientIDs:     []int64{10, 20, 30},
		}

		mock.ExpectBegin()

		// INSERT RETURNING
		mock.ExpectQuery(`INSERT INTO articles`).
			WithArgs(
				sqlmock.AnyArg(), authorID, req.Title, req.Excerpt,
				req.Category, req.AudienceScope, sqlmock.AnyArg(),
			).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "author_id", "title", "excerpt", "cover_image_url",
				"category", "status", "audience_scope",
				"scheduled_at", "published_at", "created_at", "updated_at",
			}).AddRow(
				"art-selected", authorID, req.Title, req.Excerpt, "",
				req.Category, "draft", req.AudienceScope,
				nil, nil, time.Now(), time.Now(),
			))

		// insertAudienceRows — article ID is a generated UUID, so use AnyArg
		mock.ExpectExec(`INSERT INTO article_audience`).
			WithArgs(sqlmock.AnyArg(), int64(10), sqlmock.AnyArg(), int64(20), sqlmock.AnyArg(), int64(30)).
			WillReturnResult(sqlmock.NewResult(0, 3))

		mock.ExpectCommit()

		// Author name lookup
		mock.ExpectQuery(`SELECT COALESCE\(name, ''\) FROM users WHERE id = \$1`).
			WithArgs(authorID).
			WillReturnRows(sqlmock.NewRows([]string{"name"}).AddRow("Author"))

		article, err := service.CreateArticle(ctx, authorID, req)

		require.NoError(t, err)
		require.NotNil(t, article)
		assert.Equal(t, "selected", article.AudienceScope)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on insert failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		req := CreateArticleRequest{
			Title:         "Failing Article",
			Excerpt:       "Will fail",
			Category:      "nutrition",
			AudienceScope: "all",
		}

		mock.ExpectBegin()

		mock.ExpectQuery(`INSERT INTO articles`).
			WithArgs(
				sqlmock.AnyArg(), authorID, req.Title, req.Excerpt,
				req.Category, req.AudienceScope, sqlmock.AnyArg(),
			).
			WillReturnError(fmt.Errorf("unique constraint violation"))

		mock.ExpectRollback()

		article, err := service.CreateArticle(ctx, authorID, req)

		require.Error(t, err)
		assert.Nil(t, article)
		assert.Contains(t, err.Error(), "failed to create article")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// verifyOwnership Tests
// ============================================================================

func TestVerifyOwnership(t *testing.T) {
	ctx := context.Background()

	t.Run("succeeds when author owns the article", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		authorID := int64(1)
		articleID := "article-123"

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs(articleID).
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(authorID))

		err := service.verifyOwnership(ctx, authorID, articleID)

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error for non-existent article", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs("missing").
			WillReturnError(sql.ErrNoRows)

		err := service.verifyOwnership(ctx, int64(1), "missing")

		require.Error(t, err)
		assert.Contains(t, err.Error(), "article not found")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns unauthorized for wrong author", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs("article-123").
			WillReturnRows(sqlmock.NewRows([]string{"author_id"}).AddRow(int64(999)))

		err := service.verifyOwnership(ctx, int64(1), "article-123")

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on database failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery(`SELECT author_id FROM articles WHERE id = \$1`).
			WithArgs("article-123").
			WillReturnError(fmt.Errorf("connection reset"))

		err := service.verifyOwnership(ctx, int64(1), "article-123")

		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to verify article ownership")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// Ensure sql and driver packages are used
var _ = sql.ErrNoRows
var _ driver.Value
