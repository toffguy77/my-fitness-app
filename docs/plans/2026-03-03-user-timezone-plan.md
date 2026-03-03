# User Timezone Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full timezone support so all date boundaries and time displays respect the user's timezone, with onboarding detection and settings management.

**Architecture:** Timezone stored as IANA string in `user_settings.timezone`. Backend uses it for date parsing (`time.ParseInLocation`) instead of UTC. Frontend sends `YYYY-MM-DD` dates using local time. Existing users default to `Europe/Moscow`.

**Tech Stack:** Go/Gin backend, PostgreSQL, Next.js/React frontend, Zustand stores

**Design doc:** `docs/plans/2026-03-03-user-timezone-design.md`

---

### Task 1: Database Migration — Add timezone column

**Files:**
- Create: `apps/api/migrations/022_add_timezone_up.sql`
- Create: `apps/api/migrations/022_add_timezone_down.sql`

**Step 1: Write up migration**

```sql
-- 022_add_timezone_up.sql
ALTER TABLE user_settings
ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';
```

**Step 2: Write down migration**

```sql
-- 022_add_timezone_down.sql
ALTER TABLE user_settings
DROP COLUMN IF EXISTS timezone;
```

**Step 3: Verify migration applies locally**

Run: `cd apps/api && go run cmd/server/main.go` (migrations auto-apply on startup)
Expected: Server starts, no errors about timezone column

**Step 4: Verify column exists**

Connect to local DB and run: `\d user_settings` — should show `timezone` column with default `Europe/Moscow`

**Step 5: Commit**

```bash
git add apps/api/migrations/022_add_timezone_up.sql apps/api/migrations/022_add_timezone_down.sql
git commit -m "feat: add timezone column to user_settings"
```

---

### Task 2: Backend — Update Users module settings CRUD

**Files:**
- Modify: `apps/api/internal/modules/users/service.go` (Settings struct, GetSettings SQL, UpdateSettings SQL)
- Modify: `apps/api/internal/modules/users/handler.go` (UpdateSettingsRequest struct)

**Step 1: Add `Timezone` field to Settings struct**

In `apps/api/internal/modules/users/service.go`, find the `Settings` struct (lines 27-34):

```go
type Settings struct {
	Language           string   `json:"language"`
	Units              string   `json:"units"`
	TelegramUsername   string   `json:"telegram_username,omitempty"`
	InstagramUsername  string   `json:"instagram_username,omitempty"`
	AppleHealthEnabled bool     `json:"apple_health_enabled"`
	TargetWeight       *float64 `json:"target_weight,omitempty"`
}
```

Add `Timezone` field:

```go
type Settings struct {
	Language           string   `json:"language"`
	Units              string   `json:"units"`
	Timezone           string   `json:"timezone"`
	TelegramUsername   string   `json:"telegram_username,omitempty"`
	InstagramUsername  string   `json:"instagram_username,omitempty"`
	AppleHealthEnabled bool     `json:"apple_health_enabled"`
	TargetWeight       *float64 `json:"target_weight,omitempty"`
}
```

**Step 2: Add `Timezone` to UpdateSettingsRequest**

In `apps/api/internal/modules/users/handler.go`, find `UpdateSettingsRequest` (lines 87-95):

```go
type UpdateSettingsRequest struct {
	Language           string   `json:"language"`
	Units              string   `json:"units"`
	TelegramUsername   string   `json:"telegram_username"`
	InstagramUsername  string   `json:"instagram_username"`
	AppleHealthEnabled bool     `json:"apple_health_enabled"`
	TargetWeight       *float64 `json:"target_weight"`
}
```

Add `Timezone` field:

```go
type UpdateSettingsRequest struct {
	Language           string   `json:"language"`
	Units              string   `json:"units"`
	Timezone           string   `json:"timezone"`
	TelegramUsername   string   `json:"telegram_username"`
	InstagramUsername  string   `json:"instagram_username"`
	AppleHealthEnabled bool     `json:"apple_health_enabled"`
	TargetWeight       *float64 `json:"target_weight"`
}
```

**Step 3: Update GetSettings SQL query**

In `apps/api/internal/modules/users/service.go`, find the GetSettings query (lines 59-67). Add `COALESCE(s.timezone, 'Europe/Moscow')` to the SELECT and scan it into the Settings struct.

The query currently returns columns in order: id, email, name, role, avatar_url, onboarding_completed, language, units, telegram_username, instagram_username, apple_health_enabled, target_weight.

Add `COALESCE(s.timezone, 'Europe/Moscow')` after `COALESCE(s.units, 'metric')`. Update the corresponding `Scan()` call to include `&settings.Timezone`.

**Step 4: Update UpdateSettings SQL query**

