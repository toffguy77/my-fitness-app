# Yandex SEO Optimization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive Yandex SEO optimization to the BURCEV fitness app — robots, sitemap, metadata, JSON-LD, public content API, and landing page rework.

**Architecture:** New public API endpoints for content (no JWT), Next.js metadata API for SEO tags, server components for content pages, reusable JsonLd component for structured data.

**Tech Stack:** Next.js 16 Metadata API, Go/Gin (public endpoints), Schema.org JSON-LD, Next.js ImageResponse for OG images.

---

### Task 1: Add robots.ts

**Files:**
- Create: `apps/web/src/app/robots.ts`

**Step 1: Create robots.ts**

```ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/auth', '/legal/', '/content/'],
                disallow: [
                    '/dashboard',
                    '/food-tracker',
                    '/notifications',
                    '/profile',
                    '/settings',
                    '/chat',
                    '/curator',
                    '/admin',
                    '/onboarding',
                    '/forgot-password',
                    '/reset-password',
                    '/api/',
                ],
            },
            {
                userAgent: 'Yandex',
                allow: ['/', '/auth', '/legal/', '/content/'],
                disallow: [
                    '/dashboard',
                    '/food-tracker',
                    '/notifications',
                    '/profile',
                    '/settings',
                    '/chat',
                    '/curator',
                    '/admin',
                    '/onboarding',
                    '/forgot-password',
                    '/reset-password',
                    '/api/',
                ],
                crawlDelay: 2,
            },
        ],
        sitemap: 'https://burcev.team/sitemap.xml',
        host: 'https://burcev.team',
    }
}
```

**Step 2: Verify**

Run: `cd apps/web && npx next build 2>&1 | head -20`
Expected: No build errors related to robots.ts

**Step 3: Commit**

```bash
git add apps/web/src/app/robots.ts
git commit -m "feat(seo): add robots.ts with Yandex-specific rules"
```

---

### Task 2: Add public content API endpoints (Go backend)

The current `/api/v1/content/feed` requires JWT auth. We need public endpoints that return only `audience_scope = 'all'` published articles.

**Files:**
- Modify: `apps/api/internal/modules/content/handler.go` — add `GetPublicFeed` and `GetPublicArticle` handlers
- Modify: `apps/api/internal/modules/content/service.go` — add `GetPublicFeed` and `GetPublicArticle` service methods
- Modify: `apps/api/cmd/server/main.go` — register public routes without auth middleware

**Step 1: Add service interface methods**

In `apps/api/internal/modules/content/service.go`, add to `ServiceInterface`:

```go
// Public operations (no auth required)
GetPublicFeed(ctx context.Context, category string, limit int, offset int) (*FeedResponse, error)
GetPublicArticle(ctx context.Context, articleID string) (*Article, error)
```

**Step 2: Implement GetPublicFeed**

In `apps/api/internal/modules/content/service.go`, add after `GetFeedArticle`:

