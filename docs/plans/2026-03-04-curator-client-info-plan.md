# Curator Client Info Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show client profile info (ID, email, height, weight, timezone, social links) in a collapsible panel on the curator's client detail page.

**Architecture:** Add `height` column to `user_settings` via migration. Extend the backend `ClientCard` struct and `GetClientDetail` query to return new fields from `users` and `user_settings`. Build a frontend `ClientInfoPanel` component with expand/collapse and add it to the client detail page.

**Tech Stack:** Go (curator service), PostgreSQL (migration), React/TypeScript (frontend component)

---

### Task 1: Add `height` column to `user_settings`

**Files:**
- Create: `apps/api/migrations/026_add_height_up.sql`
- Create: `apps/api/migrations/026_add_height_down.sql`

**Step 1: Create the migration files**

`026_add_height_up.sql`:
```sql
ALTER TABLE user_settings ADD COLUMN height DECIMAL(4,1) CHECK (height > 0 AND height <= 300);
```

`026_add_height_down.sql`:
```sql
ALTER TABLE user_settings DROP COLUMN IF EXISTS height;
```

**Step 2: Run the migration**

```bash
psql "$DATABASE_URL" -f apps/api/migrations/026_add_height_up.sql
```
Expected: `ALTER TABLE`

**Step 3: Commit**

```bash
git add apps/api/migrations/026_add_height_up.sql apps/api/migrations/026_add_height_down.sql
git commit -m "feat: add height column to user_settings"
```

---

### Task 2: Extend backend types and query to return client profile fields

**Files:**
- Modify: `apps/api/internal/modules/curator/types.go:4-16`
- Modify: `apps/api/internal/modules/curator/service.go:240,459-464,520-527`

**Step 1: Add new fields to `ClientCard` struct**

In `types.go`, add these fields to `ClientCard` after `TodayWater`:

```go
	Email             string   `json:"email,omitempty"`
	Height            *float64 `json:"height,omitempty"`
	Timezone          string   `json:"timezone,omitempty"`
	TelegramUsername  string   `json:"telegram_username,omitempty"`
	InstagramUsername string   `json:"instagram_username,omitempty"`
```

**Step 2: Update `GetClientDetail` client info query**

In `service.go`, line 240, replace the client query:

```go
	clientQuery := `
		SELECT u.id, COALESCE(u.name, ''), u.avatar_url, u.email,
		       us.height, COALESCE(us.timezone, 'Europe/Moscow'),
		       COALESCE(us.telegram_username, ''), COALESCE(us.instagram_username, '')
		FROM users u
		LEFT JOIN user_settings us ON us.user_id = u.id
		WHERE u.id = $1
	`
	var clientID64 int64
	var clientName string
	var avatarURL sql.NullString
	var clientEmail string
	var clientHeight sql.NullFloat64
	var clientTimezone string
	var telegramUsername string
	var instagramUsername string
	if err := s.db.QueryRowContext(ctx, clientQuery, clientID).Scan(
		&clientID64, &clientName, &avatarURL, &clientEmail,
		&clientHeight, &clientTimezone,
		&telegramUsername, &instagramUsername,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("client not found")
		}
		return nil, fmt.Errorf("failed to get client info: %w", err)
	}
```

**Step 3: Remove the separate `user_settings` query for target_weight/water_goal**

The existing query on lines 459-464 fetches `target_weight` and `water_goal` separately. Since we now JOIN `user_settings` in the client query, add those columns there too.

Update the client query to also select `us.target_weight, us.water_goal`:

```go
	clientQuery := `
		SELECT u.id, COALESCE(u.name, ''), u.avatar_url, u.email,
		       us.height, COALESCE(us.timezone, 'Europe/Moscow'),
		       COALESCE(us.telegram_username, ''), COALESCE(us.instagram_username, ''),
		       us.target_weight, us.water_goal
		FROM users u
		LEFT JOIN user_settings us ON us.user_id = u.id
		WHERE u.id = $1
	`
	var clientID64 int64
	var clientName string
	var avatarURL sql.NullString
	var clientEmail string
	var clientHeight sql.NullFloat64
	var clientTimezone string
	var telegramUsername string
	var instagramUsername string
	var targetWeight sql.NullFloat64
	var waterGoal sql.NullInt64
	if err := s.db.QueryRowContext(ctx, clientQuery, clientID).Scan(
		&clientID64, &clientName, &avatarURL, &clientEmail,
		&clientHeight, &clientTimezone,
		&telegramUsername, &instagramUsername,
		&targetWeight, &waterGoal,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("client not found")
		}
		return nil, fmt.Errorf("failed to get client info: %w", err)
	}
```

