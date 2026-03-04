# Content Notification Subscriptions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Users receive real-time notifications when curators publish content, with per-category subscription settings and a bell dropdown.

**Architecture:** Opt-out subscription model (stored unsubscribes). Content publish triggers notification creation for subscribed users. WebSocket delivers real-time updates. Bell icon opens dropdown with clickable notifications.

**Tech Stack:** Go/Gin + PostgreSQL (backend), Next.js + Zustand + WebSocket (frontend), TDD throughout.

**Design doc:** `docs/plans/2026-03-04-content-notifications-design.md`

---

## Task 1: Database Migration — New Tables and Schema Changes

**Files:**
- Create: `apps/api/migrations/033_content_notification_preferences_up.sql`
- Create: `apps/api/migrations/033_content_notification_preferences_down.sql`

**Step 1: Write the up migration**

```sql
-- Content notification preferences (opt-out model: record = unsubscribed)
CREATE TABLE content_notification_preferences (
    user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
    category   content_category NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, category)
);

-- Content notification mute (global "do not disturb")
CREATE TABLE content_notification_mute (
    user_id  BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    muted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add action_url and content_category to notifications
ALTER TABLE notifications ADD COLUMN action_url VARCHAR(500);
ALTER TABLE notifications ADD COLUMN content_category VARCHAR(20);

-- Expand the type CHECK constraint to include 'new_content'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('trainer_feedback', 'achievement', 'reminder', 'system_update', 'new_feature', 'general', 'new_content'));
```

**Step 2: Write the down migration**

```sql
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('trainer_feedback', 'achievement', 'reminder', 'system_update', 'new_feature', 'general'));

ALTER TABLE notifications DROP COLUMN IF EXISTS content_category;
ALTER TABLE notifications DROP COLUMN IF EXISTS action_url;

DROP TABLE IF EXISTS content_notification_mute;
DROP TABLE IF EXISTS content_notification_preferences;
```

**Step 3: Run migration**

```bash
cd apps/api && go run cmd/server/main.go migrate
```

Expected: migration 033 applied successfully.

**Step 4: Commit**

```bash
git add apps/api/migrations/033_*
git commit -m "feat: add content notification preferences tables and notification schema changes"
```

---

## Task 2: Backend Types — Notification Preferences

**Files:**
- Modify: `apps/api/internal/modules/notifications/types.go` (add `TypeNewContent`, expand `Notification` struct, add preference types)

**Step 1: Add new notification type constant**

In `apps/api/internal/modules/notifications/types.go`, after `TypeGeneral` (line ~35), add:

```go
TypeNewContent NotificationType = "new_content"
```

**Step 2: Expand Notification struct**

In the `Notification` struct (lines 47–57), add two fields after `ReadAt`:

```go
ActionURL       *string  `json:"action_url,omitempty" db:"action_url"`
ContentCategory *string  `json:"content_category,omitempty" db:"content_category"`
```

**Step 3: Add preference types**

At the end of the file, add:

```go
// ContentNotificationPreferences represents a user's content notification settings
type ContentNotificationPreferences struct {
	MutedCategories []string `json:"muted_categories"`
	Muted           bool     `json:"muted"`
}

// UpdatePreferencesRequest is the request body for updating notification preferences
type UpdatePreferencesRequest struct {
	MutedCategories []string `json:"muted_categories"`
	Muted           bool     `json:"muted"`
}
```

**Step 4: Commit**

```bash
git add apps/api/internal/modules/notifications/types.go
git commit -m "feat: add new_content notification type and preference types"
```

---

## Task 3: Backend Service — Notification Preferences CRUD

**Files:**
- Create: `apps/api/internal/modules/notifications/preferences_test.go`
- Create: `apps/api/internal/modules/notifications/preferences.go`

**Step 1: Write failing tests**

Create `apps/api/internal/modules/notifications/preferences_test.go`:

```go
package notifications

import (
	"context"
	"testing"
)

func TestGetPreferences_DefaultAllSubscribed(t *testing.T) {
	// New user should have empty muted_categories and muted=false
	db := setupTestDB(t)
	svc := NewService(db, testLogger())

	prefs, err := svc.GetPreferences(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prefs.MutedCategories) != 0 {
		t.Errorf("expected empty muted_categories, got %v", prefs.MutedCategories)
	}
	if prefs.Muted {
		t.Error("expected muted=false")
	}
}

func TestUpdatePreferences_MuteCategories(t *testing.T) {
	db := setupTestDB(t)
	svc := NewService(db, testLogger())

	err := svc.UpdatePreferences(context.Background(), testUserID, UpdatePreferencesRequest{
		MutedCategories: []string{"training", "recipes"},
		Muted:           false,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	prefs, err := svc.GetPreferences(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prefs.MutedCategories) != 2 {
		t.Errorf("expected 2 muted categories, got %d", len(prefs.MutedCategories))
	}
}

func TestUpdatePreferences_Mute(t *testing.T) {
	db := setupTestDB(t)
	svc := NewService(db, testLogger())

	err := svc.UpdatePreferences(context.Background(), testUserID, UpdatePreferencesRequest{
		MutedCategories: []string{},
		Muted:           true,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	prefs, err := svc.GetPreferences(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !prefs.Muted {
		t.Error("expected muted=true")
	}
}
```