```go
// GetPublicFeed returns published articles with audience_scope='all' (no auth required).
func (s *Service) GetPublicFeed(ctx context.Context, category string, limit int, offset int) (*FeedResponse, error) {
	startTime := time.Now()

	whereClause := `a.status = 'published' AND a.audience_scope = 'all'`
	args := []any{}
	argIdx := 1

	if category != "" {
		whereClause += fmt.Sprintf(" AND a.category = $%d", argIdx)
		args = append(args, category)
		argIdx++
	}

	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM articles a WHERE %s`, whereClause)
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("failed to count public feed articles: %w", err)
	}

	selectQuery := fmt.Sprintf(`
		SELECT a.id, COALESCE(u.name, '') AS author_name, a.title, a.excerpt,
		       COALESCE(a.cover_image_url, ''), a.category, a.published_at
		FROM articles a
		JOIN users u ON u.id = a.author_id
		WHERE %s
		ORDER BY a.published_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIdx, argIdx+1)

	selectArgs := append(args, limit, offset)
	rows, err := s.db.QueryContext(ctx, selectQuery, selectArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to query public feed articles: %w", err)
	}
	defer rows.Close()

	articles := make([]ArticleCard, 0)
	for rows.Next() {
		var card ArticleCard
		var publishedAt sql.NullTime
		if err := rows.Scan(&card.ID, &card.AuthorName, &card.Title, &card.Excerpt,
			&card.CoverImageURL, &card.Category, &publishedAt); err != nil {
			return nil, fmt.Errorf("failed to scan public feed article: %w", err)
		}
		if publishedAt.Valid {
			card.PublishedAt = &publishedAt.Time
		}
		articles = append(articles, card)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating public feed rows: %w", err)
	}

	s.log.LogDatabaseQuery("GetPublicFeed", time.Since(startTime), nil, map[string]interface{}{
		"category": category, "count": len(articles), "total": total,
	})

	return &FeedResponse{Articles: articles, Total: total}, nil
}
```

**Step 3: Implement GetPublicArticle**

```go
// GetPublicArticle returns a single published article with audience_scope='all' (no auth required).
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
	var contentS3Key string
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
		return nil, fmt.Errorf("failed to get public article: %w", err)
	}

	if publishedAt.Valid {
		article.PublishedAt = &publishedAt.Time
	}

	// Load body from S3
	if contentS3Key != "" && s.s3 != nil {
		body, err := s.s3.GetObject(ctx, contentS3Key)
		if err != nil {
			s.log.Error("Failed to load article body from S3", "error", err, "key", contentS3Key)
		} else {
			article.Body = string(body)
		}
	}

	s.log.LogDatabaseQuery("GetPublicArticle", time.Since(startTime), nil, map[string]interface{}{
		"article_id": articleID,
	})

	return &article, nil
}
```

**Step 4: Add handler methods**

In `apps/api/internal/modules/content/handler.go`, add after `GetFeedArticle`:

```go
// --- Public handlers (no auth) ---

// GetPublicFeed handles GET /api/v1/public/content
func (h *Handler) GetPublicFeed(c *gin.Context) {
	category := c.Query("category")

	limit := 20
	if limitStr := c.DefaultQuery("limit", "20"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	offset := 0
	if offsetStr := c.DefaultQuery("offset", "0"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	result, err := h.service.GetPublicFeed(c.Request.Context(), category, limit, offset)
	if err != nil {
		h.log.Error("Failed to get public feed", "error", err)
		response.InternalError(c, "Не удалось загрузить ленту")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// GetPublicArticle handles GET /api/v1/public/content/:id
func (h *Handler) GetPublicArticle(c *gin.Context) {
	articleID := c.Param("id")
	if articleID == "" {
		response.Error(c, http.StatusBadRequest, "Не указан идентификатор статьи")
		return
	}

	article, err := h.service.GetPublicArticle(c.Request.Context(), articleID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Статья не найдена")
			return
		}
		h.log.Error("Failed to get public article", "error", err, "article_id", articleID)
		response.InternalError(c, "Не удалось загрузить статью")
		return
	}

	response.Success(c, http.StatusOK, article)
}
```

**Step 5: Register public routes in main.go**

In `apps/api/cmd/server/main.go`, add before the content management routes section (around line 410):

```go
// Public content routes (no auth required)
publicContentGroup := v1.Group("/public/content")
{
    publicContentGroup.GET("", contentHandler.GetPublicFeed)
    publicContentGroup.GET("/:id", contentHandler.GetPublicArticle)
}
```

**Step 6: Run backend tests**

Run: `cd apps/api && go build ./...`
Expected: Successful compilation

Run: `cd apps/api && go test ./internal/modules/content/ -v -count=1`
Expected: Existing tests pass

**Step 7: Commit**

```bash
git add apps/api/internal/modules/content/handler.go apps/api/internal/modules/content/service.go apps/api/cmd/server/main.go
git commit -m "feat(api): add public content endpoints for SEO (no auth required)"
```

---

### Task 3: Update root layout metadata and viewport

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Step 1: Update layout.tsx**

Replace the current metadata export and add viewport. The full file should be:

```ts
import type { Metadata, Viewport } from 'next'
import { Toaster } from 'react-hot-toast'
import { YandexMetrika } from '@/shared/components/YandexMetrika'
import './globals.css'

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: '#000000',
}

export const metadata: Metadata = {
    metadataBase: new URL('https://burcev.team'),
    title: {
        default: 'BURCEV — Фитнес и питание',
        template: '%s | BURCEV',
    },
    description:
        'Персональный трекер питания, тренировок и прогресса. Контролируй калории, КБЖУ и водный баланс.',
    keywords: [
        'фитнес трекер',
        'дневник питания',
        'калории',
        'КБЖУ',
        'тренировки',
        'нутриенты',
        'водный баланс',
    ],
    authors: [{ name: 'BURCEV' }],
    creator: 'BURCEV',
    icons: { icon: '/logo.svg' },
    openGraph: {
        type: 'website',
        locale: 'ru_RU',
        siteName: 'BURCEV',
        title: 'BURCEV — Фитнес и питание',
        description:
            'Персональный трекер питания, тренировок и прогресса',
        url: 'https://burcev.team',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'BURCEV' }],
    },
    alternates: {
        canonical: 'https://burcev.team',
    },
    verification: {
        yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
    },
    robots: {
        index: true,
        follow: true,
    },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="ru">
            <body>
                <YandexMetrika />
                {children}
                <Toaster
                    position="top-center"
                    toastOptions={{
                        duration: 3000,
                        style: {
                            background: '#363636',
                            color: '#fff',
                        },
                        success: {
                            duration: 3000,
                            iconTheme: {
                                primary: '#10b981',
                                secondary: '#fff',
                            },
                        },
                        error: {
                            duration: 4000,
                            iconTheme: {
                                primary: '#ef4444',
                                secondary: '#fff',
                            },
                        },
                    }}
                />
            </body>
        </html>
    )
}
```

**Step 2: Verify**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: No build errors

**Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(seo): add comprehensive metadata, viewport, and OG tags to root layout"
```

---

### Task 4: Create JsonLd component

**Files:**
- Create: `apps/web/src/shared/components/JsonLd.tsx`

**Step 1: Create the component**

The `JSON.stringify` call here is safe — it serializes a JavaScript object into a JSON string, which cannot contain executable HTML/script content. This is the standard Next.js pattern for JSON-LD structured data.

```tsx
interface JsonLdProps {
    data: Record<string, unknown>
}

export function JsonLd({ data }: JsonLdProps) {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
    )
}
```

**Step 2: Commit**

```bash
git add apps/web/src/shared/components/JsonLd.tsx
git commit -m "feat(seo): add reusable JsonLd component for structured data"
```

---

### Task 5: Create OG image generator

**Files:**
- Create: `apps/web/src/app/opengraph-image.tsx`

**Step 1: Create opengraph-image.tsx**

```tsx
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'BURCEV — Фитнес и питание'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 50%, #ecfdf5 100%)',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'sans-serif',
                }}
            >
                <div
                    style={{
                        fontSize: 72,
                        fontWeight: 800,
                        color: '#111827',
                        marginBottom: 16,
                    }}
                >
                    BURCEV
                </div>
                <div
                    style={{
                        fontSize: 32,
                        color: '#4b5563',
                        textAlign: 'center',
                        maxWidth: 800,
                    }}
                >
                    Персональный трекер питания и фитнеса
                </div>
                <div
                    style={{
                        fontSize: 20,
                        color: '#9ca3af',
                        marginTop: 24,
                    }}
                >
                    burcev.team
                </div>
            </div>
        ),
        { ...size },
    )
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/opengraph-image.tsx
git commit -m "feat(seo): add dynamic OG image generator"
```

---

### Task 6: Rework landing page for SEO

**Files:**
- Create: `apps/web/src/app/_components/AuthRedirect.tsx`
- Modify: `apps/web/src/app/page.tsx` — convert to server component, add metadata, JSON-LD, semantic HTML

**Step 1: Create AuthRedirect client component**

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/shared/utils/token-storage'

export function AuthRedirect() {
    const router = useRouter()
    useEffect(() => {
        if (isAuthenticated()) {
            router.replace('/dashboard')
        }
    }, [router])
    return null
}
```

