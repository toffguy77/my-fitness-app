# User Timezone Feature — Design

## Problem

The app uses `toISOString().split('T')[0]` to determine "today", which converts to UTC date. Users in non-UTC timezones (e.g. Moscow, UTC+3) see incorrect dates — food entries "move" to the next day after midnight local time. Additionally, timestamps displayed to curators have no timezone context.

## Requirements

1. **Full timezone support** — all date boundaries and time displays respect user timezone
2. **Curator sees client's timezone** — curator views client data in the client's timezone
3. **Onboarding step** — ask timezone during onboarding with browser auto-detection pre-fill
4. **Settings page** — timezone editable in settings
5. **Existing users** — default to `Europe/Moscow`

## Architecture: Timezone on Backend (Approach 1)

Timezone stored in `user_settings.timezone` as IANA string. Backend uses it for date parsing and timestamp formatting. Single source of truth on the server.

### 1. Data Model

**Migration: add `timezone` to `user_settings`**

```sql
ALTER TABLE user_settings
ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';
```

- Format: IANA timezone name (`Europe/Moscow`, `Asia/Novosibirsk`, `America/New_York`)
- Existing users get `Europe/Moscow` via DEFAULT
- Validated on backend via Go `time.LoadLocation()`

### 2. Backend Changes

**Settings API:**
- `GET /users/settings` — returns `timezone` field
- `PUT /users/settings` — accepts `timezone`, validates with `time.LoadLocation()`

**Date parsing in handlers/services:**

Replace:
```go
date, err := time.Parse("2006-01-02", dateStr)
```

With:
```go
loc, _ := time.LoadLocation(userTimezone) // loaded from user settings
date, err := time.ParseInLocation("2006-01-02", dateStr, loc)
```

Affected modules:
- `dashboard/handler.go` — daily metrics, week range
- `dashboard/service.go` — date normalization (currently hardcoded `time.UTC`)
- `food-tracker/handler.go` — entry date parsing
- `food-tracker/service.go` — date normalization

**Timestamp responses:**
- Return timestamps with offset: `2026-03-03T23:15:00+03:00`
- Allows frontend to display times correctly
- Curators seeing client data get client's timezone offset

**User timezone loading:**
- Add middleware or helper to load user timezone from settings
- Cache per-request (already have user ID from auth middleware)
- Fallback to `Europe/Moscow` if not set

### 3. Frontend Changes

**New utility `formatLocalDate(date: Date): string`:**
- Location: `shared/utils/format.ts`
- Uses `getFullYear()`, `getMonth()`, `getDate()` (local time)
- Replaces all `toISOString().split('T')[0]` usages

**Files to fix:**
- `dashboardStore.ts:371` — `formatDateISO()` function
- `foodTrackerStore.ts:364` — initial `selectedDate`
- `FoodTrackerPage.tsx:54` — `dateString` for fetching
- `FoodTrackerPage.tsx:118` — `RecommendationsTab` date prop

**Time display:**
- Timestamps from API (with offset) parsed via `new Date()` — browser auto-converts
- Food entry `time` field displayed as-is (already local)
- Curator viewing client: show time with timezone label (e.g. "23:15 (MSK)")

### 4. Onboarding

**New step before `completeOnboarding()`:**
- Pre-fill with `Intl.DateTimeFormat().resolvedOptions().timeZone`
- UI: "Ваш часовой пояс" + detected timezone name + "Подтвердить" button + "Изменить" link
- On "Изменить": searchable dropdown with timezone list
- Save: `PUT /users/settings { timezone: "Europe/Moscow" }` then `completeOnboarding()`

**Existing users:** already have `Europe/Moscow` from migration, no forced prompt.

### 5. Settings Page

**New section in SettingsLocality (after units selector):**
- Label: "Часовой пояс"
- Current value display + edit button
- On edit: searchable timezone picker
- Save via existing `updateSettings()` flow

### 6. Edge Cases

| Case | Handling |
|------|----------|
| Invalid timezone string | Backend validates via `time.LoadLocation()`, returns 400 |
| Null timezone (shouldn't happen) | Fallback to `Europe/Moscow` |
| User changes timezone | New dates use new TZ; old entries keep their dates (YYYY-MM-DD unchanged, UTC timestamps in DB unchanged) |
| DST transitions | Go `time.LoadLocation()` handles DST automatically |
| Curator viewing client | Backend returns client timestamps with client's TZ offset |

## Non-Goals

- Server-side timezone for push notifications/scheduled tasks (future work)
- Timezone history tracking (which TZ was active when entry was created)
- Automatic timezone updates on travel detection