**Step 2: Run tests to verify they fail**

```bash
cd apps/api && go test ./internal/modules/notifications/ -run TestGetPreferences -v
cd apps/api && go test ./internal/modules/notifications/ -run TestUpdatePreferences -v
```

Expected: compilation error — `GetPreferences` and `UpdatePreferences` not defined.

**Step 3: Implement preferences service**

Create `apps/api/internal/modules/notifications/preferences.go`:

```go
package notifications

import (
	"context"
	"fmt"
	"time"
)

// GetPreferences returns the user's content notification preferences
func (s *Service) GetPreferences(ctx context.Context, userID int64) (*ContentNotificationPreferences, error) {
	startTime := time.Now()

	// Get muted categories
	rows, err := s.db.QueryContext(ctx,
		`SELECT category FROM content_notification_preferences WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get preferences: %w", err)
	}
	defer rows.Close()

	var categories []string
	for rows.Next() {
		var cat string
		if err := rows.Scan(&cat); err != nil {
			return nil, fmt.Errorf("failed to scan category: %w", err)
		}
		categories = append(categories, cat)
	}

	// Check mute status
	var muteExists bool
	err = s.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM content_notification_mute WHERE user_id = $1)`,
		userID,
	).Scan(&muteExists)
	if err != nil {
		return nil, fmt.Errorf("failed to check mute status: %w", err)
	}

	s.log.LogDatabaseQuery("GetPreferences", time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
	})

	return &ContentNotificationPreferences{
		MutedCategories: categories,
		Muted:           muteExists,
	}, nil
}

// UpdatePreferences updates the user's content notification preferences
func (s *Service) UpdatePreferences(ctx context.Context, userID int64, req UpdatePreferencesRequest) error {
	startTime := time.Now()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Replace muted categories: delete all, insert new
	_, err = tx.ExecContext(ctx,
		`DELETE FROM content_notification_preferences WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("failed to clear preferences: %w", err)
	}

	for _, cat := range req.MutedCategories {
		_, err = tx.ExecContext(ctx,
			`INSERT INTO content_notification_preferences (user_id, category) VALUES ($1, $2)`,
			userID, cat,
		)
		if err != nil {
			return fmt.Errorf("failed to insert preference: %w", err)
		}
	}

	// Handle mute toggle
	if req.Muted {
		_, err = tx.ExecContext(ctx,
			`INSERT INTO content_notification_mute (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
			userID,
		)
	} else {
		_, err = tx.ExecContext(ctx,
			`DELETE FROM content_notification_mute WHERE user_id = $1`,
			userID,
		)
	}
	if err != nil {
		return fmt.Errorf("failed to update mute status: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	s.log.LogDatabaseQuery("UpdatePreferences", time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
	})

	return nil
}
```

**Step 4: Run tests to verify they pass**

```bash
cd apps/api && go test ./internal/modules/notifications/ -run TestGetPreferences -v
cd apps/api && go test ./internal/modules/notifications/ -run TestUpdatePreferences -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/internal/modules/notifications/preferences.go apps/api/internal/modules/notifications/preferences_test.go
git commit -m "feat: add notification preferences service with tests"
```

---

## Task 4: Backend Handler — Preferences API Endpoints

**Files:**
- Modify: `apps/api/internal/modules/notifications/handler.go` (add to ServiceInterface, add handler methods)
- Modify: `apps/api/cmd/server/main.go` (register routes)

**Step 1: Add methods to ServiceInterface**

In `handler.go` (lines 16–22), add to `ServiceInterface`:

```go
GetPreferences(ctx context.Context, userID int64) (*ContentNotificationPreferences, error)
UpdatePreferences(ctx context.Context, userID int64, req UpdatePreferencesRequest) error
```

**Step 2: Add GetPreferences handler**

```go
// GetPreferences handles GET /api/v1/notifications/preferences
func (h *Handler) GetPreferences(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Error(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	userID := userIDInterface.(int64)

	prefs, err := h.service.GetPreferences(c.Request.Context(), userID)
	if err != nil {
		h.log.Error("Failed to get preferences", "error", err)
		response.Error(c, http.StatusInternalServerError, "failed to get preferences")
		return
	}

	response.Success(c, prefs)
}
```

**Step 3: Add UpdatePreferences handler**

```go
// UpdatePreferences handles PUT /api/v1/notifications/preferences
func (h *Handler) UpdatePreferences(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Error(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	userID := userIDInterface.(int64)

	var req UpdatePreferencesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.service.UpdatePreferences(c.Request.Context(), userID, req); err != nil {
		h.log.Error("Failed to update preferences", "error", err)
		response.Error(c, http.StatusInternalServerError, "failed to update preferences")
		return
	}

	response.Success(c, map[string]string{"status": "ok"})
}
```

**Step 4: Register routes in main.go**

In `apps/api/cmd/server/main.go`, inside the notifications group (after line 285), add:

```go
notificationsGroup.GET("/preferences", notificationsHandler.GetPreferences)
notificationsGroup.PUT("/preferences", notificationsHandler.UpdatePreferences)
```

**Step 5: Run backend tests**

```bash
cd apps/api && go test ./internal/modules/notifications/ -v
```

Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/internal/modules/notifications/handler.go apps/api/cmd/server/main.go
git commit -m "feat: add notification preferences API endpoints"
```

---

## Task 5: Backend — Notification Creation on Article Publish

**Files:**
- Modify: `apps/api/internal/modules/content/service.go` (inject notification service, add notification logic to PublishArticle and PublishScheduledArticles)
- Modify: `apps/api/internal/modules/content/types.go` (add content category constants)
- Modify: `apps/api/cmd/server/main.go` (wire notification service into content service)

**Step 1: Add content category constants to content/types.go**

At the top of `apps/api/internal/modules/content/types.go`, add:

```go
// Content categories — single source of truth (matches content_category PostgreSQL enum)
var ValidCategories = []string{"nutrition", "training", "recipes", "health", "motivation", "general"}
```

**Step 2: Add notification service dependency to content Service**

In `apps/api/internal/modules/content/service.go`, modify the Service struct (line 42):

```go
type Service struct {
	db          *database.DB
	log         *logger.Logger
	s3          *storage.S3Client
	notifSvc    NotificationCreator
}
```

Add the interface above the struct:

```go
// NotificationCreator is the subset of notification service needed by content
type NotificationCreator interface {
	CreateNotification(ctx context.Context, notification interface{}) error
}
```

Note: We'll use a concrete approach instead — import the notifications package and pass the service. Update `NewService` (line 49):

```go
func NewService(db *database.DB, log *logger.Logger, s3 *storage.S3Client) *Service {
```

Since the content service already has `db` access, it can directly insert notifications and query preferences without importing the notifications package. This avoids circular dependencies.

**Step 3: Add helper method to create content notifications**

Add to `apps/api/internal/modules/content/service.go`:

```go
// createContentNotifications creates notifications for eligible users when an article is published
func (s *Service) createContentNotifications(ctx context.Context, articleID string) error {
	// Get the article details
	var title, excerpt, category, audienceScope string
	var authorID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT title, COALESCE(excerpt, ''), category, audience_scope, author_id FROM articles WHERE id = $1`,
		articleID,
	).Scan(&title, &excerpt, &category, &audienceScope, &authorID)
	if err != nil {
		return fmt.Errorf("failed to get article for notification: %w", err)
	}

	// Build audience query based on scope
	var audienceQuery string
	var args []interface{}

	switch audienceScope {
	case "all":
		// All users except the author, minus muted/unsubscribed
		audienceQuery = `
			SELECT u.id FROM users u
			WHERE u.id != $1
			  AND u.role = 'client'
			  AND NOT EXISTS (SELECT 1 FROM content_notification_mute m WHERE m.user_id = u.id)
			  AND NOT EXISTS (SELECT 1 FROM content_notification_preferences p WHERE p.user_id = u.id AND p.category = $2::content_category)`
		args = []interface{}{authorID, category}
	case "my_clients":
		// Clients assigned to this curator
		audienceQuery = `
			SELECT u.id FROM users u
			JOIN user_curator_assignments uca ON uca.user_id = u.id
			WHERE uca.curator_id = $1
			  AND NOT EXISTS (SELECT 1 FROM content_notification_mute m WHERE m.user_id = u.id)
			  AND NOT EXISTS (SELECT 1 FROM content_notification_preferences p WHERE p.user_id = u.id AND p.category = $2::content_category)`
		args = []interface{}{authorID, category}
	case "selected":
		// Specific audience from article_audience table
		audienceQuery = `
			SELECT aa.client_id FROM article_audience aa
			WHERE aa.article_id = $1
			  AND NOT EXISTS (SELECT 1 FROM content_notification_mute m WHERE m.user_id = aa.client_id)
			  AND NOT EXISTS (SELECT 1 FROM content_notification_preferences p WHERE p.user_id = aa.client_id AND p.category = $2::content_category)`
		args = []interface{}{articleID, category}
	default:
		return nil
	}

	rows, err := s.db.QueryContext(ctx, audienceQuery, args...)
	if err != nil {
		return fmt.Errorf("failed to query audience: %w", err)
	}
	defer rows.Close()

	var userIDs []int64
	for rows.Next() {
		var uid int64
		if err := rows.Scan(&uid); err != nil {
			return fmt.Errorf("failed to scan user_id: %w", err)
		}
		userIDs = append(userIDs, uid)
	}

	if len(userIDs) == 0 {
		return nil
	}

	// Batch insert notifications
	actionURL := fmt.Sprintf("/content/%s", articleID)
	for _, uid := range userIDs {
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO notifications (user_id, category, type, title, content, action_url, content_category)
			 VALUES ($1, 'content', 'new_content', $2, $3, $4, $5)`,
			uid, title, excerpt, actionURL, category,
		)
		if err != nil {
			s.log.Error("Failed to create content notification", "error", err, "user_id", uid, "article_id", articleID)
			// Continue creating for other users
		}
	}

	s.log.Info("Created content notifications", "article_id", articleID, "user_count", len(userIDs))
	return nil
}
```

**Step 4: Call from PublishArticle**

In `PublishArticle` (line 522, before `return nil`), add:

```go
// Create notifications for subscribed users
if err := s.createContentNotifications(ctx, articleID); err != nil {
	s.log.Error("Failed to create content notifications", "error", err, "article_id", articleID)
	// Don't fail the publish — notifications are best-effort
}
```

**Step 5: Update PublishScheduledArticles to return published article IDs**

Modify `PublishScheduledArticles` to query and notify for each published article:

```go
func (s *Service) PublishScheduledArticles(ctx context.Context) error {
	startTime := time.Now()

	// Get IDs of articles being published (needed for notifications)
	rows, err := s.db.QueryContext(ctx,
		`UPDATE articles
		 SET status = 'published', published_at = NOW(), updated_at = NOW()
		 WHERE status = 'scheduled' AND scheduled_at <= NOW()
		 RETURNING id`,
	)
	if err != nil {
		s.log.Error("Failed to publish scheduled articles", "error", err)
		return fmt.Errorf("failed to publish scheduled articles: %w", err)
	}
	defer rows.Close()

	var publishedIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			s.log.Error("Failed to scan published article id", "error", err)
			continue
		}
		publishedIDs = append(publishedIDs, id)
	}

	if len(publishedIDs) > 0 {
		s.log.Info("Published scheduled articles", "count", len(publishedIDs))
		for _, id := range publishedIDs {
			if err := s.createContentNotifications(ctx, id); err != nil {
				s.log.Error("Failed to create notifications for scheduled article", "error", err, "article_id", id)
			}
		}
	}

	s.log.LogDatabaseQuery("PublishScheduledArticles", time.Since(startTime), nil, map[string]interface{}{
		"published_count": len(publishedIDs),
	})

	return nil
}
```

**Step 6: Run tests**

```bash
cd apps/api && go test ./internal/modules/content/ -v
cd apps/api && go test ./... -v
```

Expected: PASS (existing tests should still pass; `createContentNotifications` queries won't fail if tables exist)

**Step 7: Commit**

```bash
git add apps/api/internal/modules/content/service.go apps/api/internal/modules/content/types.go
git commit -m "feat: create notifications when articles are published"
```

---

## Task 6: Backend — WebSocket Event for Content Notifications

**Files:**
- Modify: `apps/api/internal/shared/ws/types.go` (add event constant)
- Modify: `apps/api/internal/modules/content/service.go` (inject hub, send WS events)
- Modify: `apps/api/cmd/server/main.go` (pass hub to content service)

**Step 1: Add WS event constant**

In `apps/api/internal/shared/ws/types.go` (line ~10), add:

```go
EventContentNotification = "content_notification"
```

**Step 2: Add hub dependency to content Service**

In `apps/api/internal/modules/content/service.go`, add import for `ws` package and modify struct:

```go
import "github.com/burcev/api/internal/shared/ws"
```

```go
type Service struct {
	db       *database.DB
	log      *logger.Logger
	s3       *storage.S3Client
	wsHub    *ws.Hub
}
```

Update `NewService`:

```go
func NewService(db *database.DB, log *logger.Logger, s3 *storage.S3Client, wsHub ...*ws.Hub) *Service {
	svc := &Service{db: db, log: log, s3: s3}
	if len(wsHub) > 0 {
		svc.wsHub = wsHub[0]
	}
	return svc
}
```

Using variadic to keep backward compatibility with existing callers.

**Step 3: Send WS events after notification creation**

In `createContentNotifications`, after the batch insert loop, add:

```go
// Send real-time WebSocket notifications
if s.wsHub != nil {
	for _, uid := range userIDs {
		s.wsHub.SendToUser(uid, ws.OutgoingEvent{
			Type: ws.EventContentNotification,
			Data: map[string]interface{}{
				"notification": map[string]interface{}{
					"title":      title,
					"action_url": actionURL,
					"category":   category,
				},
			},
		})
	}
}
```

**Step 4: Wire hub in main.go**

In `apps/api/cmd/server/main.go`, find where `contentService` is created (line 426) and pass the hub:

```go
contentService := content.NewService(db, log, contentS3, wsHub)
```

Note: `wsHub` is already created earlier in main.go for the chat handler. Find where it's created and reference the same instance.

**Step 5: Run tests**

```bash
cd apps/api && go test ./... -v
```

Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/internal/shared/ws/types.go apps/api/internal/modules/content/service.go apps/api/cmd/server/main.go
git commit -m "feat: send WebSocket events for content notifications"
```

