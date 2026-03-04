# Content Feed (Лента) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable curators and admins to publish markdown articles to clients via a feed with S3-backed content storage.

**Architecture:** New `content` module on backend (handler/service pattern), new `content` feature on frontend. Markdown bodies stored in dedicated S3 bucket, metadata in PostgreSQL. Scheduler goroutine publishes scheduled articles.

**Tech Stack:** Go/Gin, PostgreSQL, Yandex Cloud S3, Next.js App Router, react-markdown, Tailwind CSS

---

### Task 1: Database Migration — Create articles and article_audience tables

**Files:**
- Create: `apps/api/migrations/031_create_articles_up.sql`
- Create: `apps/api/migrations/031_create_articles_down.sql`

**Step 1: Write up migration**

```sql
-- 031_create_articles_up.sql

CREATE TYPE content_category AS ENUM (
  'nutrition',
  'training',
  'recipes',
  'health',
  'motivation',
  'general'
);

CREATE TYPE content_status AS ENUM (
  'draft',
  'scheduled',
  'published'
);

CREATE TYPE audience_type AS ENUM (
  'all',
  'my_clients',
  'selected'
);

CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id BIGINT NOT NULL REFERENCES users(id),
  title VARCHAR(500) NOT NULL,
  excerpt VARCHAR(1000),
  cover_image_url TEXT,
  category content_category NOT NULL DEFAULT 'general',
  status content_status NOT NULL DEFAULT 'draft',
  content_s3_key TEXT,
  audience_scope audience_type NOT NULL DEFAULT 'my_clients',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE article_audience (
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, client_id)
);

CREATE INDEX idx_articles_author ON articles(author_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_scheduled ON articles(status, scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX idx_article_audience_client ON article_audience(client_id);
```

**Step 2: Write down migration**

```sql
-- 031_create_articles_down.sql

DROP TABLE IF EXISTS article_audience;
DROP TABLE IF EXISTS articles;
DROP TYPE IF EXISTS audience_type;
DROP TYPE IF EXISTS content_status;
DROP TYPE IF EXISTS content_category;
```

**Step 3: Run migration**

Run: `cd apps/api && go run internal/shared/database/migrate.go`
Expected: Migration 031 applied successfully

**Step 4: Commit**

```
feat: add articles database migration (031)
```

---

### Task 2: Backend — Config for Content S3 bucket

**Files:**
- Modify: `apps/api/internal/config/config.go`

**Step 1: Add Content S3 config fields**

Add after ChatS3Endpoint (line ~65):

```go
// Content S3
ContentS3AccessKeyID     string
ContentS3SecretAccessKey string
ContentS3Bucket          string
ContentS3Region          string
ContentS3Endpoint        string
```

**Step 2: Add env loading**

Add after ChatS3Endpoint loading (line ~130):

```go
ContentS3AccessKeyID:     getEnvWithFallback("CONTENT_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", ""),
ContentS3SecretAccessKey: getEnvWithFallback("CONTENT_S3_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", ""),
ContentS3Bucket:          getEnvWithFallback("CONTENT_S3_BUCKET", "S3_BUCKET", "content"),
ContentS3Region:          getEnvWithFallback("CONTENT_S3_REGION", "S3_REGION", "ru-central1"),
ContentS3Endpoint:        getEnvWithFallback("CONTENT_S3_ENDPOINT", "S3_ENDPOINT", "https://storage.yandexcloud.net"),
```

**Step 3: Commit**

```
feat: add Content S3 bucket config
```

---

### Task 3: Backend — Content module types

**Files:**
- Create: `apps/api/internal/modules/content/types.go`

**Step 1: Write types**