**Step 2: Rewrite page.tsx as server component**

Remove `'use client'` directive. Add metadata export, JSON-LD, nav, "How it works" section, footer links to `/content`, `/legal/terms`, `/legal/privacy`. Import `AuthRedirect` client component for the redirect behavior.

Full replacement — see design doc for section details. Key changes:
- Remove `'use client'`
- Remove `useEffect`/`useRouter`/`isAuthenticated` imports (moved to AuthRedirect)
- Add `export const metadata: Metadata` with title, description, OG, canonical
- Add `organizationJsonLd` and `webAppJsonLd` objects
- Render `<JsonLd>` and `<AuthRedirect />` at top
- Add `<nav>` in hero with logo + "Войти" link
- Add "Как это работает" section with `StepCard` component
- Add footer with links to `/content`, `/legal/terms`, `/legal/privacy`

**Step 3: Verify**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: No build errors

**Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/_components/AuthRedirect.tsx
git commit -m "feat(seo): rework landing page — server component, metadata, JSON-LD, semantic HTML"
```

---

### Task 7: Fix auth page brand name

**Files:**
- Modify: `apps/web/src/app/auth/page.tsx`

**Step 1: Fix metadata**

Change the metadata export to:

```ts
export const metadata: Metadata = {
    title: 'Вход',
    description: 'Войдите в свой аккаунт или создайте новый',
    robots: { index: false, follow: false },
};
```

This fixes "Physical Life" → uses template `%s | BURCEV`, and adds noindex.

**Step 2: Commit**

```bash
git add apps/web/src/app/auth/page.tsx
git commit -m "fix(seo): fix auth page brand name Physical Life → BURCEV, add noindex"
```

---

### Task 8: Add sitemap.ts

**Files:**
- Create: `apps/web/src/app/sitemap.ts`

**Step 1: Create sitemap.ts**

```ts
import type { MetadataRoute } from 'next'

