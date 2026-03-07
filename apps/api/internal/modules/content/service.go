package content

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"mime/multipart"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/burcev/api/internal/shared/ws"
	"github.com/google/uuid"
)

// ServiceInterface defines the interface for content service operations
type ServiceInterface interface {
	// Curator/Admin operations
	CreateArticle(ctx context.Context, authorID int64, req CreateArticleRequest) (*Article, error)
	GetArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) (*Article, error)
	ListArticles(ctx context.Context, authorID int64, status string, category string, isAdmin bool) (*ArticlesListResponse, error)
	UpdateArticle(ctx context.Context, authorID int64, articleID string, req UpdateArticleRequest, isAdmin bool) (*Article, error)
	DeleteArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) error
	PublishArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) error
	ScheduleArticle(ctx context.Context, authorID int64, articleID string, req ScheduleArticleRequest, isAdmin bool) error
	UnpublishArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) error
	UploadMedia(ctx context.Context, authorID int64, articleID string, file *multipart.FileHeader, isAdmin bool) (string, error)
	UploadMarkdownFile(ctx context.Context, authorID int64, file *multipart.FileHeader, req CreateArticleRequest) (*Article, error)

	// Client operations
	GetFeed(ctx context.Context, clientID int64, category string, limit int, offset int) (*FeedResponse, error)
	GetFeedArticle(ctx context.Context, clientID int64, articleID string) (*Article, error)

	// Public operations (no auth required)
	GetPublicFeed(ctx context.Context, category string, limit int, offset int) (*FeedResponse, error)
	GetPublicArticle(ctx context.Context, articleID string) (*Article, error)

	// Scheduler
	PublishScheduledArticles(ctx context.Context) error
}

// Service handles content business logic
type Service struct {
	db    *database.DB
	log   *logger.Logger
	s3    *storage.S3Client
	wsHub *ws.Hub
}

// NewService creates a new content service
func NewService(db *database.DB, log *logger.Logger, s3 *storage.S3Client, wsHub *ws.Hub) *Service {
	return &Service{
		db:    db,
		log:   log,
		s3:    s3,
		wsHub: wsHub,
	}
}

var errS3NotConfigured = fmt.Errorf("S3 storage is not configured for content")

func (s *Service) requireS3() error {
	if s.s3 == nil {
		return errS3NotConfigured
	}
	return nil
}

// verifyOwnership checks that the article belongs to the given author.
// Returns an error if the article does not exist or does not belong to the author.
func (s *Service) verifyOwnership(ctx context.Context, authorID int64, articleID string) error {
	var ownerID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT author_id FROM articles WHERE id = $1`, articleID,
	).Scan(&ownerID)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("article not found")
		}
		return fmt.Errorf("failed to verify article ownership: %w", err)
	}
	if ownerID != authorID {
		return fmt.Errorf("unauthorized: article does not belong to author")
	}
	return nil
}

// CreateArticle creates a new article in the database.
func (s *Service) CreateArticle(ctx context.Context, authorID int64, req CreateArticleRequest) (*Article, error) {
	startTime := time.Now()

	id := uuid.New().String()
	contentS3Key := fmt.Sprintf("content/%s/body.md", id)

	query := `
		INSERT INTO articles (id, author_id, title, excerpt, category, audience_scope, content_s3_key, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', NOW(), NOW())
		RETURNING id, author_id, title, excerpt, COALESCE(cover_image_url, ''), category, status, audience_scope,
		          scheduled_at, published_at, created_at, updated_at
	`

	var article Article
	var scheduledAt, publishedAt sql.NullTime
	err := s.db.QueryRowContext(ctx, query,
		id, authorID, req.Title, req.Excerpt, req.Category, req.AudienceScope, contentS3Key,
	).Scan(
		&article.ID, &article.AuthorID, &article.Title, &article.Excerpt,
		&article.CoverImageURL, &article.Category, &article.Status, &article.AudienceScope,
		&scheduledAt, &publishedAt, &article.CreatedAt, &article.UpdatedAt,
	)
	if err != nil {
		s.log.Error("Failed to create article", "error", err)
		return nil, fmt.Errorf("failed to create article: %w", err)
	}

	if scheduledAt.Valid {
		article.ScheduledAt = &scheduledAt.Time
	}
	if publishedAt.Valid {
		article.PublishedAt = &publishedAt.Time
	}

	// Get author name
	var authorName sql.NullString
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(name, '') FROM users WHERE id = $1`, authorID).Scan(&authorName)
	if authorName.Valid {
		article.AuthorName = authorName.String
	}

	// Insert audience rows if scope is "selected"
	if req.AudienceScope == "selected" && len(req.ClientIDs) > 0 {
		if err := s.insertAudienceRows(ctx, id, req.ClientIDs); err != nil {
			s.log.Error("Failed to insert article audience rows", "error", err, "article_id", id)
			return nil, fmt.Errorf("failed to insert audience rows: %w", err)
		}
	}

	s.log.LogDatabaseQuery("CreateArticle", time.Since(startTime), nil, map[string]interface{}{
		"article_id": id,
		"author_id":  authorID,
	})

	return &article, nil
}

