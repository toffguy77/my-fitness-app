# Content Import & Publishing Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the content preparation page with smart MD import (YAML frontmatter parsing), image proxying to S3, and intuitive field ordering.

**Architecture:** Frontend parses YAML frontmatter from imported .md files and pre-fills form fields. Backend proxies external image URLs to S3 on article save. Page layout reordered to match the reader's experience (category → title → excerpt → cover → audience → body).

**Tech Stack:** Next.js 16 + React 19 + Tailwind v4 (frontend), Go/Gin + pgx (backend), gray-matter (frontmatter parsing), Yandex Cloud S3

---

### Task 1: Bug Fix — cover_image_url on Article Create (Backend)

**Files:**
- Modify: `apps/api/internal/modules/content/types.go:7-14`
- Modify: `apps/api/internal/modules/content/service.go:131-141`

**Step 1: Add CoverImageURL to Go CreateArticleRequest**

In `apps/api/internal/modules/content/types.go`, add the field to `CreateArticleRequest`:

```go
type CreateArticleRequest struct {
	Title         string  `json:"title" binding:"required,max=500"`
	Excerpt       string  `json:"excerpt" binding:"max=1000"`
	Body          string  `json:"body,omitempty"`
	Category      string  `json:"category" binding:"required"`
	AudienceScope string  `json:"audience_scope" binding:"required"`
	ClientIDs     []int64 `json:"client_ids,omitempty"`
	CoverImageURL string  `json:"cover_image_url,omitempty"`
}
```

**Step 2: Update INSERT query in CreateArticle**

In `apps/api/internal/modules/content/service.go`, change the INSERT query (~line 131) to include `cover_image_url`:

