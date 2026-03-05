# Admin Content Tab Design

**Date:** 2026-03-05

## Overview

Add a "Контент" (Content) tab to the admin navigation with full article management functionality: list all articles from all authors, create new articles, edit/delete/publish any article.

## Approach

Reuse existing `features/content/` components (ArticleList, ArticleForm, ArticleEditor, etc.) and `contentApi.ts`. The backend already supports admin access to all articles (bypasses ownership checks for `super_admin` role). No new API endpoints needed.

## Navigation

Add 5th tab to `ADMIN_NAVIGATION_ITEMS`:
- id: `'content'`, label: `'Контент'`, icon: `FileText`, href: `'/admin/content'`
- Update `AdminNavigationItemId` type to include `'content'`

## Pages

### `/admin/content` — Article List
- Reuse `ArticleList` component with admin context
- Shows all articles from all authors with author name displayed
- Status filter (draft/scheduled/published)
- "Create article" button → `/admin/content/new`
- Edit/delete actions on each article

### `/admin/content/new` — Create Article
- Reuse `ArticleForm` + `ArticleEditor`
- Article created under admin's user ID

### `/admin/content/[id]/edit` — Edit Article
- Reuse `ArticleForm` + `ArticleEditor`
- Admin can edit any author's article (backend enforced)

## Files to Change

1. `apps/web/src/features/admin/types/index.ts` — add `'content'` to `AdminNavigationItemId`
2. `apps/web/src/features/admin/utils/adminNavigationConfig.ts` — add content nav item
3. `apps/web/src/app/admin/content/page.tsx` — **new** (article list)
4. `apps/web/src/app/admin/content/new/page.tsx` — **new** (create)
5. `apps/web/src/app/admin/content/[id]/edit/page.tsx` — **new** (edit)
6. `apps/web/src/features/content/components/ArticleList.tsx` — minor updates for admin context (show author name)

## API

No new endpoints. Existing `contentApi.ts` covers all operations. Backend `ListArticles` already returns all articles for `super_admin`.