// insertAudienceRows inserts rows into article_audience for the given client IDs.
func (s *Service) insertAudienceRows(ctx context.Context, articleID string, clientIDs []int64) error {
	if len(clientIDs) == 0 {
		return nil
	}

	valueStrings := make([]string, 0, len(clientIDs))
	args := make([]any, 0, len(clientIDs)*2)
	for i, clientID := range clientIDs {
		valueStrings = append(valueStrings, fmt.Sprintf("($%d, $%d)", i*2+1, i*2+2))
		args = append(args, articleID, clientID)
	}

	query := fmt.Sprintf(
		`INSERT INTO article_audience (article_id, client_id) VALUES %s ON CONFLICT DO NOTHING`,
		strings.Join(valueStrings, ", "),
	)

	_, err := s.db.ExecContext(ctx, query, args...)
	return err
}

// GetArticle retrieves a single article with its body content.
func (s *Service) GetArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) (*Article, error) {
	startTime := time.Now()

	query := `
		SELECT a.id, a.author_id, COALESCE(u.name, '') AS author_name,
		       a.title, a.excerpt, COALESCE(a.cover_image_url, ''), a.category, a.status, a.audience_scope,
		       a.content_s3_key, a.scheduled_at, a.published_at, a.created_at, a.updated_at
		FROM articles a
		JOIN users u ON u.id = a.author_id
		WHERE a.id = $1
	`

	var article Article
	var contentS3Key sql.NullString
	var scheduledAt, publishedAt sql.NullTime

	err := s.db.QueryRowContext(ctx, query, articleID).Scan(
		&article.ID, &article.AuthorID, &article.AuthorName,
		&article.Title, &article.Excerpt, &article.CoverImageURL,
		&article.Category, &article.Status, &article.AudienceScope,
		&contentS3Key, &scheduledAt, &publishedAt,
		&article.CreatedAt, &article.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("article not found")
		}
		s.log.Error("Failed to get article", "error", err, "article_id", articleID)
		return nil, fmt.Errorf("failed to get article: %w", err)
	}

	// Ownership check (skip for admins)
	if !isAdmin && article.AuthorID != authorID {
		return nil, fmt.Errorf("unauthorized: article does not belong to author")
	}

	if scheduledAt.Valid {
		article.ScheduledAt = &scheduledAt.Time
	}
	if publishedAt.Valid {
		article.PublishedAt = &publishedAt.Time
	}

	// Fetch body from S3
	if contentS3Key.Valid && contentS3Key.String != "" && s.s3 != nil {
		data, err := s.s3.GetFile(ctx, contentS3Key.String)
		if err != nil {
			s.log.Error("Failed to get article body from S3", "error", err, "key", contentS3Key.String)
			// Non-fatal: return article without body
		} else {
			article.Body = string(data)
		}
	}

	s.log.LogDatabaseQuery("GetArticle", time.Since(startTime), nil, map[string]interface{}{
		"article_id": articleID,
		"author_id":  authorID,
	})

	return &article, nil
}