```go
package content

import "time"

// Request types

type CreateArticleRequest struct {
	Title         string   `json:"title" binding:"required,max=500"`
	Excerpt       string   `json:"excerpt" binding:"max=1000"`
	Category      string   `json:"category" binding:"required"`
	AudienceScope string   `json:"audience_scope" binding:"required"`
	ClientIDs     []int64  `json:"client_ids,omitempty"`
}

type UpdateArticleRequest struct {
	Title         *string  `json:"title" binding:"omitempty,max=500"`
	Excerpt       *string  `json:"excerpt" binding:"omitempty,max=1000"`
	Body          *string  `json:"body,omitempty"`
	Category      *string  `json:"category,omitempty"`
	AudienceScope *string  `json:"audience_scope,omitempty"`
	ClientIDs     []int64  `json:"client_ids,omitempty"`
	CoverImageURL *string  `json:"cover_image_url,omitempty"`
}

type ScheduleArticleRequest struct {
	ScheduledAt time.Time `json:"scheduled_at" binding:"required"`
}

// Response types

type Article struct {
	ID            string     `json:"id"`
	AuthorID      int64      `json:"author_id"`
	AuthorName    string     `json:"author_name"`
	Title         string     `json:"title"`
	Excerpt       string     `json:"excerpt"`
	CoverImageURL string     `json:"cover_image_url,omitempty"`
	Category      string     `json:"category"`
	Status        string     `json:"status"`
	AudienceScope string     `json:"audience_scope"`
	Body          string     `json:"body,omitempty"`
	ScheduledAt   *time.Time `json:"scheduled_at,omitempty"`
	PublishedAt   *time.Time `json:"published_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type ArticleCard struct {
	ID            string     `json:"id"`
	AuthorName    string     `json:"author_name"`
	Title         string     `json:"title"`
	Excerpt       string     `json:"excerpt"`
	CoverImageURL string     `json:"cover_image_url,omitempty"`
	Category      string     `json:"category"`
	PublishedAt   *time.Time `json:"published_at,omitempty"`
}

type ArticlesListResponse struct {
	Articles []Article `json:"articles"`
	Total    int       `json:"total"`
}

type FeedResponse struct {
	Articles []ArticleCard `json:"articles"`
	Total    int           `json:"total"`
}
```

**Step 2: Commit**

```
feat: add content module types
```

---

### Task 4: Backend — Content service interface and constructor

**Files:**
- Create: `apps/api/internal/modules/content/service.go`

**Step 1: Write service skeleton with interface**

```go
package content

import (
	"context"
	"mime/multipart"

	"burcev/internal/shared/database"
	"burcev/internal/shared/logger"
	"burcev/internal/shared/storage"
)

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

type Service struct {
	db  *database.DB
	log *logger.Logger
	s3  *storage.S3Client
}

func NewService(db *database.DB, log *logger.Logger, s3 *storage.S3Client) *Service {
	return &Service{
		db:  db,
		log: log,
		s3:  s3,
	}
}
```

**Step 2: Commit**

```
feat: add content service interface and constructor
```

---

### Task 5: Backend — Content service CRUD implementation

**Files:**
- Modify: `apps/api/internal/modules/content/service.go`

**Step 1: Implement CreateArticle**

Creates article in PostgreSQL, returns Article. If `req.AudienceScope == "selected"`, inserts rows into `article_audience`.

**Step 2: Implement GetArticle**

Queries article by ID, verifies author ownership (or admin), fetches body from S3 via `content_s3_key`, returns full Article with body.

**Step 3: Implement ListArticles**

Queries articles by `author_id` with optional status/category filters. Returns list without body (metadata only). For admins (detected by passing authorID=0 or separate flag), returns all articles.

**Step 4: Implement UpdateArticle**

Updates metadata fields in PostgreSQL (only non-nil fields from request). If `req.Body` is provided, uploads new body.md to S3. If `req.AudienceScope` changes to "selected", replaces `article_audience` rows. Sets `updated_at = NOW()`.

**Step 5: Implement DeleteArticle**

Deletes article row (cascades to article_audience). Deletes S3 prefix `content/{article_id}/`.

**Step 6: Implement PublishArticle, ScheduleArticle, UnpublishArticle**

- PublishArticle: sets `status='published'`, `published_at=NOW()`
- ScheduleArticle: sets `status='scheduled'`, `scheduled_at=req.ScheduledAt`
- UnpublishArticle: sets `status='draft'`, clears `published_at` and `scheduled_at`

**Step 7: Implement UploadMedia**

Reads file from multipart, uploads to S3 at `content/{article_id}/media/{filename}`, returns signed URL.

**Step 8: Implement UploadMarkdownFile**

Reads .md file from multipart, creates article with metadata from request, uploads body to S3, returns Article.

**Step 9: Run tests**

Run: `cd apps/api && go test ./internal/modules/content/ -v`

**Step 10: Commit**

```
feat: implement content service CRUD operations
```

---

### Task 6: Backend — Content service feed and scheduler

**Files:**
- Modify: `apps/api/internal/modules/content/service.go`
- Create: `apps/api/internal/modules/content/scheduler.go`

**Step 1: Implement GetFeed**

```sql
SELECT a.id, u.name as author_name, a.title, a.excerpt,
       a.cover_image_url, a.category, a.published_at