In `apps/api/internal/modules/users/service.go`, find the UpdateSettings query (lines 127-139). Add `timezone` to both INSERT and ON CONFLICT UPDATE clauses:

- Add `timezone` to column list
- Add `$8` parameter (shift existing params)
- Add `timezone = EXCLUDED.timezone` to ON CONFLICT
- Add `COALESCE(s.timezone, 'Europe/Moscow')` to RETURNING clause
- Update the `Exec/Scan` call to pass `req.Timezone` and scan `&settings.Timezone`

**Step 5: Add timezone validation in handler**

In `apps/api/internal/modules/users/handler.go`, in the `UpdateSettings` handler, add validation after binding the request:

```go
// Validate timezone if provided
if req.Timezone != "" {
	if _, err := time.LoadLocation(req.Timezone); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный часовой пояс")
		return
	}
}
```

Add `"time"` to imports if not already there.

**Step 6: Run existing tests**

Run: `cd apps/api && go test ./internal/modules/users/ -v`
Expected: Tests pass (existing tests shouldn't break since timezone has a default)

**Step 7: Commit**

```bash
git add apps/api/internal/modules/users/service.go apps/api/internal/modules/users/handler.go
git commit -m "feat: add timezone to user settings CRUD"
```

---

### Task 3: Backend — Helper to load user timezone from context

**Files:**
- Create: `apps/api/internal/shared/middleware/timezone.go`

**Step 1: Create timezone helper**

This helper loads the user's timezone from the database given a user ID. It will be called by handlers that need timezone-aware date parsing.

```go
package middleware

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DefaultTimezone is used when user has no timezone set
const DefaultTimezone = "Europe/Moscow"

// GetUserTimezone loads the user's timezone from user_settings.
// Returns the timezone Location, falling back to Europe/Moscow.
func GetUserTimezone(ctx context.Context, db *pgxpool.Pool, userID int64) *time.Location {
	var tz string
	err := db.QueryRow(ctx,
		"SELECT COALESCE(timezone, 'Europe/Moscow') FROM user_settings WHERE user_id = $1",
		userID,
	).Scan(&tz)

	if err != nil || tz == "" {
		tz = DefaultTimezone
	}

	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc, _ = time.LoadLocation(DefaultTimezone)
	}

	return loc
}
```

**Step 2: Run tests to verify no compile errors**

Run: `cd apps/api && go build ./...`
Expected: Builds successfully

**Step 3: Commit**

```bash
git add apps/api/internal/shared/middleware/timezone.go
git commit -m "feat: add GetUserTimezone helper"
```

---

### Task 4: Backend — Timezone-aware date parsing in Dashboard

**Files:**
- Modify: `apps/api/internal/modules/dashboard/handler.go` (lines 95, 139, 183, 190)
- Modify: `apps/api/internal/modules/dashboard/service.go` (lines 41, 114, 271, 272, 1083, 1084)

**Step 1: Update Dashboard handler to pass timezone to service**

The dashboard handler gets `user_id` from `c.GetInt64("user_id")`. Load the user's timezone and pass it to service methods.

In `handler.go`, for each handler that parses dates:

a) **GetDailyMetrics** (around line 95): After getting `userID`, load timezone:
```go
userLoc := middleware.GetUserTimezone(c.Request.Context(), h.db, userID)
date, err := time.ParseInLocation("2006-01-02", dateStr, userLoc)
```

b) **SaveMetric** (around line 139): Same pattern:
```go
userLoc := middleware.GetUserTimezone(c.Request.Context(), h.db, userID)
date, err := time.ParseInLocation("2006-01-02", req.Date, userLoc)
```

c) **GetWeekMetrics** (around lines 183, 190): Same pattern for both start and end dates.

Add import: `"github.com/burcev/api/internal/shared/middleware"`

**Step 2: Update Dashboard service date normalization**

In `service.go`, all occurrences of `time.Date(..., time.UTC)` should use the timezone from the parsed date (which now carries the correct Location from `ParseInLocation`):

a) Line 41: `time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)`
→ `time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())`

b) Line 114: Same change.

c) Lines 271-272: Same change for both `startDate` and `endDate`.

d) Lines 1083-1084: Same change for `weekStart` and `weekEnd`.

**Note:** The `date.Location()` call works because `ParseInLocation` embeds the location in the `time.Time` value.

**Step 3: Run dashboard tests**

Run: `cd apps/api && go test ./internal/modules/dashboard/ -v`
Expected: Tests pass

**Step 4: Commit**

```bash
git add apps/api/internal/modules/dashboard/handler.go apps/api/internal/modules/dashboard/service.go
git commit -m "feat: timezone-aware date parsing in dashboard"
```