// ListArticles returns all articles for a given author, with optional status and category filters.
// If isAdmin is true, all articles are returned regardless of author.
func (s *Service) ListArticles(ctx context.Context, authorID int64, status string, category string, isAdmin bool) (*ArticlesListResponse, error) {
	startTime := time.Now()

	query := `
		SELECT a.id, a.author_id, COALESCE(u.name, '') AS author_name,
		       a.title, a.excerpt, COALESCE(a.cover_image_url, ''), a.category, a.status, a.audience_scope,
		       a.scheduled_at, a.published_at, a.created_at, a.updated_at
		FROM articles a
		JOIN users u ON u.id = a.author_id
	`
	args := []any{}
	argIdx := 1

	if isAdmin {
		query += " WHERE 1=1"
	} else {
		query += fmt.Sprintf(" WHERE a.author_id = $%d", argIdx)
		args = append(args, authorID)
		argIdx++
	}

	if status != "" {
		query += fmt.Sprintf(" AND a.status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}
	if category != "" {
		query += fmt.Sprintf(" AND a.category = $%d", argIdx)
		args = append(args, category)
		argIdx++
	}

	query += " ORDER BY a.created_at DESC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		s.log.Error("Failed to list articles", "error", err, "author_id", authorID)
		return nil, fmt.Errorf("failed to list articles: %w", err)
	}
	defer rows.Close()

	articles := make([]Article, 0)
	for rows.Next() {
		var a Article
		var scheduledAt, publishedAt sql.NullTime

		if err := rows.Scan(
			&a.ID, &a.AuthorID, &a.AuthorName,
			&a.Title, &a.Excerpt, &a.CoverImageURL,
			&a.Category, &a.Status, &a.AudienceScope,
			&scheduledAt, &publishedAt, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			s.log.Error("Failed to scan article row", "error", err)
			return nil, fmt.Errorf("failed to scan article row: %w", err)
		}

		if scheduledAt.Valid {
			a.ScheduledAt = &scheduledAt.Time
		}
		if publishedAt.Valid {
			a.PublishedAt = &publishedAt.Time
		}

		articles = append(articles, a)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating article rows: %w", err)
	}

	s.log.LogDatabaseQuery("ListArticles", time.Since(startTime), nil, map[string]interface{}{
		"author_id": authorID,
		"count":     len(articles),
		"status":    status,
		"category":  category,
	})

	return &ArticlesListResponse{
		Articles: articles,
		Total:    len(articles),
	}, nil
}

// UpdateArticle updates an article with only the provided (non-nil) fields.
func (s *Service) UpdateArticle(ctx context.Context, authorID int64, articleID string, req UpdateArticleRequest, isAdmin bool) (*Article, error) {
	startTime := time.Now()

	// Verify ownership (skip for admins)
	if !isAdmin {
		if err := s.verifyOwnership(ctx, authorID, articleID); err != nil {
			return nil, err
		}
	}

	// Build dynamic SET clause
	setClauses := []string{}
	args := []any{}
	argIdx := 1

	if req.Title != nil {
		setClauses = append(setClauses, fmt.Sprintf("title = $%d", argIdx))
		args = append(args, *req.Title)
		argIdx++
	}
	if req.Excerpt != nil {
		setClauses = append(setClauses, fmt.Sprintf("excerpt = $%d", argIdx))
		args = append(args, *req.Excerpt)
		argIdx++
	}
	if req.Category != nil {
		setClauses = append(setClauses, fmt.Sprintf("category = $%d", argIdx))
		args = append(args, *req.Category)
		argIdx++
	}
	if req.AudienceScope != nil {
		setClauses = append(setClauses, fmt.Sprintf("audience_scope = $%d", argIdx))
		args = append(args, *req.AudienceScope)
		argIdx++
	}
	if req.CoverImageURL != nil {
		setClauses = append(setClauses, fmt.Sprintf("cover_image_url = $%d", argIdx))
		args = append(args, *req.CoverImageURL)
		argIdx++
	}

	// Always update updated_at
	setClauses = append(setClauses, "updated_at = NOW()")

	// Upload body to S3 if provided
	if req.Body != nil {
		if err := s.requireS3(); err != nil {
			return nil, err
		}
		s3Key := fmt.Sprintf("content/%s/body.md", articleID)
		bodyBytes := []byte(*req.Body)
		_, err := s.s3.UploadFile(ctx, s3Key, bytes.NewReader(bodyBytes), "text/markdown", int64(len(bodyBytes)))
		if err != nil {
			s.log.Error("Failed to upload article body to S3", "error", err, "article_id", articleID)
			return nil, fmt.Errorf("failed to upload article body: %w", err)
		}
	}

	if len(setClauses) == 0 {
		// Nothing to update besides updated_at which is always included
		setClauses = append(setClauses, "updated_at = NOW()")
	}

	// Add articleID as last arg
	args = append(args, articleID)

	query := fmt.Sprintf(
		`UPDATE articles SET %s WHERE id = $%d
		 RETURNING id, author_id, title, excerpt, COALESCE(cover_image_url, ''), category, status, audience_scope,
		           scheduled_at, published_at, created_at, updated_at`,
		strings.Join(setClauses, ", "), argIdx,
	)

	var article Article
	var scheduledAt, publishedAt sql.NullTime

	err := s.db.QueryRowContext(ctx, query, args...).Scan(
		&article.ID, &article.AuthorID, &article.Title, &article.Excerpt,
		&article.CoverImageURL, &article.Category, &article.Status, &article.AudienceScope,
		&scheduledAt, &publishedAt, &article.CreatedAt, &article.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			// Diagnostic: check if article exists at all
			var existsID, existsStatus string
			diagErr := s.db.QueryRowContext(ctx,
				`SELECT id, status FROM articles WHERE id = $1`, articleID,
			).Scan(&existsID, &existsStatus)
			if diagErr != nil {
				s.log.Warn("UpdateArticle: article not found in DB at all",
					"article_id", articleID,
					"author_id", authorID,
					"is_admin", isAdmin,
					"diag_err", diagErr,
				)
			} else {
				s.log.Warn("UpdateArticle: article exists but UPDATE missed it",
					"article_id", articleID,
					"author_id", authorID,
					"is_admin", isAdmin,
					"diag_id", existsID,
					"diag_status", existsStatus,
				)
			}
			return nil, fmt.Errorf("article not found")
		}
		s.log.Error("Failed to update article", "error", err, "article_id", articleID)
		return nil, fmt.Errorf("failed to update article: %w", err)
	}

	if scheduledAt.Valid {
		article.ScheduledAt = &scheduledAt.Time
	}
	if publishedAt.Valid {
		article.PublishedAt = &publishedAt.Time
	}

	// Get author name
	var authorName sql.NullString
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(name, '') FROM users WHERE id = $1`, authorID).Scan(&authorName)
	if authorName.Valid {
		article.AuthorName = authorName.String
	}

	// Handle audience scope changes
	if req.AudienceScope != nil {
		if *req.AudienceScope == "selected" {
			// Delete old rows and insert new ones
			_, _ = s.db.ExecContext(ctx, `DELETE FROM article_audience WHERE article_id = $1`, articleID)
			if len(req.ClientIDs) > 0 {
				if err := s.insertAudienceRows(ctx, articleID, req.ClientIDs); err != nil {
					s.log.Error("Failed to update article audience", "error", err, "article_id", articleID)
					return nil, fmt.Errorf("failed to update audience rows: %w", err)
				}
			}
		} else {
			// Non-selected scope: remove all audience rows
			_, _ = s.db.ExecContext(ctx, `DELETE FROM article_audience WHERE article_id = $1`, articleID)
		}
	}

	s.log.LogDatabaseQuery("UpdateArticle", time.Since(startTime), nil, map[string]interface{}{
		"article_id": articleID,
		"author_id":  authorID,
	})

	return &article, nil
}

// DeleteArticle deletes an article and its S3 content.
func (s *Service) DeleteArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
	startTime := time.Now()

	// Verify ownership (skip for admins)
	if !isAdmin {
		if err := s.verifyOwnership(ctx, authorID, articleID); err != nil {
			return err
		}
	}

	// Delete article row (cascades to article_audience)
	var result sql.Result
	var err error
	if isAdmin {
		result, err = s.db.ExecContext(ctx, `DELETE FROM articles WHERE id = $1`, articleID)
	} else {
		result, err = s.db.ExecContext(ctx, `DELETE FROM articles WHERE id = $1 AND author_id = $2`, articleID, authorID)
	}
	if err != nil {
		s.log.Error("Failed to delete article", "error", err, "article_id", articleID)
		return fmt.Errorf("failed to delete article: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("article not found")
	}

	// Best-effort: delete related notifications
	actionURL := fmt.Sprintf("/content/%s", articleID)
	if _, err := s.db.ExecContext(ctx, `DELETE FROM notifications WHERE action_url = $1`, actionURL); err != nil {
		s.log.Error("Failed to delete content notifications (best-effort)", "error", err, "article_id", articleID)
	}

	// Best-effort S3 cleanup: delete body.md
	if s.s3 != nil {
		bodyKey := fmt.Sprintf("content/%s/body.md", articleID)
		if err := s.s3.DeleteFile(ctx, bodyKey); err != nil {
			s.log.Error("Failed to delete article body from S3 (best-effort)", "error", err, "key", bodyKey)
		}
	}

	s.log.LogDatabaseQuery("DeleteArticle", time.Since(startTime), nil, map[string]interface{}{
		"article_id": articleID,
		"author_id":  authorID,
	})

	return nil
}

// PublishArticle sets an article's status to published.
func (s *Service) PublishArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
	startTime := time.Now()

	if !isAdmin {
		if err := s.verifyOwnership(ctx, authorID, articleID); err != nil {
			return err
		}
	}

	var result sql.Result
	var err error
	if isAdmin {
		result, err = s.db.ExecContext(ctx,
			`UPDATE articles SET status = 'published', published_at = NOW(), updated_at = NOW() WHERE id = $1`,
			articleID,
		)
	} else {
		result, err = s.db.ExecContext(ctx,
			`UPDATE articles SET status = 'published', published_at = NOW(), updated_at = NOW() WHERE id = $1 AND author_id = $2`,
			articleID, authorID,
		)
	}
	if err != nil {
		s.log.Error("Failed to publish article", "error", err, "article_id", articleID)
		return fmt.Errorf("failed to publish article: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		// Diagnostic: check if article exists at all
		var existsID, existsStatus string
		diagErr := s.db.QueryRowContext(ctx,
			`SELECT id, status FROM articles WHERE id = $1`, articleID,
		).Scan(&existsID, &existsStatus)
		if diagErr != nil {
			s.log.Warn("PublishArticle: article not found in DB at all",
				"article_id", articleID,
				"author_id", authorID,
				"is_admin", isAdmin,
				"diag_err", diagErr,
			)
		} else {
			s.log.Warn("PublishArticle: article exists but UPDATE missed it",
				"article_id", articleID,
				"author_id", authorID,
				"is_admin", isAdmin,
				"diag_id", existsID,
				"diag_status", existsStatus,
			)
		}
		return fmt.Errorf("article not found")
	}

	s.log.LogDatabaseQuery("PublishArticle", time.Since(startTime), nil, map[string]interface{}{
		"article_id": articleID,
		"author_id":  authorID,
	})

	// Create notifications for eligible users (non-fatal)
	if err := s.createContentNotifications(ctx, articleID); err != nil {
		s.log.Error("Failed to create content notifications", "error", err, "article_id", articleID)
	}

	return nil
}

// ScheduleArticle sets an article to be published at a future time.
func (s *Service) ScheduleArticle(ctx context.Context, authorID int64, articleID string, req ScheduleArticleRequest, isAdmin bool) error {
	startTime := time.Now()

	if !isAdmin {
		if err := s.verifyOwnership(ctx, authorID, articleID); err != nil {
			return err
		}
	}

	var result sql.Result
	var err error
	if isAdmin {
		result, err = s.db.ExecContext(ctx,
			`UPDATE articles SET status = 'scheduled', scheduled_at = $1, updated_at = NOW() WHERE id = $2`,
			req.ScheduledAt, articleID,
		)
	} else {
		result, err = s.db.ExecContext(ctx,
			`UPDATE articles SET status = 'scheduled', scheduled_at = $1, updated_at = NOW() WHERE id = $2 AND author_id = $3`,
			req.ScheduledAt, articleID, authorID,
		)
	}
	if err != nil {
		s.log.Error("Failed to schedule article", "error", err, "article_id", articleID)
		return fmt.Errorf("failed to schedule article: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("article not found")
	}

	s.log.LogDatabaseQuery("ScheduleArticle", time.Since(startTime), nil, map[string]interface{}{
		"article_id":   articleID,
		"author_id":    authorID,
		"scheduled_at": req.ScheduledAt,
	})

	return nil
}

// UnpublishArticle reverts an article back to draft status.
func (s *Service) UnpublishArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
	startTime := time.Now()

	if !isAdmin {
		if err := s.verifyOwnership(ctx, authorID, articleID); err != nil {
			return err
		}
	}

	var result sql.Result
	var err error
	if isAdmin {
		result, err = s.db.ExecContext(ctx,
			`UPDATE articles SET status = 'draft', scheduled_at = NULL, published_at = NULL, updated_at = NOW() WHERE id = $1`,
			articleID,
		)
	} else {
		result, err = s.db.ExecContext(ctx,
			`UPDATE articles SET status = 'draft', scheduled_at = NULL, published_at = NULL, updated_at = NOW() WHERE id = $1 AND author_id = $2`,
			articleID, authorID,
		)
	}
	if err != nil {
		s.log.Error("Failed to unpublish article", "error", err, "article_id", articleID)
		return fmt.Errorf("failed to unpublish article: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("article not found")
	}

	s.log.LogDatabaseQuery("UnpublishArticle", time.Since(startTime), nil, map[string]interface{}{
		"article_id": articleID,
		"author_id":  authorID,
	})

	return nil
}

// UploadMedia uploads a media file for an article and returns the S3 URL.
func (s *Service) UploadMedia(ctx context.Context, authorID int64, articleID string, file *multipart.FileHeader, isAdmin bool) (string, error) {
	if err := s.requireS3(); err != nil {
		return "", err
	}
	if !isAdmin {
		if err := s.verifyOwnership(ctx, authorID, articleID); err != nil {
			return "", err
		}
	}

	src, err := file.Open()
	if err != nil {
		return "", fmt.Errorf("failed to open uploaded file: %w", err)
	}
	defer src.Close()

	data, err := io.ReadAll(src)
	if err != nil {
		return "", fmt.Errorf("failed to read uploaded file: %w", err)
	}

	s3Key := fmt.Sprintf("content/%s/media/%s", articleID, file.Filename)
	contentType := file.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	url, err := s.s3.UploadFile(ctx, s3Key, bytes.NewReader(data), contentType, int64(len(data)))
	if err != nil {
		s.log.Error("Failed to upload media file", "error", err, "article_id", articleID, "filename", file.Filename)
		return "", fmt.Errorf("failed to upload media file: %w", err)
	}

	s.log.Info("Media file uploaded", "article_id", articleID, "filename", file.Filename, "url", url)

	return url, nil
}

// UploadMarkdownFile reads a .md file, creates an article, and uploads the body to S3.
func (s *Service) UploadMarkdownFile(ctx context.Context, authorID int64, file *multipart.FileHeader, req CreateArticleRequest) (*Article, error) {
	if err := s.requireS3(); err != nil {
		return nil, err
	}
	src, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to open markdown file: %w", err)
	}
	defer src.Close()

	mdContent, err := io.ReadAll(src)
	if err != nil {
		return nil, fmt.Errorf("failed to read markdown file: %w", err)
	}

	// Create article record
	article, err := s.CreateArticle(ctx, authorID, req)
	if err != nil {
		return nil, fmt.Errorf("failed to create article from markdown: %w", err)
	}

	// Upload body to S3
	s3Key := fmt.Sprintf("content/%s/body.md", article.ID)
	_, err = s.s3.UploadFile(ctx, s3Key, bytes.NewReader(mdContent), "text/markdown", int64(len(mdContent)))
	if err != nil {
		s.log.Error("Failed to upload markdown body to S3", "error", err, "article_id", article.ID)
		// Clean up: delete the article row since we couldn't upload the body
		_, _ = s.db.ExecContext(ctx, `DELETE FROM articles WHERE id = $1`, article.ID)
		return nil, fmt.Errorf("failed to upload markdown body: %w", err)
	}

	s.log.Info("Markdown file uploaded and article created", "article_id", article.ID, "filename", file.Filename)

	return article, nil
}

// GetFeed returns published articles visible to a client.
func (s *Service) GetFeed(ctx context.Context, clientID int64, category string, limit int, offset int) (*FeedResponse, error) {
	startTime := time.Now()

	visibilityClause := `
		a.status = 'published'
		AND (
			a.audience_scope = 'all'
			OR (a.audience_scope = 'my_clients'
				AND a.author_id IN (
					SELECT curator_id FROM curator_client_relationships
					WHERE client_id = $1 AND status = 'active'))
			OR (a.audience_scope = 'selected'
				AND EXISTS (
					SELECT 1 FROM article_audience aa
					WHERE aa.article_id = a.id AND aa.client_id = $1))
		)
	`

	args := []any{clientID}
	argIdx := 2

	categoryClause := ""
	if category != "" {
		categoryClause = fmt.Sprintf(" AND a.category = $%d", argIdx)
		args = append(args, category)
		argIdx++
	}

	// Count total matching articles
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM articles a WHERE %s%s`, visibilityClause, categoryClause)
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		s.log.Error("Failed to count feed articles", "error", err, "client_id", clientID)
		return nil, fmt.Errorf("failed to count feed articles: %w", err)
	}

	// Fetch paginated articles
	selectQuery := fmt.Sprintf(`
		SELECT a.id, COALESCE(u.name, '') AS author_name, a.title, a.excerpt,
		       COALESCE(a.cover_image_url, ''), a.category, a.published_at
		FROM articles a
		JOIN users u ON u.id = a.author_id
		WHERE %s%s
		ORDER BY a.published_at DESC
		LIMIT $%d OFFSET $%d
	`, visibilityClause, categoryClause, argIdx, argIdx+1)

	selectArgs := append(args, limit, offset)

	rows, err := s.db.QueryContext(ctx, selectQuery, selectArgs...)
	if err != nil {
		s.log.Error("Failed to query feed articles", "error", err, "client_id", clientID)
		return nil, fmt.Errorf("failed to query feed articles: %w", err)
	}
	defer rows.Close()

	articles := make([]ArticleCard, 0)
	for rows.Next() {
		var card ArticleCard
		var publishedAt sql.NullTime

		if err := rows.Scan(
			&card.ID, &card.AuthorName, &card.Title, &card.Excerpt,
			&card.CoverImageURL, &card.Category, &publishedAt,
		); err != nil {
			s.log.Error("Failed to scan feed article row", "error", err)
			return nil, fmt.Errorf("failed to scan feed article row: %w", err)
		}

		if publishedAt.Valid {
			card.PublishedAt = &publishedAt.Time
		}

		articles = append(articles, card)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating feed article rows: %w", err)
	}

	s.log.LogDatabaseQuery("GetFeed", time.Since(startTime), nil, map[string]interface{}{
		"client_id": clientID,
		"category":  category,
		"count":     len(articles),
		"total":     total,
	})

	return &FeedResponse{Articles: articles, Total: total}, nil
}

