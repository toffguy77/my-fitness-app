# Content Improvements Design

## Overview

Four improvements to content management: curator visibility, author name freshness, notification badge for content tab, and clickable content notifications.

## Changes

### 1. Curator sees all articles, edits only own

**Problem:** `ListArticles` filters by `author_id` for non-admins — curators see only their own articles.

**Solution:**
- **Backend** `service.go:ListArticles`: Remove `author_id` filter for all roles. All curators and admins see all articles (published + drafts).
- **Backend**: Add `is_own` boolean field to article response (`author_id == current_user_id`).
- **Frontend** `ArticleList.tsx`: Show edit/delete/publish buttons only when `article.is_own` or user is admin. Always show `author_name` in the list.
- Existing ownership checks in `UpdateArticle`, `DeleteArticle`, `PublishArticle` remain unchanged — backend protection already exists.

### 2. Author name shows stale data in feed

**Problem:** User changes profile name, but feed still shows old name until page refresh.

**Root cause:** Feed data is held in React component local state (`FeedList.tsx`). No mechanism to refetch when user navigates back to feed after profile changes. The backend already fetches author names via live JOIN — data is correct on re-fetch.

**Solution:**
- Add `Cache-Control: no-cache` on feed endpoints to prevent any browser caching.
- In `FeedList.tsx`, refetch articles when the component re-mounts (triggered on page navigation). Ensure `useEffect` dependencies cause refetch on navigation.
- The simplest fix: ensure the feed list refetches on every mount by not preserving stale state. Reset articles state on mount.

### 3. Badge on content notifications tab

**Problem:** Content tab badge may not show unread count.

**Root cause:** `fetchUnreadCounts()` in the notifications store may not complete before the badge renders, and failures are silently swallowed. The `NotificationsPage` already passes `unreadCounts` to `NotificationsTabs` correctly — the issue is in the store's initial fetch timing.

**Solution:**
- In `notificationsStore.ts`: Call `fetchUnreadCounts()` immediately on store initialization (not only after article fetch).
- Ensure `useNotifications` hook calls `fetchUnreadCounts()` in parallel with `fetchNotifications()`, not sequentially.
- The `NotificationsTabs` component already renders badges correctly when counts are available — no changes needed there.

### 4. Clickable content notifications

**Problem:** `NotificationItem` only marks as read on click, doesn't navigate. `NotificationDropdown` already has navigation via `router.push(notification.actionUrl)`.

**Solution:**
- In `NotificationItem.tsx`: Add `useRouter` and navigate to `notification.actionUrl` on click (if present), same pattern as `NotificationDropdown`.
- Mark as read AND navigate in one click action.

## Files to modify

**Backend:**
- `apps/api/internal/modules/content/service.go` — ListArticles: remove author_id filter, add is_own
- `apps/api/internal/modules/content/types.go` — Article struct: add IsOwn field

**Frontend:**
- `apps/web/src/features/content/components/ArticleList.tsx` — conditional edit buttons, show author
- `apps/web/src/features/content/components/FeedList.tsx` — ensure refetch on mount
- `apps/web/src/features/content/types/index.ts` — add is_own to Article type
- `apps/web/src/features/notifications/components/NotificationItem.tsx` — add navigation
- `apps/web/src/features/notifications/hooks/useNotifications.ts` — parallel unread count fetch
- `apps/web/src/features/notifications/store/notificationsStore.ts` — eager unread count fetch