FROM articles a
JOIN users u ON u.id = a.author_id
WHERE a.status = 'published'
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
ORDER BY a.published_at DESC
LIMIT $2 OFFSET $3
```

With optional category filter added as `AND a.category = $4` when provided.

**Step 2: Implement GetFeedArticle**

Same visibility check as GetFeed but for single article. Fetches body from S3.

**Step 3: Implement PublishScheduledArticles**

```sql
UPDATE articles
SET status = 'published', published_at = NOW(), updated_at = NOW()
WHERE status = 'scheduled' AND scheduled_at <= NOW()
RETURNING id
```

Log how many articles were published.

**Step 4: Write scheduler goroutine**

```go
// scheduler.go
package content

import (
	"context"
	"time"
)

func (s *Service) RunScheduler(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	s.log.Info("Content scheduler started")

	for {
		select {
		case <-ticker.C:
			if err := s.PublishScheduledArticles(ctx); err != nil {
				s.log.Error("Failed to publish scheduled articles", "error", err)
			}
		case <-ctx.Done():
			s.log.Info("Content scheduler stopped")
			return
		}
	}
}
```

**Step 5: Commit**

```
feat: implement content feed query and scheduler
```

---

### Task 7: Backend — Content handler

**Files:**
- Create: `apps/api/internal/modules/content/handler.go`

**Step 1: Write handler struct and constructor**

```go
package content

import (
	"burcev/internal/config"
	"burcev/internal/shared/database"
	"burcev/internal/shared/logger"
	"burcev/internal/shared/storage"
)

type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service ServiceInterface
}

func NewHandler(cfg *config.Config, log *logger.Logger, db *database.DB, s3 *storage.S3Client) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: NewService(db, log, s3),
	}
}
```

**Step 2: Implement all handler methods**

Each handler follows the pattern:
1. Extract `user_id` from context
2. Parse path params / bind JSON
3. Call service method
4. Return `response.Success()` or error response

Handlers:
- `CreateArticle` — POST, binds CreateArticleRequest
- `GetArticle` — GET `:id`
- `ListArticles` — GET with query params `?status=&category=`
- `UpdateArticle` — PUT `:id`, binds UpdateArticleRequest
- `DeleteArticle` — DELETE `:id`
- `PublishArticle` — POST `:id/publish`
- `ScheduleArticle` — POST `:id/schedule`, binds ScheduleArticleRequest
- `UnpublishArticle` — POST `:id/unpublish`
- `UploadMedia` — POST `:id/media`, multipart form
- `UploadMarkdownFile` — POST `upload`, multipart form
- `GetFeed` — GET with query params `?category=&limit=&offset=`
- `GetFeedArticle` — GET `:id`

**Step 3: Commit**

```
feat: add content HTTP handlers
```

---

### Task 8: Backend — Register content module in main.go

**Files:**
- Modify: `apps/api/cmd/server/main.go`

**Step 1: Initialize Content S3 client**

Add after chatS3 initialization (follows same pattern):

```go
var contentS3 *storage.S3Client
if cfg.ContentS3AccessKeyID != "" && cfg.ContentS3SecretAccessKey != "" {
	contentS3, err = storage.NewS3Client(&storage.S3Config{
		AccessKeyID:     cfg.ContentS3AccessKeyID,
		SecretAccessKey: cfg.ContentS3SecretAccessKey,
		Bucket:          cfg.ContentS3Bucket,
		Region:          cfg.ContentS3Region,
		Endpoint:        cfg.ContentS3Endpoint,
	}, log)
	if err != nil {
		log.Error("Failed to initialize content S3 client", "error", err)
	} else {
		log.Info("Content S3 client initialized", "bucket", cfg.ContentS3Bucket)
	}
}
```

**Step 2: Initialize handler and register routes**

```go
contentHandler := content.NewHandler(cfg, log, db, contentS3)

// Curator/Admin content management
contentManageGroup := v1.Group("/content/articles")
contentManageGroup.Use(middleware.RequireAuth(cfg))
contentManageGroup.Use(middleware.RequireRole("coordinator", "super_admin"))
{
	contentManageGroup.POST("", contentHandler.CreateArticle)
	contentManageGroup.GET("", contentHandler.ListArticles)
	contentManageGroup.GET("/:id", contentHandler.GetArticle)
	contentManageGroup.PUT("/:id", contentHandler.UpdateArticle)
	contentManageGroup.DELETE("/:id", contentHandler.DeleteArticle)
	contentManageGroup.POST("/:id/publish", contentHandler.PublishArticle)
	contentManageGroup.POST("/:id/schedule", contentHandler.ScheduleArticle)
	contentManageGroup.POST("/:id/unpublish", contentHandler.UnpublishArticle)
	contentManageGroup.POST("/:id/media", contentHandler.UploadMedia)
	contentManageGroup.POST("/upload", contentHandler.UploadMarkdownFile)
}