// GetFeedArticle returns a single published article for a client.
func (s *Service) GetFeedArticle(ctx context.Context, clientID int64, articleID string) (*Article, error) {
	startTime := time.Now()

	query := `
		SELECT a.id, u.name AS author_name, a.title, a.excerpt,
		       COALESCE(a.cover_image_url, ''), a.category, a.status, a.audience_scope,
		       a.content_s3_key, a.published_at, a.created_at, a.updated_at,
		       a.author_id
		FROM articles a
		JOIN users u ON u.id = a.author_id
		WHERE a.id = $1 AND a.status = 'published'
		  AND (
			a.audience_scope = 'all'
			OR (a.audience_scope = 'my_clients'
				AND a.author_id IN (
					SELECT curator_id FROM curator_client_relationships
					WHERE client_id = $2 AND status = 'active'))
			OR (a.audience_scope = 'selected'
				AND EXISTS (
					SELECT 1 FROM article_audience aa
					WHERE aa.article_id = a.id AND aa.client_id = $2))
		  )
	`

	var article Article
	var contentS3Key sql.NullString
	var publishedAt sql.NullTime

	err := s.db.QueryRowContext(ctx, query, articleID, clientID).Scan(
		&article.ID, &article.AuthorName, &article.Title, &article.Excerpt,
		&article.CoverImageURL, &article.Category, &article.Status, &article.AudienceScope,
		&contentS3Key, &publishedAt, &article.CreatedAt, &article.UpdatedAt,
		&article.AuthorID,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("article not found")
		}
		s.log.Error("Failed to get feed article", "error", err, "article_id", articleID, "client_id", clientID)
		return nil, fmt.Errorf("failed to get feed article: %w", err)
	}

	if publishedAt.Valid {
		article.PublishedAt = &publishedAt.Time
	}

	// Fetch body from S3
	if contentS3Key.Valid && contentS3Key.String != "" && s.s3 != nil {
		data, err := s.s3.GetFile(ctx, contentS3Key.String)
		if err != nil {
			s.log.Error("Failed to get feed article body from S3", "error", err, "key", contentS3Key.String)
			// Non-fatal: return article without body
		} else {
			article.Body = string(data)
		}
	}

	s.log.LogDatabaseQuery("GetFeedArticle", time.Since(startTime), nil, map[string]interface{}{
		"article_id": articleID,
		"client_id":  clientID,
	})

	return &article, nil
}