const SITE_URL = 'https://burcev.team'
const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: SITE_URL,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        {
            url: `${SITE_URL}/auth`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        {
            url: `${SITE_URL}/content`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        },
        {
            url: `${SITE_URL}/legal/terms`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${SITE_URL}/legal/privacy`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
    ]

    let articlePages: MetadataRoute.Sitemap = []
    try {
        const res = await fetch(`${API_URL}/api/v1/public/content?limit=1000`, {
            next: { revalidate: 3600 },
        })
        if (res.ok) {
            const data = await res.json()
            const articles = data?.data?.articles || []
            articlePages = articles.map(
                (article: { id: string; published_at?: string }) => ({
                    url: `${SITE_URL}/content/${article.id}`,
                    lastModified: article.published_at
                        ? new Date(article.published_at)
                        : new Date(),
                    changeFrequency: 'monthly' as const,
                    priority: 0.6,
                }),
            )
        }
    } catch {
        // Continue with static-only sitemap if API is unavailable
    }

    return [...staticPages, ...articlePages]
}
```

**Step 2: Verify**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: No build errors

**Step 3: Commit**

```bash
git add apps/web/src/app/sitemap.ts
git commit -m "feat(seo): add dynamic sitemap with public content articles"
```

---

### Task 9: Make content pages public with SEO metadata

**Files:**
- Modify: `apps/web/src/app/content/layout.tsx`
- Modify: `apps/web/src/app/content/page.tsx`
- Modify: `apps/web/src/app/content/[id]/page.tsx`
- Modify: `apps/web/src/features/content/api/contentApi.ts`

**Step 1: Update content layout for public access**

Replace `apps/web/src/app/content/layout.tsx` to conditionally render DashboardLayout only when authenticated:

```tsx
'use client'

import { useMemo } from 'react'
import { isAuthenticated } from '@/shared/utils/token-storage'
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'

export default function ContentLayout({ children }: { children: React.ReactNode }) {
    const isAuthed = useMemo(() => {
        if (typeof window === 'undefined') return false
        return isAuthenticated()
    }, [])

    const userName = useMemo(() => {
        if (typeof window === 'undefined') return ''
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}')
            return user.name || user.email || ''
        } catch { return '' }
    }, [])

    if (!isAuthed) {
        return <>{children}</>
    }

    return (
        <DashboardLayout userName={userName} activeNavItem="content">
            {children}
        </DashboardLayout>
    )
}
```

**Step 2: Add metadata to content feed page**

Replace `apps/web/src/app/content/page.tsx` — remove `'use client'`, add metadata:

```tsx
import type { Metadata } from 'next'
import { FeedList } from '@/features/content/components/FeedList'

export const metadata: Metadata = {
    title: 'Статьи о фитнесе и питании',
    description:
        'Полезные статьи о правильном питании, тренировках, рецептах и здоровом образе жизни от экспертов BURCEV.',
    openGraph: {
        title: 'Статьи о фитнесе и питании | BURCEV',
        description: 'Полезные статьи о правильном питании, тренировках и здоровом образе жизни.',
        url: 'https://burcev.team/content',
    },
    alternates: {
        canonical: 'https://burcev.team/content',
    },
}

export default function ContentFeedPage() {
    return (
        <div className="px-4 py-6 pb-20">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">Статьи</h1>
            <FeedList />
        </div>
    )
}
```

**Step 3: Add generateMetadata and JSON-LD to article page**

Replace `apps/web/src/app/content/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { JsonLd } from '@/shared/components/JsonLd'
import { ArticleView } from '@/features/content/components/ArticleView'

const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'

async function getPublicArticle(id: string) {
    try {
        const res = await fetch(`${API_URL}/api/v1/public/content/${id}`, {
            next: { revalidate: 3600 },
        })
        if (!res.ok) return null
        const data = await res.json()
        return data?.data || null
    } catch {
        return null
    }
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<Metadata> {
    const { id } = await params
    const article = await getPublicArticle(id)

    if (!article) {
        return { title: 'Статья не найдена' }
    }

    return {
        title: article.title,
        description: article.excerpt || `${article.title} — статья на BURCEV`,
        openGraph: {
            title: article.title,
            description: article.excerpt,
            url: `https://burcev.team/content/${id}`,
            type: 'article',
            publishedTime: article.published_at,
            ...(article.cover_image_url && {
                images: [{ url: article.cover_image_url }],
            }),
        },
        alternates: {
            canonical: `https://burcev.team/content/${id}`,
        },
    }
}