// Client content feed
contentFeedGroup := v1.Group("/content/feed")
contentFeedGroup.Use(middleware.RequireAuth(cfg))
{
	contentFeedGroup.GET("", contentHandler.GetFeed)
	contentFeedGroup.GET("/:id", contentHandler.GetFeedArticle)
}
```

**Step 3: Start scheduler goroutine**

Add after server setup, before `ListenAndServe`:

```go
// Start content scheduler
contentService := content.NewService(db, log, contentS3)
go contentService.RunScheduler(ctx)
```

**Step 4: Verify build**

Run: `cd apps/api && go build ./cmd/server/`
Expected: BUILD SUCCESS

**Step 5: Commit**

```
feat: register content module routes and scheduler in main.go
```

---

### Task 9: Backend — Content service tests

**Files:**
- Create: `apps/api/internal/modules/content/service_test.go`

**Step 1: Write tests for core operations**

Using sqlmock (same pattern as curator/service_test.go):
- `TestCreateArticle` — creates article, verifies DB insert
- `TestGetFeed` — verifies correct visibility filtering (all, my_clients, selected)
- `TestPublishArticle` — status transition draft→published
- `TestScheduleArticle` — sets scheduled_at
- `TestPublishScheduledArticles` — bulk publishes due articles
- `TestDeleteArticle` — verifies cascade delete

**Step 2: Run tests**

Run: `cd apps/api && go test ./internal/modules/content/ -v`
Expected: All PASS

**Step 3: Commit**

```
test: add content service tests
```

---

### Task 10: Frontend — Content types

**Files:**
- Create: `apps/web/src/features/content/types/index.ts`

**Step 1: Write types**

```typescript
export type ContentCategory = 'nutrition' | 'training' | 'recipes' | 'health' | 'motivation' | 'general'

export type ContentStatus = 'draft' | 'scheduled' | 'published'

export type AudienceScope = 'all' | 'my_clients' | 'selected'

export interface Article {
  id: string
  author_id: number
  author_name: string
  title: string
  excerpt: string
  cover_image_url?: string
  category: ContentCategory
  status: ContentStatus
  audience_scope: AudienceScope
  body?: string
  scheduled_at?: string
  published_at?: string
  created_at: string
  updated_at: string
}

export interface ArticleCard {
  id: string
  author_name: string
  title: string
  excerpt: string
  cover_image_url?: string
  category: ContentCategory
  published_at?: string
}

export interface CreateArticleRequest {
  title: string
  excerpt?: string
  category: ContentCategory
  audience_scope: AudienceScope
  client_ids?: number[]
}

export interface UpdateArticleRequest {
  title?: string
  excerpt?: string
  body?: string
  category?: ContentCategory
  audience_scope?: AudienceScope
  client_ids?: number[]
  cover_image_url?: string
}

export interface ScheduleArticleRequest {
  scheduled_at: string
}

export interface FeedResponse {
  articles: ArticleCard[]
  total: number
}

export interface ArticlesListResponse {
  articles: Article[]
  total: number
}

export const CATEGORY_LABELS: Record<ContentCategory, string> = {
  nutrition: 'Питание',
  training: 'Тренировки',
  recipes: 'Рецепты',
  health: 'Здоровье',
  motivation: 'Мотивация',
  general: 'Общее',
}
```

**Step 2: Create index.ts barrel export**

- Create: `apps/web/src/features/content/index.ts`

**Step 3: Commit**

```
feat: add content feature types
```

---

### Task 11: Frontend — Content API client

**Files:**
- Create: `apps/web/src/features/content/api/contentApi.ts`

**Step 1: Write API client**

```typescript
import { apiClient } from '@/shared/utils/api-client'
import type {
  Article,
  ArticlesListResponse,
  FeedResponse,
  CreateArticleRequest,
  UpdateArticleRequest,
  ScheduleArticleRequest,
} from '../types'

const ARTICLES_BASE = '/backend-api/v1/content/articles'
const FEED_BASE = '/backend-api/v1/content/feed'