// GetPublicFeed returns published articles with audience_scope = 'all', no auth required.
func (s *Service) GetPublicFeed(ctx context.Context, category string, limit int, offset int) (*FeedResponse, error) {
	startTime := time.Now()

	args := []any{}
	argIdx := 1

	categoryClause := ""
	if category != "" {
		categoryClause = fmt.Sprintf(" AND a.category = $%d", argIdx)
		args = append(args, category)
		argIdx++
	}

	whereClause := "a.status = 'published' AND a.audience_scope = 'all'"

	// Count total matching articles
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM articles a WHERE %s%s`, whereClause, categoryClause)
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		s.log.Error("Failed to count public feed articles", "error", err)
		return nil, fmt.Errorf("failed to count public feed articles: %w", err)
	}

	// Fetch paginated articles
	selectQuery := fmt.Sprintf(`
		SELECT a.id, COALESCE(u.name, '') AS author_name, a.title, a.excerpt,
		       COALESCE(a.cover_image_url, ''), a.category, a.published_at
		FROM articles a
		JOIN users u ON u.id = a.author_id
		WHERE %s%s
		ORDER BY a.published_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, categoryClause, argIdx, argIdx+1)

	selectArgs := append(args, limit, offset)

	rows, err := s.db.QueryContext(ctx, selectQuery, selectArgs...)
	if err != nil {
		s.log.Error("Failed to query public feed articles", "error", err)
		return nil, fmt.Errorf("failed to query public feed articles: %w", err)
	}
	defer rows.Close()

	articles := make([]ArticleCard, 0)
	for rows.Next() {
		var card ArticleCard
		var publishedAt sql.NullTime

		if err := rows.Scan(
			&card.ID, &card.AuthorName, &card.Title, &card.Excerpt,
			&card.CoverImageURL, &card.Category, &publishedAt,
		); err != nil {
			s.log.Error("Failed to scan public feed article row", "error", err)
			return nil, fmt.Errorf("failed to scan public feed article row: %w", err)
		}

		if publishedAt.Valid {
			card.PublishedAt = &publishedAt.Time
		}

		articles = append(articles, card)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating public feed article rows: %w", err)
	}

	s.log.LogDatabaseQuery("GetPublicFeed", time.Since(startTime), nil, map[string]interface{}{
		"category": category,
		"count":    len(articles),
		"total":    total,
	})

	return &FeedResponse{Articles: articles, Total: total}, nil
}