```go
	query := `
		INSERT INTO articles (id, author_id, title, excerpt, cover_image_url, category, audience_scope, content_s3_key, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', NOW(), NOW())
		RETURNING id, author_id, title, excerpt, COALESCE(cover_image_url, ''), category, status, audience_scope,
		          scheduled_at, published_at, created_at, updated_at
	`

	var article Article
	var scheduledAt, publishedAt sql.NullTime
	err = tx.QueryRowContext(ctx, query,
		id, authorID, req.Title, req.Excerpt, req.CoverImageURL, req.Category, req.AudienceScope, contentS3Key,
	).Scan(
```

Note: `$5` is now `cover_image_url`, shifting `category` to `$6`, `audience_scope` to `$7`, `content_s3_key` to `$8`.

**Step 3: Run backend tests**

Run: `cd apps/api && go test ./internal/modules/content/ -v -run TestCreateArticle`

If no existing `TestCreateArticle` tests exist, also run full suite to verify no regressions:

Run: `cd apps/api && go test ./internal/modules/content/ -v`

**Step 4: Commit**

```
fix(content): add cover_image_url to article create endpoint
```

---

### Task 2: Bug Fix — cover_image_url on Article Create (Frontend)

**Files:**
- Modify: `apps/web/src/features/content/types/index.ts:35-42`
- Modify: `apps/web/src/features/content/components/ArticleForm.tsx:96-107`
- Modify: `apps/web/src/features/content/components/__tests__/ArticleForm.test.tsx:62-78`

**Step 1: Add cover_image_url to TS CreateArticleRequest**

In `apps/web/src/features/content/types/index.ts`, add `cover_image_url` to `CreateArticleRequest`:

```typescript
export interface CreateArticleRequest {
  title: string
  excerpt?: string
  body?: string
  category: ContentCategory
  audience_scope: AudienceScope
  client_ids?: number[]
  cover_image_url?: string
}
```

**Step 2: Send cover_image_url in ArticleForm create branch**

In `apps/web/src/features/content/components/ArticleForm.tsx`, update the `handleSave` create branch (~line 98-107):

```typescript
        } else {
            const data: CreateArticleRequest = {
                title: title.trim(),
                excerpt: excerpt.trim() || undefined,
                category,
                audience_scope: audienceScope,
                client_ids: audienceScope === 'selected' ? clientIds : undefined,
                cover_image_url: coverImageUrl.trim() || undefined,
            }
            onSave(data)
        }
```

**Step 3: Update existing test to verify cover_image_url on create**

In `apps/web/src/features/content/components/__tests__/ArticleForm.test.tsx`, update the test "calls onSave with create data for new article" (~line 62-78). After typing the title and excerpt, also set a cover URL and verify it's included:

```typescript
    it('calls onSave with create data for new article', async () => {
        const user = userEvent.setup()
        render(<ArticleForm onSave={onSave} />)

        await user.type(screen.getByLabelText(/Заголовок/), 'New Article')
        await user.type(screen.getByLabelText('Краткое описание'), 'Description')
        await user.type(screen.getByLabelText('URL обложки'), 'https://example.com/img.jpg')

        fireEvent.click(screen.getByText('Сохранить черновик'))

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'New Article',
                excerpt: 'Description',
                category: 'general',
                audience_scope: 'all',
                cover_image_url: 'https://example.com/img.jpg',
            })
        )
    })
```

**Step 4: Run frontend tests**

Run: `cd apps/web && npx jest src/features/content/components/__tests__/ArticleForm.test.tsx --verbose`

**Step 5: Commit**

```
fix(content): send cover_image_url when creating article on frontend
```

---

### Task 3: Convert Existing MD Articles to YAML Frontmatter

**Files:**
- Modify: all 10 files in `docs/content-articles/*.md` (except COVERS.md)
- Delete: `docs/content-articles/COVERS.md`

**Step 1: Convert each article**

Category name mapping (Russian → enum):
- Общее → general
- Питание → nutrition
- Тренировки → training
- Рецепты → recipes
- Здоровье → health
- Мотивация → motivation

Cover URLs from COVERS.md:
- 01: `https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&q=80`
- 02: `https://images.unsplash.com/photo-1607532941433-304659e8198a?w=800&q=80`
- 03: `https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80`
- 04: `https://images.unsplash.com/photo-1758875569414-120ebc62ada3?w=800&q=80`
- 05: `https://images.unsplash.com/photo-1586281380117-5a60ae2050cc?w=800&q=80`
- 06: `https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=800&q=80`
- 07: `https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80`
- 08: `https://images.unsplash.com/photo-1637666218229-1fe0a9419267?w=800&q=80`
- 09: `https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&q=80`
- 10: `https://images.unsplash.com/photo-1569420077790-afb136b3bb8c?w=800&q=80`

Convert each file from this format:
```markdown
# Title

> **Категория:** Общее
> **Краткое описание:** Description text

---

Body content...
```

To this format:
```markdown
---
category: general
excerpt: Description text
cover: https://images.unsplash.com/photo-...?w=800&q=80
audience: all
---

# Title

Body content...
```

**Step 2: Delete COVERS.md**

All cover data is now in individual article frontmatter.

**Step 3: Commit**

```
refactor(content): convert articles to YAML frontmatter format
```

---

### Task 4: Frontmatter Parser Utility

**Files:**
- Create: `apps/web/src/features/content/utils/parseFrontmatter.ts`
- Create: `apps/web/src/features/content/utils/__tests__/parseFrontmatter.test.ts`

**Step 1: Write the test**

```typescript
import { parseArticleMarkdown } from '../parseFrontmatter'

describe('parseArticleMarkdown', () => {
    it('parses frontmatter and extracts title from H1', () => {
        const md = `---
category: nutrition
excerpt: Short description
cover: https://example.com/img.jpg
audience: all
---

# My Article Title

Body content here.`

        const result = parseArticleMarkdown(md)

        expect(result.title).toBe('My Article Title')
        expect(result.category).toBe('nutrition')
        expect(result.excerpt).toBe('Short description')
        expect(result.coverUrl).toBe('https://example.com/img.jpg')
        expect(result.audience).toBe('all')
        expect(result.body).toBe('Body content here.')
    })

    it('handles missing frontmatter', () => {
        const md = `# Just a Title

Some body text.`

        const result = parseArticleMarkdown(md)

        expect(result.title).toBe('Just a Title')
        expect(result.category).toBeUndefined()
        expect(result.excerpt).toBeUndefined()
        expect(result.coverUrl).toBeUndefined()
        expect(result.body).toBe('Some body text.')
    })

    it('handles frontmatter without H1 title', () => {
        const md = `---
category: health
---

Body without title heading.`

        const result = parseArticleMarkdown(md)

        expect(result.title).toBeUndefined()
        expect(result.category).toBe('health')
        expect(result.body).toBe('Body without title heading.')
    })

    it('strips leading/trailing whitespace from body', () => {
        const md = `---
category: general
---

# Title

  Body with spaces.

More text.`

        const result = parseArticleMarkdown(md)

        expect(result.body).toBe('Body with spaces.  \n\nMore text.')
    })

    it('validates category against allowed values', () => {
        const md = `---
category: invalid_cat
---

# Title

Body.`

        const result = parseArticleMarkdown(md)

        expect(result.category).toBeUndefined()
    })

    it('handles old quote-style format gracefully (no crash)', () => {
        const md = `# Title

> **Категория:** Питание
> **Краткое описание:** Desc

---

Body.`

        const result = parseArticleMarkdown(md)

        expect(result.title).toBe('Title')
        // Old format is not parsed into structured fields
        expect(result.category).toBeUndefined()
        // Body includes the old metadata as-is
        expect(result.body).toContain('Категория')
    })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx jest src/features/content/utils/__tests__/parseFrontmatter.test.ts --verbose`
Expected: FAIL (module not found)

**Step 3: Install gray-matter**

Run: `cd apps/web && npm install gray-matter`

Note: gray-matter uses `js-yaml` internally. Both are well-maintained, zero native deps.

**Step 4: Write the implementation**

Create `apps/web/src/features/content/utils/parseFrontmatter.ts`:

```typescript
import matter from 'gray-matter'
import type { ContentCategory, AudienceScope } from '@/features/content/types'

const VALID_CATEGORIES: ContentCategory[] = [
    'nutrition', 'training', 'recipes', 'health', 'motivation', 'general',
]
const VALID_AUDIENCES: AudienceScope[] = ['all', 'my_clients', 'selected']

export interface ParsedArticle {
    title?: string
    category?: ContentCategory
    excerpt?: string
    coverUrl?: string
    audience?: AudienceScope
    body: string
}

export function parseArticleMarkdown(raw: string): ParsedArticle {
    const { data, content } = matter(raw)

    // Extract title from first H1
    const h1Match = content.match(/^#\s+(.+)$/m)
    const title = h1Match ? h1Match[1].trim() : undefined

    // Remove the H1 line from body
    const body = h1Match
        ? content.replace(/^#\s+.+\n*/m, '').trim()
        : content.trim()

    // Validate category
    const category = VALID_CATEGORIES.includes(data.category)
        ? (data.category as ContentCategory)
        : undefined

    // Validate audience
    const audience = VALID_AUDIENCES.includes(data.audience)
        ? (data.audience as AudienceScope)
        : undefined

    return {
        title,
        category,
        excerpt: typeof data.excerpt === 'string' ? data.excerpt : undefined,
        coverUrl: typeof data.cover === 'string' ? data.cover : undefined,
        audience,
        body,
    }
}
```

**Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx jest src/features/content/utils/__tests__/parseFrontmatter.test.ts --verbose`
Expected: all PASS

**Step 6: Commit**

```
feat(content): add frontmatter parser for MD article import
```

---

### Task 5: Smart Import — FileUploader Returns Parsed Data

**Files:**
- Modify: `apps/web/src/features/content/components/FileUploader.tsx`

**Step 1: Update FileUploader to parse and return structured data**

Replace the entire `FileUploader.tsx`:

```typescript
'use client'

import { useRef } from 'react'
import { parseArticleMarkdown, type ParsedArticle } from '@/features/content/utils/parseFrontmatter'

interface FileUploaderProps {
    onFileLoaded: (parsed: ParsedArticle, filename: string) => void
}

export function FileUploader({ onFileLoaded }: FileUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null)

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = () => {
            const content = reader.result as string
            const parsed = parseArticleMarkdown(content)
            onFileLoaded(parsed, file.name)
        }
        reader.readAsText(file)

        if (inputRef.current) {
            inputRef.current.value = ''
        }
    }

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
                Импорт .md файла
            </button>
            <input
                ref={inputRef}
                type="file"
                accept=".md,.markdown,text/markdown"
                onChange={handleChange}
                className="hidden"
            />
        </div>
    )
}
```

**Step 2: Update ArticleEditor to handle parsed import data**

In `apps/web/src/features/content/components/ArticleEditor.tsx`, change `handleFileImport` (~line 197) and add a callback for updating form fields. The ArticleForm needs to accept an `importedData` prop:

```typescript
    // Replace the old handleFileImport
    const [importedData, setImportedData] = useState<ParsedArticle | undefined>(undefined)

    function handleFileImport(parsed: ParsedArticle) {
        setBody(parsed.body)
        setImportedData(parsed)
    }