export const contentApi = {
  // Curator/Admin
  createArticle: (req: CreateArticleRequest) =>
    apiClient.post<Article>(ARTICLES_BASE, req),

  getArticle: (id: string) =>
    apiClient.get<Article>(`${ARTICLES_BASE}/${id}`),

  listArticles: (status?: string, category?: string) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (category) params.set('category', category)
    const qs = params.toString()
    return apiClient.get<ArticlesListResponse>(`${ARTICLES_BASE}${qs ? `?${qs}` : ''}`)
  },

  updateArticle: (id: string, req: UpdateArticleRequest) =>
    apiClient.put<Article>(`${ARTICLES_BASE}/${id}`, req),

  deleteArticle: (id: string) =>
    apiClient.delete(`${ARTICLES_BASE}/${id}`),

  publishArticle: (id: string) =>
    apiClient.post(`${ARTICLES_BASE}/${id}/publish`, {}),

  scheduleArticle: (id: string, req: ScheduleArticleRequest) =>
    apiClient.post(`${ARTICLES_BASE}/${id}/schedule`, req),

  unpublishArticle: (id: string) =>
    apiClient.post(`${ARTICLES_BASE}/${id}/unpublish`, {}),

  // Client feed
  getFeed: (category?: string, limit = 20, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (category) params.set('category', category)
    return apiClient.get<FeedResponse>(`${FEED_BASE}?${params}`)
  },

  getFeedArticle: (id: string) =>
    apiClient.get<Article>(`${FEED_BASE}/${id}`),
}
```

**Step 2: Commit**

```
feat: add content API client
```

---

### Task 12: Frontend — Client feed page (FeedList + FeedCard)

**Files:**
- Create: `apps/web/src/features/content/components/FeedCard.tsx`
- Create: `apps/web/src/features/content/components/FeedList.tsx`
- Create: `apps/web/src/features/content/components/CategoryFilter.tsx`
- Create: `apps/web/src/app/content/page.tsx`

**Step 1: Write FeedCard component**

Card with cover image, title, excerpt, category badge, date. Links to `/content/{id}`.

**Step 2: Write CategoryFilter component**

Horizontal scrollable chip list with "Все" + each category from CATEGORY_LABELS.

**Step 3: Write FeedList component**

Fetches feed via `contentApi.getFeed()`, renders FeedCard list with CategoryFilter. Implements infinite scroll or "Load more" pagination.

**Step 4: Write page.tsx**

```typescript
'use client'

import { FeedList } from '@/features/content/components/FeedList'

export default function ContentFeedPage() {
  return (
    <div className="px-4 py-6 pb-20">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Контент</h1>
      <FeedList />
    </div>
  )
}
```

**Step 5: Verify page renders**

Run: `cd apps/web && npm run dev`
Navigate to: `http://localhost:3069/content`
Expected: Page renders with empty state (no articles yet)

**Step 6: Commit**

```
feat: add client content feed page with cards
```

---

### Task 13: Frontend — Article view page (markdown rendering)

**Files:**
- Create: `apps/web/src/features/content/components/ArticleView.tsx`
- Create: `apps/web/src/app/content/[id]/page.tsx`

**Step 1: Install react-markdown and remark-gfm**

Run: `cd apps/web && npm install react-markdown remark-gfm`

**Step 2: Write ArticleView component**

Fetches article by ID via `contentApi.getFeedArticle()`. Renders markdown body with `react-markdown` + `remark-gfm`. Shows title, author, date, category at top. Back button to `/content`.

**Step 3: Write page.tsx**

```typescript
'use client'

import { use } from 'react'
import { ArticleView } from '@/features/content/components/ArticleView'

export default function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ArticleView articleId={id} />
}
```

**Step 4: Commit**

```
feat: add article view page with markdown rendering
```

---

### Task 14: Frontend — Curator article list page

**Files:**
- Create: `apps/web/src/features/content/components/ArticleList.tsx`
- Create: `apps/web/src/features/content/components/StatusBadge.tsx`
- Create: `apps/web/src/app/curator/content/page.tsx`

**Step 1: Write StatusBadge component**

Colored badge: draft (gray), scheduled (yellow), published (green).

**Step 2: Write ArticleList component**

Fetches articles via `contentApi.listArticles()`. Table/card list with title, status badge, category, date, actions (edit/delete/publish). Filter tabs: Все / Черновики / Запланированные / Опубликованные. "Создать статью" button linking to `/curator/content/new`.

**Step 3: Write page.tsx**