// GetPublicArticle returns a single published article with audience_scope = 'all', no auth required.
func (s *Service) GetPublicArticle(ctx context.Context, articleID string) (*Article, error) {
	startTime := time.Now()

	query := `
		SELECT a.id, u.name AS author_name, a.title, a.excerpt,
		       COALESCE(a.cover_image_url, ''), a.category, a.status, a.audience_scope,
		       a.content_s3_key, a.published_at, a.created_at, a.updated_at,
		       a.author_id
		FROM articles a
		JOIN users u ON u.id = a.author_id
		WHERE a.id = $1 AND a.status = 'published' AND a.audience_scope = 'all'
	`

	var article Article
	var contentS3Key sql.NullString
	var publishedAt sql.NullTime

	err := s.db.QueryRowContext(ctx, query, articleID).Scan(
		&article.ID, &article.AuthorName, &article.Title, &article.Excerpt,
		&article.CoverImageURL, &article.Category, &article.Status, &article.AudienceScope,
		&contentS3Key, &publishedAt, &article.CreatedAt, &article.UpdatedAt,
		&article.AuthorID,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("article not found")
		}
		s.log.Error("Failed to get public article", "error", err, "article_id", articleID)
		return nil, fmt.Errorf("failed to get public article: %w", err)
	}

	if publishedAt.Valid {
		article.PublishedAt = &publishedAt.Time
	}

	// Fetch body from S3
	if contentS3Key.Valid && contentS3Key.String != "" && s.s3 != nil {
		data, err := s.s3.GetFile(ctx, contentS3Key.String)
		if err != nil {
			s.log.Error("Failed to get public article body from S3", "error", err, "key", contentS3Key.String)
			// Non-fatal: return article without body
		} else {
			article.Body = string(data)
		}
	}

	s.log.LogDatabaseQuery("GetPublicArticle", time.Since(startTime), nil, map[string]interface{}{
		"article_id": articleID,
	})

	return &article, nil
}