Then **delete** the old separate query block (lines 459-464):
```go
	// DELETE THIS:
	var targetWeight sql.NullFloat64
	var waterGoal sql.NullInt64
	_ = s.db.QueryRowContext(ctx,
		`SELECT target_weight, water_goal FROM user_settings WHERE user_id = $1`, clientID,
	).Scan(&targetWeight, &waterGoal)
```

**Step 4: Set the new fields on the `ClientDetail` result**

In the `ClientDetail` construction block (lines 520-527), add the new fields:

```go
	detail := &ClientDetail{
		ClientCard: ClientCard{
			ID:                clientID,
			Name:              clientName,
			Email:             clientEmail,
			Timezone:          clientTimezone,
			TelegramUsername:  telegramUsername,
			InstagramUsername: instagramUsername,
			TodayKBZHU:       todayKBZHU,
			Plan:              weeklyPlan,
			Alerts:            todayAlerts,
			UnreadCount:       unreadMap[clientID],
		},
		Days:          dayDetails,
		WeeklyPlan:    weeklyPlan,
		WeightHistory: weightHistory,
		Photos:        photos,
	}

	if avatarURL.Valid {
		detail.AvatarURL = avatarURL.String
	}

	if clientHeight.Valid {
		h := clientHeight.Float64
		detail.Height = &h
	}

	if lastWeight.Valid {
		w := lastWeight.Float64
		detail.LastWeight = &w
	}

	if targetWeight.Valid {
		w := targetWeight.Float64
		detail.TargetWeight = &w
	}

	if waterGoal.Valid {
		g := int(waterGoal.Int64)
		detail.WaterGoal = &g
	}
```

**Step 5: Build check**

Run: `cd apps/api && go build ./...`
Expected: Clean

**Step 6: Run existing tests**

Run: `cd apps/api && go test ./internal/modules/curator/ -v`
Expected: Tests pass (if any exist; if none, build is sufficient)

**Step 7: Commit**

```bash
git add apps/api/internal/modules/curator/types.go apps/api/internal/modules/curator/service.go
git commit -m "feat: return client profile fields in curator detail API"
```

---

### Task 3: Extend frontend types and build `ClientInfoPanel` component

**Files:**
- Modify: `apps/web/src/features/curator/types/index.ts:31-43`
- Create: `apps/web/src/features/curator/components/ClientInfoPanel.tsx`
- Modify: `apps/web/src/app/curator/clients/[id]/page.tsx:6,14,304-334`

**Step 1: Add new fields to the TypeScript `ClientCard` interface**

In `apps/web/src/features/curator/types/index.ts`, add to `ClientCard` after `today_water`:

```typescript
    email?: string
    height?: number | null
    timezone?: string
    telegram_username?: string
    instagram_username?: string
```

**Step 2: Create `ClientInfoPanel` component**

