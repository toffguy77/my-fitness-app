package content

import (
	"context"
	"mime/multipart"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/storage"
)

// ServiceInterface defines the interface for content service operations
type ServiceInterface interface {
	// Curator/Admin operations
	CreateArticle(ctx context.Context, authorID int64, req CreateArticleRequest) (*Article, error)
	GetArticle(ctx context.Context, authorID int64, articleID string) (*Article, error)
	ListArticles(ctx context.Context, authorID int64, status string, category string) (*ArticlesListResponse, error)
	UpdateArticle(ctx context.Context, authorID int64, articleID string, req UpdateArticleRequest) (*Article, error)
	DeleteArticle(ctx context.Context, authorID int64, articleID string) error
	PublishArticle(ctx context.Context, authorID int64, articleID string) error
	ScheduleArticle(ctx context.Context, authorID int64, articleID string, req ScheduleArticleRequest) error
	UnpublishArticle(ctx context.Context, authorID int64, articleID string) error
	UploadMedia(ctx context.Context, authorID int64, articleID string, file *multipart.FileHeader) (string, error)
	UploadMarkdownFile(ctx context.Context, authorID int64, file *multipart.FileHeader, req CreateArticleRequest) (*Article, error)

	// Client operations
	GetFeed(ctx context.Context, clientID int64, category string, limit int, offset int) (*FeedResponse, error)
	GetFeedArticle(ctx context.Context, clientID int64, articleID string) (*Article, error)

	// Scheduler
	PublishScheduledArticles(ctx context.Context) error
}

// Service handles content business logic
type Service struct {
	db  *database.DB
	log *logger.Logger
	s3  *storage.S3Client
}

// NewService creates a new content service
func NewService(db *database.DB, log *logger.Logger, s3 *storage.S3Client) *Service {
	return &Service{
		db:  db,
		log: log,
		s3:  s3,
	}
}