// PublishScheduledArticles publishes articles whose scheduled_at has passed.
func (s *Service) PublishScheduledArticles(ctx context.Context) error {
	startTime := time.Now()

	rows, err := s.db.QueryContext(ctx,
		`UPDATE articles
		 SET status = 'published', published_at = NOW(), updated_at = NOW()
		 WHERE status = 'scheduled' AND scheduled_at <= NOW()
		 RETURNING id`,
	)
	if err != nil {
		s.log.Error("Failed to publish scheduled articles", "error", err)
		return fmt.Errorf("failed to publish scheduled articles: %w", err)
	}
	defer rows.Close()

	var publishedIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			s.log.Error("Failed to scan published article ID", "error", err)
			continue
		}
		publishedIDs = append(publishedIDs, id)
	}
	if err := rows.Err(); err != nil {
		s.log.Error("Error iterating published article IDs", "error", err)
	}

	if len(publishedIDs) > 0 {
		s.log.Info("Published scheduled articles", "count", len(publishedIDs))
		for _, articleID := range publishedIDs {
			if err := s.createContentNotifications(ctx, articleID); err != nil {
				s.log.Error("Failed to create content notifications for scheduled article", "error", err, "article_id", articleID)
			}
		}
	}

	s.log.LogDatabaseQuery("PublishScheduledArticles", time.Since(startTime), nil, map[string]interface{}{
		"published_count": len(publishedIDs),
	})

	return nil
}