---

## Task 7: Frontend Types — Notification Updates

**Files:**
- Modify: `apps/web/src/features/notifications/types/index.ts` (add `new_content` type, `action_url`, `content_category`, preference types)

**Step 1: Update NotificationType**

In `apps/web/src/features/notifications/types/index.ts` (line ~19), add `'new_content'` to the union:

```ts
export type NotificationType =
    | 'trainer_feedback'
    | 'achievement'
    | 'reminder'
    | 'system_update'
    | 'new_feature'
    | 'general'
    | 'new_content';
```

**Step 2: Update Notification interface**

Add to the `Notification` interface (after `readAt`, line ~34):

```ts
actionUrl?: string;
contentCategory?: string;
```

**Step 3: Add preference types**

At the end of the file, add:

```ts
export interface ContentNotificationPreferences {
    muted_categories: string[];
    muted: boolean;
}

export interface UpdatePreferencesRequest {
    muted_categories: string[];
    muted: boolean;
}
```

**Step 4: Commit**

```bash
git add apps/web/src/features/notifications/types/index.ts
git commit -m "feat: add content notification types and preferences"
```

---

## Task 8: Frontend — Notification Preferences API

**Files:**
- Create: `apps/web/src/features/notifications/api/preferencesApi.ts`

**Step 1: Create preferences API**