```

Add import at the top:
```typescript
import type { ParsedArticle } from '@/features/content/utils/parseFrontmatter'
```

Pass `importedData` to `ArticleForm`:
```typescript
                <ArticleForm
                    article={article}
                    importedData={importedData}
                    onSave={handleSave}
                    ...
                />
```

**Step 3: Update ArticleForm to accept and apply importedData**

In `apps/web/src/features/content/components/ArticleForm.tsx`:

Add `importedData` to props interface:
```typescript
interface ArticleFormProps {
    article?: Article
    importedData?: ParsedArticle
    onSave: (data: CreateArticleRequest | UpdateArticleRequest, body?: string) => void
    onPublish?: () => void
    onSchedule?: (scheduledAt: string) => void
    loading?: boolean
}
```

Add import:
```typescript
import type { ParsedArticle } from '@/features/content/utils/parseFrontmatter'
```

Add useEffect to apply imported data (after the existing article sync effect):
```typescript
    // Apply imported data from file import
    useEffect(() => {
        if (!importedData) return
        if (importedData.title) setTitle(importedData.title)
        if (importedData.excerpt) setExcerpt(importedData.excerpt)
        if (importedData.category) setCategory(importedData.category)
        if (importedData.audience) setAudienceScope(importedData.audience)
        if (importedData.coverUrl) setCoverImageUrl(importedData.coverUrl)
    }, [importedData])