export default async function ArticlePage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const article = await getPublicArticle(id)

    const articleJsonLd = article
        ? {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: article.title,
              description: article.excerpt,
              datePublished: article.published_at,
              dateModified: article.updated_at,
              author: { '@type': 'Organization', name: 'BURCEV' },
              publisher: {
                  '@type': 'Organization',
                  name: 'BURCEV',
                  logo: { '@type': 'ImageObject', url: 'https://burcev.team/logo.svg' },
              },
              mainEntityOfPage: `https://burcev.team/content/${id}`,
              ...(article.cover_image_url && { image: article.cover_image_url }),
          }
        : null

    return (
        <>
            {articleJsonLd && <JsonLd data={articleJsonLd} />}
            <ArticleView articleId={id} />
        </>
    )
}
```

**Step 4: Add public API methods to contentApi.ts**

In `apps/web/src/features/content/api/contentApi.ts`, add after the existing `contentApi` export:

```ts
const PUBLIC_CONTENT_BASE = '/backend-api/v1/public/content'

export const publicContentApi = {
    getFeed: (category?: string, limit = 20, offset = 0) => {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
        if (category) params.set('category', category)
        return apiClient.get<FeedResponse>(`${PUBLIC_CONTENT_BASE}?${params}`)
    },

    getArticle: (id: string) =>
        apiClient.get<Article>(`${PUBLIC_CONTENT_BASE}/${id}`),
}
```

**Step 5: Verify**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: No build errors

**Step 6: Commit**

```bash
git add apps/web/src/app/content/ apps/web/src/features/content/api/contentApi.ts
git commit -m "feat(seo): make content pages public with metadata, generateMetadata, and JSON-LD"
```

---

### Task 10: Verify everything builds and tests pass

**Step 1: Run Go build and tests**

Run: `cd apps/api && go build ./... && go test ./... -count=1`
Expected: All pass

**Step 2: Run frontend build**

Run: `cd apps/web && npx next build`
Expected: Successful build

**Step 3: Run frontend tests**

Run: `cd apps/web && npx jest --passWithNoTests`
Expected: All pass

**Step 4: Run lint and type-check**

Run: `cd apps/web && npm run lint && npm run type-check`
Expected: No errors

**Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(seo): resolve build/lint issues from SEO implementation"
```

---

## Summary

| # | Task | Scope |
|---|---|---|
| 1 | robots.ts | Frontend |
| 2 | Public content API | Backend (Go) |
| 3 | Root layout metadata | Frontend |
| 4 | JsonLd component | Frontend |
| 5 | OG image generator | Frontend |
| 6 | Landing page rework | Frontend |
| 7 | Auth page brand fix | Frontend |
| 8 | sitemap.ts | Frontend |
| 9 | Public content pages | Frontend + API |
| 10 | Verification | Full stack |

**Dependencies:**
- Task 8 (sitemap) depends on Task 2 (public API)
- Task 9 (content pages) depends on Task 2 (public API) and Task 4 (JsonLd)
- Task 6 (landing) depends on Task 4 (JsonLd)
- Tasks 1, 3, 5, 7 are independent

**Recommended execution order:** 1 → 4 → 2 → 3 → 5 → 7 → 6 → 8 → 9 → 10