```ts
import { getApiUrl, apiClient } from '@/shared/utils/api'
import type { ContentNotificationPreferences, UpdatePreferencesRequest } from '../types'

export async function getNotificationPreferences(): Promise<ContentNotificationPreferences> {
    const response = await apiClient.get(getApiUrl('/notifications/preferences'))
    return response.data
}

export async function updateNotificationPreferences(req: UpdatePreferencesRequest): Promise<void> {
    await apiClient.put(getApiUrl('/notifications/preferences'), req)
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/notifications/api/preferencesApi.ts
git commit -m "feat: add notification preferences API client"
```

---

## Task 9: Frontend — Settings Notifications Page

**Files:**
- Create: `apps/web/src/features/settings/components/SettingsNotifications.tsx`
- Create: `apps/web/src/app/settings/notifications/page.tsx`
- Modify: `apps/web/src/app/profile/page.tsx` (add navigation link)

**Step 1: Create SettingsNotifications component**

Create `apps/web/src/features/settings/components/SettingsNotifications.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { CATEGORY_LABELS, type ContentCategory } from '@/features/content/types'
import { getNotificationPreferences, updateNotificationPreferences } from '@/features/notifications/api/preferencesApi'
import { toast } from 'sonner'

export function SettingsNotifications() {
    const [mutedCategories, setMutedCategories] = useState<Set<string>>(new Set())
    const [muted, setMuted] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        getNotificationPreferences()
            .then((prefs) => {
                setMutedCategories(new Set(prefs.muted_categories))
                setMuted(prefs.muted)
            })
            .catch(() => toast.error('Не удалось загрузить настройки'))
            .finally(() => setIsLoading(false))
    }, [])

    const save = useCallback(async (newMuted: boolean, newMutedCategories: Set<string>) => {
        try {
            await updateNotificationPreferences({
                muted_categories: Array.from(newMutedCategories),
                muted: newMuted,
            })
        } catch {
            toast.error('Не удалось сохранить настройки')
        }
    }, [])

    const toggleCategory = (cat: string) => {
        const next = new Set(mutedCategories)
        if (next.has(cat)) {
            next.delete(cat)
        } else {
            next.add(cat)
        }
        setMutedCategories(next)
        save(muted, next)
    }

    const toggleMute = () => {
        const next = !muted
        setMuted(next)
        save(next, mutedCategories)
    }

    if (isLoading) {
        return <div className="animate-pulse h-48 bg-gray-100 rounded-2xl" />
    }

    const categories = Object.entries(CATEGORY_LABELS) as [ContentCategory, string][]

    return (
        <div className="space-y-6">
            {/* Do Not Disturb */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-gray-900">Не беспокоить</p>
                        <p className="text-sm text-gray-500">Отключить все уведомления о контенте</p>
                    </div>
                    <button
                        onClick={toggleMute}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${muted ? 'bg-red-500' : 'bg-gray-200'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${muted ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>

            {/* Category toggles */}
            <div className="bg-white rounded-2xl shadow-sm divide-y">
                <div className="p-4">
                    <p className="font-medium text-gray-900">Категории контента</p>
                </div>
                {categories.map(([key, label]) => (
                    <div key={key} className={`flex items-center justify-between p-4 ${muted ? 'opacity-50' : ''}`}>
                        <p className="text-gray-700">{label}</p>
                        <button
                            onClick={() => toggleCategory(key)}
                            disabled={muted}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                !mutedCategories.has(key) ? 'bg-green-500' : 'bg-gray-200'
                            } ${muted ? 'cursor-not-allowed' : ''}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                !mutedCategories.has(key) ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}
```