// createContentNotifications creates notifications for all eligible users when an article is published.
// Eligible users are determined by the article's audience_scope, excluding users who have muted
// content notifications or unsubscribed from the article's category.
func (s *Service) createContentNotifications(ctx context.Context, articleID string) error {
	// Fetch article details
	var title, excerpt, category, audienceScope string
	var authorID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT title, excerpt, category, audience_scope, author_id FROM articles WHERE id = $1`,
		articleID,
	).Scan(&title, &excerpt, &category, &audienceScope, &authorID)
	if err != nil {
		return fmt.Errorf("failed to get article details for notifications: %w", err)
	}

	// Build audience query based on scope, excluding muted and unsubscribed users
	var audienceQuery string
	var args []any

	baseExclusions := `
		AND u.id NOT IN (SELECT user_id FROM content_notification_mute)
		AND u.id NOT IN (SELECT user_id FROM content_notification_preferences WHERE category = $%d)
	`

	switch audienceScope {
	case "all":
		// All clients
		audienceQuery = fmt.Sprintf(`
			SELECT u.id FROM users u
			WHERE u.role = 'client'
			%s
		`, fmt.Sprintf(baseExclusions, 1))
		args = []any{category}

	case "my_clients":
		// Clients assigned to the article's author (curator)
		audienceQuery = fmt.Sprintf(`
			SELECT u.id FROM users u
			JOIN curator_client_relationships ccr ON ccr.client_id = u.id
			WHERE u.role = 'client'
			AND ccr.curator_id = $1
			AND ccr.status = 'active'
			%s
		`, fmt.Sprintf(baseExclusions, 2))
		args = []any{authorID, category}

	case "selected":
		// Specifically selected clients
		audienceQuery = fmt.Sprintf(`
			SELECT u.id FROM users u
			JOIN article_audience aa ON aa.client_id = u.id
			WHERE u.role = 'client'
			AND aa.article_id = $1
			%s
		`, fmt.Sprintf(baseExclusions, 2))
		args = []any{articleID, category}

	default:
		return fmt.Errorf("unknown audience scope: %s", audienceScope)
	}

	rows, err := s.db.QueryContext(ctx, audienceQuery, args...)
	if err != nil {
		return fmt.Errorf("failed to query audience for notifications: %w", err)
	}
	defer rows.Close()

	var userIDs []int64
	for rows.Next() {
		var userID int64
		if err := rows.Scan(&userID); err != nil {
			s.log.Error("Failed to scan user ID for notification", "error", err)
			continue
		}
		userIDs = append(userIDs, userID)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("error iterating audience rows: %w", err)
	}

	if len(userIDs) == 0 {
		s.log.Info("No eligible users for content notification", "article_id", articleID)
		return nil
	}

	// Truncate title for notification
	notifTitle := title
	if len(notifTitle) > 100 {
		notifTitle = notifTitle[:97] + "..."
	}

	actionURL := fmt.Sprintf("/content/%s", articleID)

	// Insert notifications one by one
	insertQuery := `
		INSERT INTO notifications (id, user_id, category, type, title, content, action_url, content_category, created_at)
		VALUES ($1, $2, 'content', 'new_content', $3, $4, $5, $6, NOW())
	`

	type insertedNotif struct {
		userID  int64
		notifID string
	}

	var inserted []insertedNotif
	for _, userID := range userIDs {
		notifID := uuid.New().String()
		_, err := s.db.ExecContext(ctx, insertQuery, notifID, userID, notifTitle, excerpt, actionURL, category)
		if err != nil {
			s.log.Error("Failed to insert content notification", "error", err, "user_id", userID, "article_id", articleID)
			continue
		}
		inserted = append(inserted, insertedNotif{userID: userID, notifID: notifID})
	}

	s.log.Info("Content notifications created",
		"article_id", articleID,
		"audience_scope", audienceScope,
		"eligible_users", len(userIDs),
		"inserted", len(inserted),
	)

	// Send real-time WebSocket notifications to online users
	if s.wsHub != nil {
		for _, n := range inserted {
			s.wsHub.SendToUser(n.userID, ws.OutgoingEvent{
				Type: ws.EventContentNotification,
				Data: map[string]interface{}{
					"notification": map[string]interface{}{
						"id":         n.notifID,
						"title":      notifTitle,
						"action_url": actionURL,
						"category":   category,
					},
				},
			})
		}
	}

	return nil
}