```typescript
'use client'

import { ArticleList } from '@/features/content/components/ArticleList'

export default function CuratorContentPage() {
  return (
    <div className="px-4 py-6 pb-20">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Мой контент</h1>
      <ArticleList />
    </div>
  )
}
```

**Step 4: Commit**

```
feat: add curator article list page
```

---

### Task 15: Frontend — Curator article editor (create/edit)

**Files:**
- Create: `apps/web/src/features/content/components/ArticleEditor.tsx`
- Create: `apps/web/src/features/content/components/ArticleForm.tsx`
- Create: `apps/web/src/features/content/components/AudienceSelector.tsx`
- Create: `apps/web/src/features/content/components/MediaUploader.tsx`
- Create: `apps/web/src/features/content/components/FileUploader.tsx`
- Create: `apps/web/src/app/curator/content/new/page.tsx`
- Create: `apps/web/src/app/curator/content/[id]/edit/page.tsx`

**Step 1: Write AudienceSelector component**

Radio group: "Все пользователи" / "Мои клиенты" / "Выборочно". When "Выборочно" selected, shows multi-select of curator's clients (fetched from curatorApi.getClients).

**Step 2: Write ArticleForm component**

Form with: title input, excerpt textarea, category select, audience selector, schedule datetime picker (optional). Save/Publish/Schedule buttons.

**Step 3: Write MediaUploader component**

Drag-and-drop or file picker for images. Uploads via contentApi (multipart), returns URL. Copies markdown image syntax `![](url)` to clipboard or inserts at cursor.

**Step 4: Write FileUploader component**

Upload .md file. Reads content, populates editor textarea.

**Step 5: Write ArticleEditor component**

Split layout: left side is textarea for markdown, right side is rendered preview (react-markdown). Toolbar above textarea: bold, italic, heading, link, image buttons that insert markdown syntax. Integrates MediaUploader and FileUploader.

**Step 6: Write new/page.tsx and edit/page.tsx**

New: creates article draft, then shows editor.
Edit: loads existing article, shows editor with pre-filled data.

**Step 7: Commit**

```
feat: add curator article editor with markdown preview
```

---

### Task 16: Frontend — Update curator navigation

**Files:**
- Modify: `apps/web/src/features/curator/utils/curatorNavigationConfig.ts`
- Modify: `apps/web/src/features/curator/types/index.ts`

**Step 1: Add 'content' to navigation items**

Add to types:
```typescript
export type CuratorNavigationItemId = 'clients' | 'chats' | 'content' | 'profile'
```

Add to config:
```typescript
import { Users, MessageCircle, FileText, UserCircle } from 'lucide-react'

export const CURATOR_NAVIGATION_ITEMS: CuratorNavigationItemConfig[] = [
    { id: 'clients', label: 'Клиенты', icon: Users, href: '/curator' },
    { id: 'chats', label: 'Чаты', icon: MessageCircle, href: '/curator/chat' },
    { id: 'content', label: 'Контент', icon: FileText, href: '/curator/content' },
    { id: 'profile', label: 'Профиль', icon: UserCircle, href: '/profile' },
]
```

**Step 2: Commit**

```
feat: add content tab to curator navigation
```

---

### Task 17: Frontend tests

**Files:**
- Create: `apps/web/src/features/content/components/__tests__/FeedCard.test.tsx`
- Create: `apps/web/src/features/content/components/__tests__/CategoryFilter.test.tsx`
- Create: `apps/web/src/features/content/components/__tests__/StatusBadge.test.tsx`

**Step 1: Write FeedCard test**

Renders card with title, excerpt, category, date. Verifies link to article.

**Step 2: Write CategoryFilter test**

Renders all categories. Click triggers filter callback.

**Step 3: Write StatusBadge test**

Renders correct label and color for each status.

**Step 4: Run tests**

Run: `cd apps/web && npx jest --testPathPattern=content`
Expected: All PASS

**Step 5: Commit**

```
test: add content feature component tests
```

---

### Task 18: Integration verification

**Step 1: Run backend tests**

Run: `cd apps/api && go test ./... -v`
Expected: All PASS

**Step 2: Run frontend lint and type-check**

Run: `cd apps/web && npm run lint && npm run type-check`
Expected: No errors

**Step 3: Run frontend tests**

Run: `cd apps/web && npx jest`
Expected: All PASS

**Step 4: Build both apps**

Run: `make build-api && make build-web`
Expected: Both build successfully

**Step 5: Final commit**

```
chore: verify content feature integration
```