**Step 2: Create settings/notifications page**

Create `apps/web/src/app/settings/notifications/page.tsx`:

```tsx
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout'
import { SettingsNotifications } from '@/features/settings/components/SettingsNotifications'

export default function SettingsNotificationsPage() {
    return (
        <SettingsPageLayout title="Уведомления">
            {() => <SettingsNotifications />}
        </SettingsPageLayout>
    )
}
```

**Step 3: Add navigation link in profile page**

In `apps/web/src/app/profile/page.tsx` (lines 13–17), add to `menuItems`:

```ts
{ label: 'Уведомления', href: '/settings/notifications' },
```

**Step 4: Run type check**

```bash
cd apps/web && npm run type-check
```

Expected: no errors

**Step 5: Commit**

```bash
git add apps/web/src/features/settings/components/SettingsNotifications.tsx apps/web/src/app/settings/notifications/page.tsx apps/web/src/app/profile/page.tsx
git commit -m "feat: add notification settings page with category toggles"
```

---

## Task 10: Frontend — WebSocket Notification Handler

**Files:**
- Create: `apps/web/src/features/notifications/hooks/useContentNotificationWS.ts`
- Modify: `apps/web/src/features/dashboard/components/DashboardLayout.tsx` (use the hook)

**Step 1: Create the hook**