---

### Task 5: Backend — Timezone-aware date parsing in Food Tracker

**Files:**
- Modify: `apps/api/internal/modules/food-tracker/handler.go` (line 107)

**Step 1: Update Food Tracker handler**

In `handler.go`, the `GetEntries` handler parses the date at line 107:

```go
date, err := time.Parse("2006-01-02", req.Date)
```

Change to:
```go
userLoc := middleware.GetUserTimezone(c.Request.Context(), h.db, userID)
date, err := time.ParseInLocation("2006-01-02", req.Date, userLoc)
```

The handler needs access to `h.db` — check if the food tracker Handler struct already has a `db` field. If not, the timezone can be loaded via the service. Check the Handler struct definition in `handler.go`.

If the Handler struct doesn't have `db`, add a `GetUserTimezone` method to the food tracker service interface that wraps the middleware helper.

**Step 2: Check for other date parsing in food tracker**

The food tracker service formats dates with `date.Format("2006-01-02")` at lines 42, 451, 1425, 1485. These are used for SQL WHERE clauses. Since the `date` parameter now carries the correct Location, the format output is the same (Format always outputs the date components, which are timezone-aware). No changes needed here.

**Step 3: Run food tracker tests**

Run: `cd apps/api && go test ./internal/modules/food-tracker/ -v`
Expected: Tests pass

**Step 4: Commit**

```bash
git add apps/api/internal/modules/food-tracker/handler.go
git commit -m "feat: timezone-aware date parsing in food tracker"
```

---

### Task 6: Frontend — Fix local date formatting utility

**Files:**
- Modify: `apps/web/src/shared/utils/format.ts`

**Step 1: Add `formatLocalDate` utility**

In `apps/web/src/shared/utils/format.ts`, add after the existing `formatDate` function:

```typescript
/**
 * Format a Date to YYYY-MM-DD using local timezone (not UTC).
 * Use this instead of toISOString().split('T')[0] which converts to UTC.
 */
export const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}
```

**Step 2: Commit**

```bash
git add apps/web/src/shared/utils/format.ts
git commit -m "feat: add formatLocalDate utility for timezone-correct dates"
```

---

### Task 7: Frontend — Replace all toISOString date conversions

**Files:**
- Modify: `apps/web/src/features/dashboard/store/dashboardStore.ts` (line 371)
- Modify: `apps/web/src/features/food-tracker/store/foodTrackerStore.ts` (line 364)
- Modify: `apps/web/src/features/food-tracker/components/FoodTrackerPage.tsx` (lines 54, 118)

**Step 1: Fix dashboardStore.ts**

At line 370-372, replace:
```typescript
function formatDateISO(date: Date): string {
    return date.toISOString().split('T')[0];
}
```

With:
```typescript
import { formatLocalDate } from '@/shared/utils/format';
// ... (at top of file)

function formatDateISO(date: Date): string {
    return formatLocalDate(date);
}
```

**Step 2: Fix foodTrackerStore.ts**

At line 364, replace:
```typescript
selectedDate: new Date().toISOString().split('T')[0],
```

With:
```typescript
import { formatLocalDate } from '@/shared/utils/format';
// ... (at top of file)

selectedDate: formatLocalDate(new Date()),
```

**Step 3: Fix FoodTrackerPage.tsx**

At line 54, replace:
```typescript
const dateString = selectedDate.toISOString().split('T')[0];
```

With:
```typescript
import { formatLocalDate } from '@/shared/utils/format';
// ... (at top of file)

const dateString = formatLocalDate(selectedDate);
```

At line 118, replace:
```typescript
<RecommendationsTab date={selectedDate.toISOString().split('T')[0]} />
```

With:
```typescript
<RecommendationsTab date={formatLocalDate(selectedDate)} />
```

**Step 4: Search for any other occurrences**

Run: `grep -rn "toISOString().split" apps/web/src/` and fix any remaining occurrences with `formatLocalDate`.

**Step 5: Run frontend type check**

Run: `cd apps/web && npm run type-check`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/web/src/features/dashboard/store/dashboardStore.ts \
       apps/web/src/features/food-tracker/store/foodTrackerStore.ts \
       apps/web/src/features/food-tracker/components/FoodTrackerPage.tsx
