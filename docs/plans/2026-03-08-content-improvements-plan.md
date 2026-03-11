# Content Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Four content management improvements — curator visibility, fresh author names, notification badge, clickable notifications.

**Architecture:** Backend changes to article listing (remove author filter, add `is_own` field). Frontend changes to conditionally show edit controls, add navigation to notification items, and ensure unread counts load eagerly.

**Tech Stack:** Go/Gin backend, Next.js/React frontend, Zustand store, TypeScript

---

### Task 1: Backend — Curator sees all articles with `is_own` flag

**Files:**
- Modify: `apps/api/internal/modules/content/types.go:32-47`
- Modify: `apps/api/internal/modules/content/service.go:292-360`

**Step 1: Add `IsOwn` field to Article struct**

In `types.go`, add `IsOwn` to the `Article` struct:

```go
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
	IsOwn         bool       `json:"is_own"`
	ScheduledAt   *time.Time `json:"scheduled_at,omitempty"`
	PublishedAt   *time.Time `json:"published_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}
```

**Step 2: Remove author_id filter from ListArticles, set IsOwn**

In `service.go`, modify `ListArticles` — remove the `WHERE a.author_id = $id` branch for non-admins, and set `IsOwn` after scanning:

```go
func (s *Service) ListArticles(ctx context.Context, authorID int64, status string, category string, isAdmin bool) (*ArticlesListResponse, error) {
	startTime := time.Now()

	query := `
		SELECT a.id, a.author_id, COALESCE(u.name, '') AS author_name,
		       a.title, a.excerpt, COALESCE(a.cover_image_url, ''), a.category, a.status, a.audience_scope,
		       a.scheduled_at, a.published_at, a.created_at, a.updated_at
		FROM articles a
		JOIN users u ON u.id = a.author_id
		WHERE 1=1
	`
	args := []any{}
	argIdx := 1

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
	// ... existing scan loop ...
	// After scanning each article, add:
	// a.IsOwn = a.AuthorID == authorID
```

The key changes:
1. Remove the `if isAdmin { ... } else { ... }` block — always use `WHERE 1=1`
2. After `rows.Scan(...)`, add `a.IsOwn = a.AuthorID == authorID`

**Step 3: Run backend tests**

Run: `cd apps/api && go test ./internal/modules/content/ -v`

**Step 4: Commit**

```bash
git add apps/api/internal/modules/content/types.go apps/api/internal/modules/content/service.go
git commit -m "feat(content): allow all curators to see all articles, add is_own flag"
```

---

### Task 2: Frontend — Add `is_own` to types, conditional edit buttons

**Files:**
- Modify: `apps/web/src/features/content/types/index.ts:7-22`
- Modify: `apps/web/src/features/content/components/ArticleList.tsx:152-206`

**Step 1: Add `is_own` to Article type**

In `types/index.ts`, add to `Article` interface:

```typescript
export interface Article {
  // ... existing fields ...
  is_own: boolean
  // ...
}
```

**Step 2: Update ArticleList to conditionally show actions**

In `ArticleList.tsx`, change the actions section (lines 180-205). Show edit/delete/publish only when `article.is_own`. Always show `author_name`:

```tsx
{/* Always show author name */}
<div className="flex items-center gap-2 text-xs text-gray-500">
    {article.author_name && (
        <>
            <span>{article.author_name}</span>
            <span>&middot;</span>
        </>
    )}
    <span>{CATEGORY_LABELS[article.category]}</span>
    <span>&middot;</span>
    <span>
        {formatDate(article.published_at ?? article.created_at)}
    </span>
</div>

{/* Actions only for own articles */}
{article.is_own && (
    <div className="flex items-center gap-2 pt-1">
        <Link
            href={`${basePath}/${article.id}/edit`}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
        >
            Редактировать
        </Link>

        {article.status === 'draft' && (
            <button
                type="button"
                onClick={() => handlePublish(article.id)}
                className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200 transition-colors"
            >
                Опубликовать
            </button>
        )}

        <button
            type="button"
            onClick={() => handleDelete(article.id)}
            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
        >
            Удалить
        </button>
    </div>
)}
```

Also update the empty state message since curators now see all articles:
```tsx
<p className="text-sm text-gray-500">Статей пока нет</p>
```

**Step 3: Run frontend lint and type-check**

Run: `cd apps/web && npm run type-check && npm run lint`

**Step 4: Commit**

```bash
git add apps/web/src/features/content/types/index.ts apps/web/src/features/content/components/ArticleList.tsx
git commit -m "feat(content): show all articles to curators, restrict editing to own"
```

---

### Task 3: Fix stale author name in feed

**Files:**
- Modify: `apps/web/src/features/content/components/FeedList.tsx:12-50`

**Step 1: Reset articles on mount to prevent showing stale data**

The `FeedList` component already fetches on mount via `useEffect`. The issue is that when the component unmounts and remounts (navigation), React may preserve stale state. Fix by resetting state at the start of the fetch effect:

In `FeedList.tsx`, the `useEffect` already sets `setLoading(true)` and resets on category change. The real issue is that articles from a previous mount are visible briefly. Add explicit reset:

```tsx
useEffect(() => {
    let cancelled = false
    setArticles([])  // Clear stale data immediately
    setLoading(true)
    setError(null)

    fetchArticles(category)
        .then((res) => {
            if (!cancelled) {
                setArticles(res.articles)
                setTotal(res.total)
            }
        })
        // ... rest stays the same
```

**Step 2: Run type-check**

Run: `cd apps/web && npm run type-check`

**Step 3: Commit**

```bash
git add apps/web/src/features/content/components/FeedList.tsx
git commit -m "fix(content): clear stale feed data on mount to show fresh author names"
```

---

### Task 4: Notification content tab badge — eager fetch

**Files:**
- Modify: `apps/web/src/features/notifications/hooks/useNotifications.ts:40-43`

**Step 1: Fetch unread counts in parallel with notifications**

In `useNotifications.ts`, add a parallel call to `fetchUnreadCounts` alongside `fetchNotifications`:

```typescript
export function useNotifications(category: NotificationCategory): UseNotificationsReturn {
    // Select state from store
    const notifications = useNotificationsStore((state) => state.notifications[category]);
    const unreadCount = useNotificationsStore((state) => state.unreadCounts[category]);
    const isLoading = useNotificationsStore((state) => state.isLoading);
    const error = useNotificationsStore((state) => state.error);
    const hasMore = useNotificationsStore((state) => state.hasMore[category]);

    // Select actions from store
    const fetchNotifications = useNotificationsStore((state) => state.fetchNotifications);
    const fetchUnreadCounts = useNotificationsStore((state) => state.fetchUnreadCounts);
    const markAsReadAction = useNotificationsStore((state) => state.markAsRead);

    // Fetch initial data and unread counts on mount
    useEffect(() => {
        fetchNotifications(category, 0);
        fetchUnreadCounts();
    }, [category, fetchNotifications, fetchUnreadCounts]);

    // ... rest stays the same
```

This ensures unread counts are fetched immediately on mount, not just after `pollForUpdates` completes inside `fetchNotifications`.

**Step 2: Run type-check**

Run: `cd apps/web && npm run type-check`

**Step 3: Commit**

```bash
git add apps/web/src/features/notifications/hooks/useNotifications.ts
git commit -m "fix(notifications): fetch unread counts eagerly on mount for badge display"
```

---

### Task 5: Make content notifications clickable

**Files:**
- Modify: `apps/web/src/features/notifications/components/NotificationItem.tsx:1-162`

**Step 1: Add navigation to NotificationItem**

Add `useRouter` from Next.js and navigate to `actionUrl` on click, matching the pattern from `NotificationDropdown`:

```typescript
import { useRouter } from 'next/navigation';

// Inside the component:
export function NotificationItem({
    notification,
    onMarkAsRead,
}: NotificationItemProps) {
    const router = useRouter();
    const isUnread = !notification.readAt;

    const handleClick = () => {
        if (isUnread) {
            onMarkAsRead(notification.id);
        }
        if (notification.actionUrl) {
            router.push(notification.actionUrl);
        }
    };

    // ... rest of component stays the same
```

**Step 2: Add visual affordance for clickable notifications**

Update the notification title to look like a link when `actionUrl` exists. In the title `<h3>`:

```tsx
<h3
    className={cn(
        'mb-1',
        'text-sm',
        'sm:text-base',
        'md:text-base',
        isUnread ? 'font-semibold text-gray-900' : 'font-normal text-gray-700',
        notification.actionUrl && 'group-hover:text-blue-600'
    )}
>
    {notification.title}
</h3>
```

And add `group` class to the parent `<div>`:
```tsx
className={cn(
    'group flex gap-3 rounded-lg transition-colors',
    // ... rest stays same
```

**Step 3: Run type-check and lint**

Run: `cd apps/web && npm run type-check && npm run lint`

**Step 4: Commit**

```bash
git add apps/web/src/features/notifications/components/NotificationItem.tsx
git commit -m "feat(notifications): make content notifications clickable with navigation"
```

---

### Task 6: Verify all changes together

**Step 1: Run full frontend checks**

Run: `cd apps/web && npm run type-check && npm run lint`

**Step 2: Run frontend tests**

Run: `cd apps/web && npx jest --passWithNoTests`

**Step 3: Run backend tests**

Run: `cd apps/api && go test ./internal/modules/content/ -v`

**Step 4: Final commit if any fixes needed**

```bash
git commit -m "fix: address lint/test issues from content improvements"
```