Create `apps/web/src/features/notifications/hooks/useContentNotificationWS.ts`:

```tsx
import { useEffect } from 'react'
import { useWebSocketContext } from '@/features/chat/components/WebSocketProvider'
import { useNotificationsStore } from '../store/notificationsStore'

export function useContentNotificationWS() {
    const ws = useWebSocketContext()
    const fetchUnreadCounts = useNotificationsStore((s) => s.fetchUnreadCounts)

    useEffect(() => {
        if (!ws?.lastEvent) return
        if (ws.lastEvent.type !== 'content_notification') return

        // Refresh unread counts when we get a content notification via WS
        fetchUnreadCounts()
    }, [ws?.lastEvent, fetchUnreadCounts])
}
```

**Step 2: Use in DashboardLayout**

In `apps/web/src/features/dashboard/components/DashboardLayout.tsx`, import and call the hook inside the component (after the existing `useEffect` for polling, around line 60):

```tsx
import { useContentNotificationWS } from '@/features/notifications/hooks/useContentNotificationWS'

// Inside the component, after the polling useEffect:
useContentNotificationWS()
```

**Step 3: Run type check**

```bash
cd apps/web && npm run type-check
```

Expected: no errors

**Step 4: Commit**

```bash
git add apps/web/src/features/notifications/hooks/useContentNotificationWS.ts apps/web/src/features/dashboard/components/DashboardLayout.tsx
git commit -m "feat: handle content notification WebSocket events"
```

---

## Task 11: Frontend — Notification Bell Dropdown

**Files:**
- Create: `apps/web/src/features/notifications/components/NotificationDropdown.tsx`
- Modify: `apps/web/src/features/dashboard/components/DashboardLayout.tsx` (replace router.push with dropdown)
- Modify: `apps/web/src/features/dashboard/components/DashboardHeader.tsx` (support dropdown mode)

**Step 1: Create NotificationDropdown component**