git commit -m "fix: use local timezone for date formatting instead of UTC"
```

---

### Task 8: Frontend — Add timezone to settings API and types

**Files:**
- Modify: `apps/web/src/features/settings/api/settings.ts` (UserSettings interface, lines 14-20)

**Step 1: Add `timezone` to UserSettings interface**

In `apps/web/src/features/settings/api/settings.ts`, update:

```typescript
export interface UserSettings {
    language: string
    units: string
    timezone: string
    telegram_username: string
    instagram_username: string
    apple_health_enabled: boolean
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/settings/api/settings.ts
git commit -m "feat: add timezone to UserSettings interface"
```

---

### Task 9: Frontend — Timezone picker component

**Files:**
- Create: `apps/web/src/shared/components/ui/TimezonePicker.tsx`

**Step 1: Create TimezonePicker component**

A searchable dropdown component that lists common IANA timezones with Russian labels. Use `Intl.supportedValuesOf('timeZone')` for the full list (available in modern browsers), with a curated list of Russian/CIS timezones at the top.

The component should:
- Accept `value: string` (IANA timezone) and `onChange: (tz: string) => void`
- Show a search input that filters the timezone list
- Display timezone as "Город (UTC+X)" format
- Pre-populate with common Russian timezones first:
  - Europe/Kaliningrad (UTC+2)
  - Europe/Moscow (UTC+3)
  - Europe/Samara (UTC+4)
  - Asia/Yekaterinburg (UTC+5)
  - Asia/Omsk (UTC+6)
  - Asia/Krasnoyarsk (UTC+7)
  - Asia/Irkutsk (UTC+8)
  - Asia/Yakutsk (UTC+9)
  - Asia/Vladivostok (UTC+10)
  - Asia/Magadan (UTC+11)
  - Asia/Kamchatka (UTC+12)

**Step 2: Run type check**

Run: `cd apps/web && npm run type-check`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/shared/components/ui/TimezonePicker.tsx
git commit -m "feat: add TimezonePicker component"
```

---

### Task 10: Frontend — Add timezone to onboarding wizard

**Files:**
- Modify: `apps/web/src/features/onboarding/store/onboardingStore.ts` (add timezone state)
- Modify: `apps/web/src/features/onboarding/components/OnboardingWizard.tsx` (add timezone step)

**Step 1: Add timezone to onboarding store**

In `onboardingStore.ts`, add `timezone` field with auto-detected default:

```typescript
timezone: typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'Europe/Moscow',
```

**Step 2: Add timezone selection to onboarding step 2 (Settings step)**

In `OnboardingWizard.tsx`, the Settings step (step 2) currently shows Language and Units selectors. Add the `TimezonePicker` component below the units selector:

- Label: "Часовой пояс"
- Value: `store.timezone`
- onChange: update store timezone
- Pre-filled from `Intl.DateTimeFormat().resolvedOptions().timeZone`

**Step 3: Include timezone in settings save during onboarding**

In the onboarding completion flow (around line 99-133 in OnboardingWizard.tsx), when `updateSettings()` is called, include `timezone` in the settings payload.

**Step 4: Run type check**

Run: `cd apps/web && npm run type-check`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/features/onboarding/store/onboardingStore.ts \
       apps/web/src/features/onboarding/components/OnboardingWizard.tsx
git commit -m "feat: add timezone selection to onboarding"
```

---

### Task 11: Frontend — Add timezone to settings page

**Files:**
- Modify: `apps/web/src/features/settings/components/SettingsLocality.tsx`

**Step 1: Add timezone section to SettingsLocality**

After the units selector section, add a new section:

- Label: "Часовой пояс"
- Use the `TimezonePicker` component
- Value from `settings.timezone`
- onChange: call `updateSettings({ ...settings, timezone: newTz })`

Follow the same pattern as the existing Language and Units selectors in the component.

**Step 2: Run type check**

Run: `cd apps/web && npm run type-check`
Expected: No errors

**Step 3: Verify manually**

Run: `make dev`
- Go to Settings > Profile
- Verify timezone picker appears below units
- Change timezone and verify it saves

**Step 4: Commit**

```bash
git add apps/web/src/features/settings/components/SettingsLocality.tsx
git commit -m "feat: add timezone picker to settings page"
```

---

### Task 12: Integration testing and verification

**Step 1: Run all backend tests**

Run: `cd apps/api && go test ./... -v`
Expected: All tests pass

**Step 2: Run all frontend checks**

Run: `cd apps/web && npm run type-check && npm run lint`
Expected: No errors

**Step 3: Manual E2E verification**

Run: `make dev`

Test scenarios:
1. Register new user → onboarding shows timezone picker pre-filled with browser timezone → save → verify timezone in DB
2. Login as existing user → settings shows Europe/Moscow → change to Asia/Vladivostok → save → reload → verify persisted
3. Open dashboard → verify "today" shows correct local date
4. Add food entry at 23:30 local time → verify it shows on correct date
5. Open food tracker → verify date picker defaults to today (local)

**Step 4: Final commit if any fixes needed**

```bash
git commit -m "fix: integration fixes for timezone feature"
```
