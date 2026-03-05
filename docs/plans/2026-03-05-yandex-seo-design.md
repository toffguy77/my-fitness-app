# Yandex SEO Optimization — Design Document

**Date:** 2026-03-05
**Domain:** burcev.team
**Approach:** Maximum (technical SEO + structured data + content SEO)

## Scope

SEO optimization for Yandex targeting public pages of the BURCEV fitness app, plus opening `/content` for indexation.

## Current State

- No robots.txt/sitemap
- No Yandex.Webmaster verification
- No Open Graph tags
- No structured data (JSON-LD)
- No viewport export
- Minimal metadata (6 of ~35 pages)
- Auth page has old brand name "Physical Life"
- Yandex.Metrika is configured (ID 107159088)
- All auth protection is client-side only

## Design

### 1. Technical Infrastructure

**robots.ts** (`apps/web/src/app/robots.ts`):
- Allow: `/`, `/auth`, `/legal/`, `/content/`
- Disallow: `/dashboard`, `/food-tracker`, `/notifications`, `/profile`, `/settings`, `/chat`, `/curator`, `/admin`, `/onboarding`, `/forgot-password`, `/reset-password`, `/api/`
- Yandex-specific: `crawlDelay: 2`
- `host: 'https://burcev.team'` (Yandex directive)
- `sitemap: 'https://burcev.team/sitemap.xml'`

**sitemap.ts** (`apps/web/src/app/sitemap.ts`):
- Static: `/` (priority 1.0), `/auth` (0.5), `/legal/terms` (0.3), `/legal/privacy` (0.3), `/content` (0.8)
- Dynamic: `/content/[id]` from API (priority 0.6)

**Yandex.Webmaster verification**: via `metadata.verification.yandex` from env var `NEXT_PUBLIC_YANDEX_VERIFICATION`

**viewport export** in root layout:
- `width: 'device-width'`, `initialScale: 1`, `themeColor: '#000000'`

### 2. Metadata & Open Graph

**Root layout metadata**:
- `metadataBase: new URL('https://burcev.team')`
- `title: { default: 'BURCEV — Фитнес и питание', template: '%s | BURCEV' }`
- Full description with keywords
- `openGraph`: type website, locale ru_RU, 1200x630 image
- `alternates.canonical`
- `robots: { index: true, follow: true }`

**Per-page metadata**:
| Page | title | OG |
|---|---|---|
| `/` | BURCEV — Фитнес и питание | Yes |
| `/auth` | Вход (fix Physical Life) | No (noindex) |
| `/legal/*` | Keep existing | No |
| `/content` | Статьи о фитнесе и питании | Yes |
| `/content/[id]` | Dynamic (generateMetadata) | Yes |

### 3. Structured Data (JSON-LD)

- **Organization** — root layout
- **WebApplication** — landing page (applicationCategory: HealthApplication)
- **Article** — each `/content/[id]` page (dynamic)
- **BreadcrumbList** — content pages

Implemented via reusable `JsonLd` component in `shared/components/`.

### 4. Landing Page Rework

- Semantic HTML: `<main>`, `<section>`, `<nav>`, `<footer>`
- Single `<h1>` with primary keyword
- Sections: Hero + CTA, Features, How it works, Footer
- Internal linking: → `/content`, → `/auth`, → `/legal/*`
- Alt texts on all images

### 5. Content Pages — Public Access

- Remove AuthGuard from `/content` and `/content/[id]`
- Verify/fix Go API endpoint for unauthenticated access to content
- `generateMetadata` for dynamic title, description, OG per article
- BreadcrumbList JSON-LD

### 6. OG Image

Dynamic generation via `opengraph-image.tsx` (Next.js ImageResponse), 1200x630px.

## Files

**New:**
- `apps/web/src/app/robots.ts`
- `apps/web/src/app/sitemap.ts`
- `apps/web/src/shared/components/JsonLd.tsx`
- `apps/web/src/app/opengraph-image.tsx`

**Modified:**
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/auth/page.tsx`
- `apps/web/src/app/content/page.tsx`
- `apps/web/src/app/content/[id]/page.tsx`
- Possibly Go API content handler (if JWT required)