Create `apps/web/src/features/notifications/components/NotificationDropdown.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useNotificationsStore } from '../store/notificationsStore'
import { CATEGORY_LABELS } from '@/features/content/types'
import type { Notification } from '../types'

interface NotificationDropdownProps {
    onClose: () => void
}

// Group notifications by content_category if 3+ in last hour
function groupNotifications(notifications: Notification[]): (Notification | { grouped: true; category: string; label: string; count: number; items: Notification[] })[] {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recent: Record<string, Notification[]> = {}
    const result: (Notification | { grouped: true; category: string; label: string; count: number; items: Notification[] })[] = []

    for (const n of notifications) {
        const cat = n.contentCategory
        if (cat && new Date(n.createdAt) > oneHourAgo) {
            if (!recent[cat]) recent[cat] = []
            recent[cat].push(n)
        }
    }

    const groupedCats = new Set<string>()
    for (const [cat, items] of Object.entries(recent)) {
        if (items.length >= 3) {
            groupedCats.add(cat)
            const label = CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] || cat
            result.push({ grouped: true, category: cat, label, count: items.length, items })
        }
    }

    for (const n of notifications) {
        if (!n.contentCategory || !groupedCats.has(n.contentCategory)) {
            result.push(n)
        }
    }

    return result
}

export function NotificationDropdown({ onClose }: NotificationDropdownProps) {
    const router = useRouter()
    const ref = useRef<HTMLDivElement>(null)
    const { notifications, fetchNotifications, markAllAsRead } = useNotificationsStore()
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

    const contentNotifications = notifications.content?.slice(0, 10) || []

    useEffect(() => {
        fetchNotifications('content', 0)
        // Mark all content notifications as read when dropdown opens
        markAllAsRead('content')
    }, [fetchNotifications, markAllAsRead])

    // Close on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose])

    const handleClick = useCallback((actionUrl?: string) => {
        if (actionUrl) {
            router.push(actionUrl)
        }
        onClose()
    }, [router, onClose])

    const grouped = groupNotifications(contentNotifications)

    return (
        <div ref={ref} className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-lg border z-50 overflow-hidden">
            <div className="p-3 border-b">
                <p className="font-medium text-sm text-gray-900">Уведомления</p>
            </div>

            <div className="max-h-80 overflow-y-auto">
                {grouped.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500 text-center">Нет новых уведомлений</p>
                ) : (
                    grouped.map((item, i) => {
                        if ('grouped' in item && item.grouped) {
                            return (
                                <div key={`group-${item.category}`}>
                                    <button
                                        onClick={() => setExpandedGroup(expandedGroup === item.category ? null : item.category)}
                                        className="w-full text-left p-3 hover:bg-gray-50 border-b"
                                    >
                                        <p className="text-sm font-medium text-gray-900">
                                            {item.count} новых: {item.label}
                                        </p>
                                    </button>
                                    {expandedGroup === item.category && item.items.map((n) => (
                                        <button
                                            key={n.id}
                                            onClick={() => handleClick(n.actionUrl)}
                                            className="w-full text-left p-3 pl-6 hover:bg-gray-50 border-b"
                                        >
                                            <p className="text-sm text-gray-700 truncate">{n.title}</p>
                                        </button>
                                    ))}
                                </div>
                            )
                        }
                        const n = item as Notification
                        return (
                            <button
                                key={n.id}
                                onClick={() => handleClick(n.actionUrl)}
                                className="w-full text-left p-3 hover:bg-gray-50 border-b"
                            >
                                <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                                <p className="text-xs text-gray-500 truncate">{n.content}</p>
                            </button>
                        )
                    })
                )}
            </div>

            <button
                onClick={() => { router.push('/notifications'); onClose() }}
                className="w-full p-3 text-center text-sm text-blue-600 hover:bg-gray-50"
            >
                Все уведомления
            </button>
        </div>
    )
}
```

**Step 2: Update DashboardLayout to use dropdown**

In `apps/web/src/features/dashboard/components/DashboardLayout.tsx`:

Replace `handleNotificationClick` (line 97–99):

```tsx
const [showNotificationDropdown, setShowNotificationDropdown] = useState(false)

const handleNotificationClick = () => {
    setShowNotificationDropdown((prev) => !prev)
}
```

Add the dropdown import and render it near the header:

```tsx
import { NotificationDropdown } from '@/features/notifications/components/NotificationDropdown'
```

In the JSX, wrap the `<DashboardHeader>` in a `<div className="relative">` and add the dropdown after it:

```tsx
<div className="relative">
    <DashboardHeader
        userName={userName}
        avatarUrl={avatarUrl}
        notificationCount={totalUnreadCount}
        onLogoClick={handleLogoClick}
        onAvatarClick={handleAvatarClick}
        onNotificationClick={handleNotificationClick}
    />
    {showNotificationDropdown && (
        <NotificationDropdown onClose={() => setShowNotificationDropdown(false)} />
    )}
</div>
```