```

**Step 4: Run tests**

Run: `cd apps/web && npx jest src/features/content/ --verbose`

**Step 5: Commit**

```
feat(content): smart import parses frontmatter and pre-fills form fields
```

---

### Task 6: Page Layout Reorder + Cover Image Preview

**Files:**
- Modify: `apps/web/src/features/content/components/ArticleEditor.tsx`
- Modify: `apps/web/src/features/content/components/ArticleForm.tsx`

**Step 1: Reorder ArticleForm fields**

In `ArticleForm.tsx`, change the field order inside the return JSX to: Category → Title → Excerpt → Cover Image (with preview) → Audience. Move schedule and buttons to a separate section.

New return block for ArticleForm:
```typescript
    return (
        <div className="space-y-4">
            {/* Category */}
            <div>
                <label htmlFor="article-category" className="mb-1 block text-sm font-medium text-gray-700">
                    Категория
                </label>
                <select
                    id="article-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ContentCategory)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                    {categories.map((cat) => (
                        <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                    ))}
                </select>
            </div>

            {/* Title */}
            <div>
                <label htmlFor="article-title" className="mb-1 block text-sm font-medium text-gray-700">
                    Заголовок <span className="text-red-500">*</span>
                </label>
                <input
                    id="article-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Введите заголовок статьи"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
            </div>

            {/* Excerpt */}
            <div>
                <label htmlFor="article-excerpt" className="mb-1 block text-sm font-medium text-gray-700">
                    Краткое описание
                </label>
                <textarea
                    id="article-excerpt"
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    placeholder="Краткое описание статьи"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
            </div>

            {/* Cover image URL + preview */}
            <div>
                <label htmlFor="article-cover" className="mb-1 block text-sm font-medium text-gray-700">
                    Обложка
                </label>
                <input
                    id="article-cover"
                    type="text"
                    value={coverImageUrl}
                    onChange={(e) => setCoverImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {coverImageUrl && (
                    <div className="mt-2">
                        <img
                            src={coverImageUrl}
                            alt="Превью обложки"
                            className="h-32 w-auto rounded-lg border border-gray-200 object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                    </div>
                )}
            </div>

            {/* Audience */}
            <AudienceSelector
                value={audienceScope}
                onChange={setAudienceScope}
                clientIds={clientIds}
                onClientIdsChange={setClientIds}
            />

            {/* Schedule datetime (draft only) */}
            {isDraft && (
                <div>
                    <label htmlFor="article-schedule" className="mb-1 block text-sm font-medium text-gray-700">
                        Запланировать публикацию
                    </label>
                    <input
                        id="article-schedule"
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
                {/* ... existing buttons unchanged ... */}
            </div>
        </div>
    )
```

**Step 2: Reorder ArticleEditor layout**

In `ArticleEditor.tsx`, move the metadata form section **above** the editor/preview. New layout order in the return JSX:

1. Error banner
2. File import button row (top-right)
3. Metadata form block (ArticleForm) — but **without** action buttons
4. Editor/Preview split
5. Action buttons at the bottom

To achieve this, split ArticleForm into two sections:
- Extract action buttons and schedule from ArticleForm into ArticleEditor
- Or: render ArticleForm above the editor, keep buttons below

Simpler approach — just move the `<ArticleForm>` block above the editor grid in the `ArticleEditor` return:

```typescript
    return (
        <div className="space-y-6">
            {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            {/* File import + media upload */}
            <div className="flex flex-wrap items-center gap-3">
                <FileUploader onFileLoaded={handleFileImport} />
                {article && (
                    <MediaUploader articleId={article.id} onUpload={handleMediaUpload} />
                )}
            </div>

            {/* Article metadata (moved above editor) */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-4 text-sm font-semibold text-gray-900">Настройки статьи</h2>
                <ArticleForm
                    article={article}
                    importedData={importedData}
                    onSave={handleSave}
                    onPublish={article ? handlePublish : undefined}
                    onSchedule={article ? handleSchedule : undefined}
                    loading={loading}
                />
            </div>

            {/* Mobile tab toggle */}
            {/* ... existing tab toggle ... */}

            {/* Editor + Preview layout */}
            {/* ... existing grid with toolbar + textarea + preview ... */}
        </div>
    )
```

**Step 3: Run tests**

Run: `cd apps/web && npx jest src/features/content/ --verbose`

**Step 4: Run type-check**

Run: `cd apps/web && npm run type-check`

**Step 5: Commit**

```
feat(content): reorder page layout and add cover image preview
```

---

### Task 7: Drag & Drop MD File Import

**Files:**
- Modify: `apps/web/src/features/content/components/ArticleEditor.tsx`

**Step 1: Add drag & drop handling to ArticleEditor**

Add state for drag visual feedback and drop handler:

```typescript
    const [isDragging, setIsDragging] = useState(false)

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault()
        setIsDragging(true)
    }

    function handleDragLeave(e: React.DragEvent) {
        e.preventDefault()
        setIsDragging(false)
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault()
        setIsDragging(false)

        const file = e.dataTransfer.files[0]
        if (!file || !file.name.match(/\.(md|markdown)$/i)) return

        const reader = new FileReader()
        reader.onload = () => {
            const content = reader.result as string
            const parsed = parseArticleMarkdown(content)
            handleFileImport(parsed)
        }
        reader.readAsText(file)
    }
```

Add import at top:
```typescript
import { parseArticleMarkdown } from '@/features/content/utils/parseFrontmatter'
```

Wrap the entire return div with drag handlers and a visual indicator:

```typescript
    return (
        <div
            className={`space-y-6 ${isDragging ? 'rounded-xl ring-2 ring-blue-400 ring-offset-2' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragging && (
                <div className="rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 p-8 text-center text-sm text-blue-600">
                    Перетащите .md файл сюда
                </div>
            )}
            {/* ... rest of the layout ... */}
        </div>
    )
```

**Step 2: Run type-check and lint**

Run: `cd apps/web && npm run type-check && npm run lint`

**Step 3: Commit**

```
feat(content): add drag & drop import for markdown files
```

---

### Task 8: Backend Image Proxy — Download External Images to S3

**Files:**
- Modify: `apps/api/internal/modules/content/service.go`

This task adds a helper method `proxyExternalImages` that:
1. Scans cover_image_url and body for external image URLs
2. Downloads each to S3
3. Returns updated cover URL and body with S3 URLs

**Step 1: Add the image proxy method**

Add to `service.go` (before `CreateArticle`):

```go
import (
    "crypto/sha256"
    "encoding/hex"
    "net/http"
    "net/url"
    "path"
    "regexp"
    "strings"
    // ... existing imports
)

// proxyExternalImages downloads external images and uploads them to S3.
// Returns updated coverURL and body with S3 URLs. Non-fatal: logs errors and keeps original URLs.
func (s *Service) proxyExternalImages(ctx context.Context, articleID, coverURL, body string) (string, string) {
    if s.s3 == nil {
        return coverURL, body
    }

    s3Domain := "storage.yandexcloud.net"

    isExternal := func(imgURL string) bool {
        if imgURL == "" {
            return false
        }
        parsed, err := url.Parse(imgURL)
        if err != nil || parsed.Scheme == "" || parsed.Scheme == "data" {
            return false
        }
        return !strings.Contains(parsed.Host, s3Domain)
    }

    proxyOne := func(imgURL string) string {
        if !isExternal(imgURL) {
            return imgURL
        }

        // Download
        resp, err := http.Get(imgURL)
        if err != nil {
            s.log.Warn("Failed to download external image", "url", imgURL, "error", err)
            return imgURL
        }
        defer resp.Body.Close()

        if resp.StatusCode != http.StatusOK {
            s.log.Warn("External image returned non-200", "url", imgURL, "status", resp.StatusCode)
            return imgURL
        }

        imgData, err := io.ReadAll(resp.Body)
        if err != nil {
            s.log.Warn("Failed to read external image", "url", imgURL, "error", err)
            return imgURL
        }

        // Determine extension from URL path or content-type
        ext := path.Ext(strings.SplitN(imgURL, "?", 2)[0])
        if ext == "" || len(ext) > 5 {
            ct := resp.Header.Get("Content-Type")
            switch {
            case strings.Contains(ct, "png"):
                ext = ".png"
            case strings.Contains(ct, "webp"):
                ext = ".webp"
            case strings.Contains(ct, "gif"):
                ext = ".gif"
            default:
                ext = ".jpg"
            }
        }

        // Hash for unique filename
        hash := sha256.Sum256(imgData)
        filename := hex.EncodeToString(hash[:8]) + ext
        s3Key := fmt.Sprintf("content/%s/media/%s", articleID, filename)

        s3URL, err := s.s3.UploadFile(ctx, s3Key, bytes.NewReader(imgData), resp.Header.Get("Content-Type"), int64(len(imgData)))
        if err != nil {
            s.log.Warn("Failed to upload proxied image to S3", "url", imgURL, "error", err)
            return imgURL
        }

        s.log.Info("Proxied external image to S3", "original_url", imgURL, "s3_url", s3URL)
        return s3URL
    }

    // Proxy cover
    newCover := proxyOne(coverURL)

    // Proxy images in body: ![alt](url)
    imgRegex := regexp.MustCompile(`(!\[[^\]]*\]\()([^)]+)(\))`)
    newBody := imgRegex.ReplaceAllStringFunc(body, func(match string) string {
        parts := imgRegex.FindStringSubmatch(match)
        if len(parts) < 4 {
            return match
        }
        newURL := proxyOne(parts[2])
        return parts[1] + newURL + parts[3]
    })

    return newCover, newBody
}
```

**Step 2: Call proxyExternalImages in CreateArticle**

In `CreateArticle` method, after validating request but before S3 body upload (~line 97):

```go
    // Proxy external images to S3
    proxiedCover, proxiedBody := s.proxyExternalImages(ctx, id, req.CoverImageURL, req.Body)
    req.CoverImageURL = proxiedCover
    req.Body = proxiedBody
```

**Step 3: Call proxyExternalImages in UpdateArticle**

In `UpdateArticle` method, before the SET clauses construction:

```go
    // Proxy external images in body
    currentCover := ""
    if req.CoverImageURL != nil {
        currentCover = *req.CoverImageURL
    }
    currentBody := ""
    if req.Body != nil {
        currentBody = *req.Body
    }
    if currentCover != "" || currentBody != "" {
        newCover, newBody := s.proxyExternalImages(ctx, articleID, currentCover, currentBody)
        if req.CoverImageURL != nil {
            req.CoverImageURL = &newCover
        }
        if req.Body != nil {
            req.Body = &newBody
        }
    }
```

**Step 4: Run backend tests**

Run: `cd apps/api && go test ./internal/modules/content/ -v`
Run: `cd apps/api && go build ./...`

**Step 5: Commit**

```
feat(content): proxy external images to S3 on article save
```

---

### Task 9: Backend Image Proxy — Tests

**Files:**
- Modify: `apps/api/internal/modules/content/service_test.go`

**Step 1: Write test for proxyExternalImages**

This requires a test HTTP server and a mock S3 client. Add to `service_test.go`:

```go
func TestProxyExternalImages(t *testing.T) {
    // Create a test HTTP server serving a fake image
    imgData := []byte("fake-image-data")
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "image/jpeg")
        w.Write(imgData)
    }))
    defer ts.Close()

    t.Run("proxies external cover image", func(t *testing.T) {
        service, _, cleanup := setupTestService(t)
        defer cleanup()

        // Set up a mock S3 client
        mockS3 := &mockS3Client{uploadURL: "https://storage.yandexcloud.net/bucket/content/art-1/media/img.jpg"}
        service.s3 = mockS3

        cover, body := service.proxyExternalImages(context.Background(), "art-1", ts.URL+"/cover.jpg", "no images here")

        assert.Contains(t, cover, "storage.yandexcloud.net")
        assert.Equal(t, "no images here", body)
        assert.Equal(t, 1, mockS3.uploadCount)
    })

    t.Run("proxies images in markdown body", func(t *testing.T) {
        service, _, cleanup := setupTestService(t)
        defer cleanup()

        mockS3 := &mockS3Client{uploadURL: "https://storage.yandexcloud.net/bucket/proxied.jpg"}
        service.s3 = mockS3

        body := fmt.Sprintf("text ![alt](%s/photo.jpg) more text", ts.URL)
        _, newBody := service.proxyExternalImages(context.Background(), "art-1", "", body)

        assert.Contains(t, newBody, "storage.yandexcloud.net")
        assert.NotContains(t, newBody, ts.URL)
    })

    t.Run("skips already-S3 URLs", func(t *testing.T) {
        service, _, cleanup := setupTestService(t)
        defer cleanup()

        mockS3 := &mockS3Client{}
        service.s3 = mockS3

        s3URL := "https://storage.yandexcloud.net/bucket/existing.jpg"
        cover, _ := service.proxyExternalImages(context.Background(), "art-1", s3URL, "")

        assert.Equal(t, s3URL, cover)
        assert.Equal(t, 0, mockS3.uploadCount)
    })

    t.Run("keeps original URL on download failure", func(t *testing.T) {
        service, _, cleanup := setupTestService(t)
        defer cleanup()

        mockS3 := &mockS3Client{}
        service.s3 = mockS3

        badURL := "https://nonexistent.invalid/image.jpg"
        cover, _ := service.proxyExternalImages(context.Background(), "art-1", badURL, "")

        assert.Equal(t, badURL, cover)
    })
}
```

You'll also need a mock S3 client struct in the test file. Check if one already exists; if not, add:

```go
type mockS3Client struct {
    uploadURL   string
    uploadCount int
}

func (m *mockS3Client) UploadFile(ctx context.Context, key string, data io.Reader, contentType string, size int64) (string, error) {
    m.uploadCount++
    return m.uploadURL, nil
}

func (m *mockS3Client) GetFile(ctx context.Context, key string) ([]byte, error) {
    return nil, nil
}

func (m *mockS3Client) DeleteFile(ctx context.Context, key string) error {
    return nil
}

func (m *mockS3Client) GetSignedURL(ctx context.Context, key string, expires time.Duration) (string, error) {
    return "", nil
}
```

Note: Check what interface `s.s3` is typed as in `service.go` and match the mock methods accordingly.

**Step 2: Run tests**

Run: `cd apps/api && go test ./internal/modules/content/ -v -run TestProxyExternalImages`
Expected: all PASS

**Step 3: Commit**

```
test(content): add tests for external image proxy to S3
```

---

### Task 10: Final Integration Test & Cleanup

**Files:**
- Run full test suites

**Step 1: Run all backend tests**

Run: `cd apps/api && go test ./... -v`

**Step 2: Run all frontend tests**

Run: `cd apps/web && npx jest --verbose`

**Step 3: Run linting and type-check**

Run: `cd apps/web && npm run lint && npm run type-check`

**Step 4: Run build**

Run: `make build-web && make build-api`

**Step 5: Fix any issues found**

**Step 6: Final commit if needed**

```
chore(content): fix lint/type-check issues from import redesign
```