Create `apps/web/src/features/curator/components/ClientInfoPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Mail, Send, Instagram } from 'lucide-react'
import type { ClientDetail } from '../types'

interface ClientInfoPanelProps {
    detail: ClientDetail
}

export function ClientInfoPanel({ detail }: ClientInfoPanelProps) {
    const [open, setOpen] = useState(false)

    const hasHeight = detail.height != null
    const hasWeight = detail.last_weight != null
    const hasTelegram = !!detail.telegram_username
    const hasInstagram = !!detail.instagram_username
    const hasTimezone = !!detail.timezone

    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Подробнее
            </button>

            {open && (
                <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1.5">
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                        <span><span className="text-gray-400">ID:</span> {detail.id}</span>
                        {detail.email && (
                            <span>
                                <span className="text-gray-400">Email:</span>{' '}
                                <a href={`mailto:${detail.email}`} className="text-blue-600 hover:underline">
                                    {detail.email}
                                </a>
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                        {hasHeight && (
                            <span><span className="text-gray-400">Рост:</span> {detail.height} см</span>
                        )}
                        {hasWeight && (
                            <span><span className="text-gray-400">Вес:</span> {detail.last_weight} кг</span>
                        )}
                    </div>
                    {hasTimezone && (
                        <div>
                            <span className="text-gray-400">Часовой пояс:</span> {detail.timezone}
                        </div>
                    )}
                    {(hasTelegram || hasInstagram) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                            {hasTelegram && (
                                <a
                                    href={`https://t.me/${detail.telegram_username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                    <Send className="h-3 w-3" />
                                    @{detail.telegram_username}
                                </a>
                            )}
                            {hasInstagram && (
                                <a
                                    href={`https://instagram.com/${detail.instagram_username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-pink-600 hover:underline"
                                >
                                    <Instagram className="h-3 w-3" />
                                    @{detail.instagram_username}
                                </a>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
```

**Step 3: Add `ClientInfoPanel` to the client detail page**

In `apps/web/src/app/curator/clients/[id]/page.tsx`:

Add import (after existing imports around line 13):
```typescript
import { ClientInfoPanel } from '@/features/curator/components/ClientInfoPanel'
```

Add the panel in the header section, right after the closing `</>` of the avatar+name block (after line 323), before the "Написать" button:

The header currently looks like:
```tsx
{detail && (
    <>
        {/* avatar */}
        {/* name */}
    </>
)}
<button>Написать</button>
```

Restructure the header to add the info panel below the name row:

Replace lines 294-334 with:
```tsx
            <div className="flex items-center gap-3 mb-2">
                <button
                    type="button"
                    onClick={() => router.push('/curator')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                    aria-label="Назад"
                >
                    <ArrowLeft className="h-5 w-5 text-gray-700" />
                </button>

                {detail && (
                    <>
                        {detail.avatar_url ? (
                            <Image
                                src={detail.avatar_url}
                                alt={detail.name}
                                width={40}
                                height={40}
                                className="h-10 w-10 rounded-full object-cover"
                                unoptimized
                            />
                        ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                                {initials}
                            </div>
                        )}
                        <span className="flex-1 text-lg font-semibold text-gray-900 truncate">
                            {detail.name}
                        </span>
                    </>
                )}

                <button
                    type="button"
                    onClick={() => router.push(`/curator/chat/${clientId}`)}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                    <MessageCircle className="h-4 w-4" />
                    Написать
                </button>
            </div>

            {detail && (
                <div className="mb-4 ml-12">
                    <ClientInfoPanel detail={detail} />
                </div>
            )}
```

Note: `mb-6` on the header div changes to `mb-2`, and the `ClientInfoPanel` gets `mb-4 ml-12` (indented to align with name, not with back button).

**Step 4: Type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean

**Step 5: Lint**

Run: `cd apps/web && npm run lint`
Expected: Clean

**Step 6: Commit**

```bash
git add apps/web/src/features/curator/types/index.ts apps/web/src/features/curator/components/ClientInfoPanel.tsx apps/web/src/app/curator/clients/\[id\]/page.tsx
git commit -m "feat: add collapsible client info panel to curator detail page"
```

---

### Task 4: Add height field to client profile settings

**Files:**
- Modify: settings page and API (explore `apps/web/src/app/profile/` or `apps/web/src/features/settings/`)

**Step 1: Find the profile/settings page**

Look for the client settings page where users can edit their profile. It likely already has fields for telegram_username, instagram_username. Add a "Рост" (height) input field there.

The settings API endpoint (`getProfile`/`updateProfile`) and the profile page need a `height` field.

**Step 2: Add `height` to the profile API types and backend**

In the backend users/settings module, add `height` to the profile response and update endpoint. The `user_settings` table already has the column from Task 1.

Look in `apps/api/internal/modules/users/` for the profile handler/service. Add `height` to the GET and PUT profile endpoints.

**Step 3: Add height input to the frontend settings form**

Add a numeric input field for "Рост (см)" with min=50, max=300, step=0.1 alongside existing fields.

**Step 4: Type check + lint**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: Clean

**Step 5: Build check**

Run: `cd apps/api && go build ./...`
Expected: Clean

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add height field to client profile settings"
```
