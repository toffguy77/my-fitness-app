# Content Feed (Лента) — Design Document

## Overview

Curator content publishing feature. Curators and admins publish markdown articles to clients via a feed. Content stored in S3, metadata in PostgreSQL.

Scope: **Feed tab only** (Лента). Wiki and Программа потока deferred.

## Requirements

- Authors: coordinators (curators) and super_admins
- Content formats: long articles/guides and short posts, all in markdown
- Storage: dedicated S3 bucket on Yandex Cloud for markdown bodies and media
- Media: images in S3 or external URLs
- Categories: fixed enum set
- Audience: all users / my clients / selected clients (all three options for curators)
- Scheduling: draft → scheduled (with datetime) → published
- Upload: write in-app markdown editor or upload .md file
- Client UI: card feed with cover image, title, excerpt, date, category

## Data Model

### PostgreSQL

```sql
CREATE TYPE content_category AS ENUM (
  'nutrition',     -- Питание
  'training',      -- Тренировки
  'recipes',       -- Рецепты
  'health',        -- Здоровье
  'motivation',    -- Мотивация
  'general'        -- Общее
);

CREATE TYPE content_status AS ENUM (
  'draft',
  'scheduled',
  'published'
);

CREATE TYPE audience_type AS ENUM (
  'all',           -- All platform users (curator + admin)
  'my_clients',    -- All active clients of this curator
  'selected'       -- Specific clients via article_audience
);

CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(500) NOT NULL,
  excerpt VARCHAR(1000),
  cover_image_url TEXT,
  category content_category NOT NULL DEFAULT 'general',
  status content_status NOT NULL DEFAULT 'draft',
  content_s3_key TEXT,
  audience_scope audience_type NOT NULL DEFAULT 'my_clients',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE article_audience (
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, client_id)
);

CREATE INDEX idx_articles_author ON articles(author_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_scheduled ON articles(status, scheduled_at)
  WHERE status = 'scheduled';
```

### S3 Structure (content bucket)

```
content/
  {article_id}/
    body.md
    media/
      {filename}.jpg
```

## API Endpoints

### Curator/Admin (content management)

```
POST   /api/v1/content/articles              — Create article (draft)
GET    /api/v1/content/articles               — List my articles (filters: status, category)
GET    /api/v1/content/articles/:id           — Get article with body from S3
PUT    /api/v1/content/articles/:id           — Update metadata + body
DELETE /api/v1/content/articles/:id           — Delete article

POST   /api/v1/content/articles/:id/publish   — Publish now
POST   /api/v1/content/articles/:id/schedule  — Schedule (body: scheduled_at)
POST   /api/v1/content/articles/:id/unpublish — Revert to draft

POST   /api/v1/content/articles/:id/media     — Upload media to S3
DELETE /api/v1/content/articles/:id/media/:key — Delete media

POST   /api/v1/content/articles/upload        — Upload .md file + metadata
```

### Client (feed)

```
GET    /api/v1/content/feed                   — Feed (pagination, category filter)
GET    /api/v1/content/feed/:id               — Read article (markdown body)
```

### Access Control

| Role | Endpoints | Scope |
|------|-----------|-------|
| coordinator | All `/content/articles/*` | Own articles only |
| super_admin | All `/content/articles/*` | Any article |
| client | `/content/feed`, `/content/feed/:id` | Published articles visible to them |

### Audience Visibility

| Author | audience_scope | Who sees it |
|--------|---------------|-------------|
| coordinator | all | All platform users |
| coordinator | my_clients | Active clients of this curator |
| coordinator | selected | Clients in article_audience |
| super_admin | all | All platform users |
| super_admin | selected | Clients in article_audience |

### Feed Query Logic

```sql
SELECT a.* FROM articles a
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
LIMIT $2 OFFSET $3;
```

## Backend Architecture

### Module: `internal/modules/content/`

```
content/
  handler.go          — HTTP handlers
  service.go          — Business logic, S3 operations, feed assembly
  types.go            — Structs
  scheduler.go        — Goroutine for publishing scheduled articles
  service_test.go     — Tests
```

### Scheduler

Goroutine started at server boot, ticks every 1 minute. Finds articles with `status=scheduled AND scheduled_at <= NOW()`, updates to `published`.

### S3 Client

New `storage.S3Client` instance with dedicated content bucket credentials (same pattern as weekly photos / chat / profile photos).

## Frontend Architecture

### Feature module: `features/content/`

```
features/content/
  api/
    contentApi.ts
  components/
    ContentLayout.tsx
    FeedList.tsx            — Card feed (client)
    FeedCard.tsx            — Card: cover, title, excerpt, date, category
    ArticleView.tsx         — Article reader (render markdown)
    CategoryFilter.tsx      — Category filter chips
    ArticleEditor.tsx       — Markdown editor (curator/admin)
    ArticleList.tsx         — My articles list (curator/admin)
    ArticleForm.tsx         — Metadata form (title, category, audience, schedule)
    AudienceSelector.tsx    — Audience picker (all / my_clients / selected + client multiselect)
    MediaUploader.tsx       — Media upload + insert URL into markdown
    FileUploader.tsx        — Upload .md file
    StatusBadge.tsx         — Status badge (draft/scheduled/published)
  hooks/
    useArticles.ts
    useFeed.ts
    useArticle.ts
  types/
    index.ts
  index.ts
```

### Pages (App Router)

```
app/
  content/
    page.tsx               — Client feed
    [id]/page.tsx          — Article view
  curator/
    content/
      page.tsx             — Curator article list
      new/page.tsx         — Create article
      [id]/edit/page.tsx   — Edit article
```

### Markdown

- Rendering: `react-markdown` + `remark-gfm`
- Editor: textarea with preview tab, toolbar for bold/italic/heading/image/link
- No heavy WYSIWYG — markdown-first approach

### Navigation

- Client: add "Контент" tab to bottom navigation (Главная, Фудтрекер, Чат, Контент)
- Curator: add "Контент" section to CuratorFooterNavigation

## Figma Reference

Board: https://www.figma.com/board/mcs9vGquaY249PSBz0FNsH/BurcevTeam?node-id=164-476