**Step 3: Run type check and lint**

```bash
cd apps/web && npm run type-check && npm run lint
```

Expected: no errors

**Step 4: Commit**

```bash
git add apps/web/src/features/notifications/components/NotificationDropdown.tsx apps/web/src/features/dashboard/components/DashboardLayout.tsx
git commit -m "feat: add notification bell dropdown with grouping"
```

---

## Task 12: Frontend Tests — Notification Dropdown

**Files:**
- Create: `apps/web/src/features/notifications/components/__tests__/NotificationDropdown.test.tsx`

**Step 1: Write tests**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationDropdown } from '../NotificationDropdown'

// Mock the store
jest.mock('../../store/notificationsStore', () => ({
    useNotificationsStore: () => ({
        notifications: {
            content: [
                { id: '1', title: 'Новая статья', content: 'Описание', actionUrl: '/content/abc', contentCategory: 'nutrition', createdAt: new Date().toISOString() },
                { id: '2', title: 'Другая статья', content: 'Описание 2', actionUrl: '/content/def', contentCategory: 'training', createdAt: new Date().toISOString() },
            ],
            main: [],
        },
        fetchNotifications: jest.fn(),
        markAllAsRead: jest.fn(),
    }),
}))

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/features/chat/components/WebSocketProvider', () => ({
    useWebSocketContext: () => null,
}))

describe('NotificationDropdown', () => {
    it('renders notifications', () => {
        render(<NotificationDropdown onClose={jest.fn()} />)
        expect(screen.getByText('Новая статья')).toBeInTheDocument()
        expect(screen.getByText('Другая статья')).toBeInTheDocument()
    })

    it('shows "Все уведомления" link', () => {
        render(<NotificationDropdown onClose={jest.fn()} />)
        expect(screen.getByText('Все уведомления')).toBeInTheDocument()
    })

    it('calls onClose when clicking outside', () => {
        const onClose = jest.fn()
        render(<NotificationDropdown onClose={onClose} />)
        fireEvent.mouseDown(document.body)
        expect(onClose).toHaveBeenCalled()
    })
})
```

**Step 2: Run tests**

```bash
cd apps/web && npx jest src/features/notifications/components/__tests__/NotificationDropdown.test.tsx --verbose
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/features/notifications/components/__tests__/NotificationDropdown.test.tsx
git commit -m "test: add NotificationDropdown component tests"
```

---

## Task 13: Frontend Tests — Settings Notifications

**Files:**
- Create: `apps/web/src/features/settings/components/__tests__/SettingsNotifications.test.tsx`

**Step 1: Write tests**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsNotifications } from '../SettingsNotifications'

jest.mock('@/features/notifications/api/preferencesApi', () => ({
    getNotificationPreferences: jest.fn().mockResolvedValue({
        muted_categories: ['training'],
        muted: false,
    }),
    updateNotificationPreferences: jest.fn().mockResolvedValue(undefined),
}))

describe('SettingsNotifications', () => {
    it('renders all category toggles', async () => {
        render(<SettingsNotifications />)
        await waitFor(() => {
            expect(screen.getByText('Питание')).toBeInTheDocument()
            expect(screen.getByText('Тренировки')).toBeInTheDocument()
            expect(screen.getByText('Рецепты')).toBeInTheDocument()
        })
    })

    it('renders do-not-disturb toggle', async () => {
        render(<SettingsNotifications />)
        await waitFor(() => {
            expect(screen.getByText('Не беспокоить')).toBeInTheDocument()
        })
    })
})
```

**Step 2: Run tests**

```bash
cd apps/web && npx jest src/features/settings/components/__tests__/SettingsNotifications.test.tsx --verbose
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/features/settings/components/__tests__/SettingsNotifications.test.tsx
git commit -m "test: add SettingsNotifications component tests"
```

---

## Task 14: Integration Verification

**Step 1: Run all backend tests**

```bash
cd apps/api && go test ./... -v
```

Expected: all PASS

**Step 2: Run all frontend tests**

```bash
cd apps/web && npx jest --passWithNoTests
```

Expected: all PASS

**Step 3: Type check**

```bash
cd apps/web && npm run type-check
```

Expected: no errors

**Step 4: Lint**

```bash
cd apps/web && npm run lint
```

Expected: no errors

**Step 5: Build**

```bash
make build-web && make build-api
```

Expected: both build successfully

**Step 6: Commit any fixes needed, then final commit**

```bash
git add -A && git commit -m "chore: integration fixes for content notifications"
```
