# Content Import & Publishing Redesign

## Overview

Redesign the content preparation page and import workflow to make publishing articles from Markdown files seamless. Three main areas: smart MD import with frontmatter parsing, image proxying to S3, and page layout reorder.

## Problem

- **No metadata parsing on import:** FileUploader dumps raw MD into the textarea — title, category, excerpt, cover are not extracted
- **Cover image URL not saved on create:** `CreateArticleRequest` lacks `cover_image_url` on both frontend and backend — it's only supported in update
- **External image dependency:** Cover images point to Unsplash URLs; if Unsplash goes down, covers break
- **Unintuitive page layout:** Metadata fields (category, title, excerpt) appear below the editor, opposite to how a reader sees the article
- **Cover images live in a separate COVERS.md** instead of being part of each article's MD file

## Design

### 1. YAML Frontmatter Format

Replace the current quote-style metadata with standard YAML frontmatter:

```markdown
---
category: nutrition
excerpt: Узнай, что такое КБЖУ и зачем его считать
cover: https://images.unsplash.com/photo-1607532941433?w=800&q=80
audience: all
---

# Что такое КБЖУ и зачем его считать?

Тело статьи...
```

**Frontmatter fields (all optional):**
- `category` — one of: nutrition, training, recipes, health, motivation, general
- `excerpt` — short description for the feed card
- `cover` — cover image URL (will be proxied to S3)
- `audience` — one of: all, my_clients, selected (defaults to "all")

**Title:** Extracted from the first `# Heading` in the body, not from frontmatter. This avoids duplication — the title is always the H1.

**Existing articles in `docs/content-articles/`** will be converted to the new format, and `COVERS.md` info merged into each file's frontmatter.

### 2. Smart Import (Frontend Parsing)

When a user imports a .md file (via button click or drag&drop):

1. Parse YAML frontmatter — extract `category`, `excerpt`, `cover`, `audience`
2. Extract title from first `# Heading` in the body
3. Strip frontmatter and title H1 from body, set remaining content as editor body
4. Pre-fill all form fields with extracted values
5. Show cover preview if `cover` URL is present

The user reviews pre-filled fields and can edit before saving. No auto-save.

**Library:** Use `gray-matter` npm package for frontmatter parsing (well-maintained, 0 dependencies beyond one small parser).

### 3. Image Proxying to S3 (Backend)

When saving/updating an article with external image URLs:

1. Backend scans `cover_image_url` and body markdown for external image URLs (not already on our S3)
2. Downloads each external image
3. Uploads to S3 at `content/{articleId}/media/{hash}.{ext}`
4. Replaces URLs in body and cover_image_url with S3 URLs
5. Saves the article with updated URLs

This happens at **save time**, not import time — the frontend sends whatever URLs it has, and the backend normalizes them.

**Scope:** Only proxy URLs that are not already on our S3 domain. Skip data: URIs and relative paths.

**Error handling:** If an image download fails, keep the original URL and log a warning. Don't block article creation over a failed image proxy.

### 4. Page Layout Reorder

New order for the article preparation page (matches reader experience):

```
┌─────────────────────────────────────────┐
│  ← Назад          Импорт .md ▾         │  ← header with back + import
├─────────────────────────────────────────┤
│  Категория         [▾ Питание        ]  │
│  Заголовок *       [________________ ]  │
│  Краткое описание  [________________ ]  │
│  Обложка      [URL / Upload / Preview]  │
│  Аудитория    (○ Все  ○ Мои  ○ Выбр) │
├─────────────────────────────────────────┤
│  Редактор          │   Превью           │  ← split-view (mobile: tabs)
│  [toolbar]         │                    │
│  [textarea]        │   [rendered md]    │
├─────────────────────────────────────────┤
│  Запланировать     [datetime-local]     │  ← only for drafts
│  [Сохранить] [Опубликовать] [Планир.]   │
└─────────────────────────────────────────┘
```

**Cover image field changes:**
- Show URL text input (as now)
- Add file upload button / drag&drop zone for direct upload via MediaUploader
- Show image preview thumbnail when URL is present

### 5. Bug Fix: cover_image_url on Create

**Backend (`types.go`):** Add `CoverImageURL` to `CreateArticleRequest`:
```go
type CreateArticleRequest struct {
    // ... existing fields ...
    CoverImageURL string `json:"cover_image_url,omitempty"`
}
```

**Backend (`service.go`):** Add `cover_image_url` to INSERT query.

**Frontend (`types/index.ts`):** Add `cover_image_url` to `CreateArticleRequest` interface.

**Frontend (`ArticleForm.tsx`):** Include `cover_image_url` in the create branch of `handleSave`.

### 6. Drag & Drop Import

Add drag&drop zone to the page — user can drop a .md file anywhere on the form. Visual feedback (border highlight) on dragover. Falls back to existing button click.

### 7. Convert Existing Articles

Update all files in `docs/content-articles/` to use YAML frontmatter format:
- Move category and excerpt from quote-style to frontmatter
- Add cover URLs from COVERS.md into each article's frontmatter
- Remove COVERS.md (info is now in individual files)
- Strip the `---` separator line that was between metadata and body

## Files to Create/Modify

**Frontend — New:**
- `apps/web/src/features/content/utils/parseFrontmatter.ts` — frontmatter parser (or use gray-matter)
- `apps/web/src/features/content/components/CoverImageField.tsx` — cover URL input + upload + preview

**Frontend — Modify:**
- `apps/web/src/features/content/types/index.ts` — add `cover_image_url` to `CreateArticleRequest`
- `apps/web/src/features/content/components/ArticleEditor.tsx` — reorder layout, integrate smart import, drag&drop
- `apps/web/src/features/content/components/ArticleForm.tsx` — reorder fields, send `cover_image_url` on create, use CoverImageField
- `apps/web/src/features/content/components/FileUploader.tsx` — return parsed metadata alongside body

**Backend — Modify:**
- `apps/api/internal/modules/content/types.go` — add `CoverImageURL` to `CreateArticleRequest`
- `apps/api/internal/modules/content/service.go` — add `cover_image_url` to INSERT; add image proxy logic on save/update
- `apps/api/internal/modules/content/handler.go` — no changes expected (handler already binds request types)

**Content files:**
- `docs/content-articles/*.md` — convert all to YAML frontmatter format
- `docs/content-articles/COVERS.md` — delete after merging info into individual files

## Implementation Order

1. **Bug fix:** `cover_image_url` on create (backend + frontend) — small, independent, unblocks the rest
2. **Convert MD files** to YAML frontmatter format
3. **Frontend smart import:** parseFrontmatter util + FileUploader returns structured data
4. **Page layout reorder:** ArticleForm field order + CoverImageField component
5. **Drag & drop import** on the page
6. **Backend image proxy:** download external images → S3 on article save
7. **Tests** for each step
