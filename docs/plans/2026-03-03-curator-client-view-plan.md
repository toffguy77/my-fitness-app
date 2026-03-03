# Curator Client View Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve curator's client detail page with multi-day grouped view, additional metrics (water, steps, workouts, photos), and fix assignment logic.

**Architecture:** Extend curator backend to return multi-day data with water/steps/workouts/photos. Refactor frontend to collapsible day sections with two-column layout. Cleanup migration for bad assignments.

**Tech Stack:** Go/Gin backend, PostgreSQL, Next.js/React frontend, Tailwind CSS

---

### Task 1: Migration — Clean Up Bad Curator Assignments

**Files:**
- Create: `apps/api/migrations/023_cleanup_curator_assignments_up.sql`
- Create: `apps/api/migrations/023_cleanup_curator_assignments_down.sql`

**Step 1: Write the up migration**

```sql
-- Remove curator_client_relationships where client is a coordinator or admin
DELETE FROM curator_client_relationships
WHERE client_id IN (SELECT id FROM users WHERE role IN ('coordinator', 'admin'));

-- Remove conversations where client is a coordinator or admin
DELETE FROM conversations
WHERE client_id IN (SELECT id FROM users WHERE role IN ('coordinator', 'admin'));
```

**Step 2: Write the down migration**

```sql
-- Cannot restore deleted relationships
-- This is a data cleanup, no rollback possible
SELECT 1;
```

**Step 3: Commit**

```bash
git add apps/api/migrations/023_cleanup_curator_assignments_up.sql apps/api/migrations/023_cleanup_curator_assignments_down.sql
git commit -m "fix: clean up curator/admin users from client assignments"
```

---

### Task 2: Backend — Add New Types for Multi-Day Detail

**Files:**
- Modify: `apps/api/internal/modules/curator/types.go`

**Step 1: Add new types**

Add `DayDetail`, `WaterView`, `WorkoutView`, `PhotoView` structs. Update `ClientDetail` to use `Days []DayDetail` instead of `FoodEntries []FoodEntryView`. Keep `FoodEntries` field with `json:"-"` for backward compat or remove entirely.

```go
type DayDetail struct {
    Date        string          `json:"date"`
    KBZHU       *DailyKBZHU     `json:"kbzhu"`
    Plan        *PlanKBZHU      `json:"plan"`
    Alerts      []Alert         `json:"alerts"`
    FoodEntries []FoodEntryView `json:"food_entries"`
    Water       *WaterView      `json:"water"`
    Steps       int             `json:"steps"`
    Workout     *WorkoutView    `json:"workout"`
}

type WaterView struct {
    Glasses   int `json:"glasses"`
    Goal      int `json:"goal"`
    GlassSize int `json:"glass_size"`
}

type WorkoutView struct {
    Completed bool   `json:"completed"`
    Type      string `json:"type"`
    Duration  int    `json:"duration"`
}

type PhotoView struct {
    ID         string `json:"id"`
    PhotoURL   string `json:"photo_url"`
    WeekStart  string `json:"week_start"`
    WeekEnd    string `json:"week_end"`
    UploadedAt string `json:"uploaded_at"`
}
```

Update `ClientDetail`:
```go
type ClientDetail struct {
    ClientCard
    Days          []DayDetail          `json:"days"`
    WeeklyPlan    *PlanKBZHU           `json:"weekly_plan"`
    WeightHistory []WeightHistoryPoint `json:"weight_history"`
    Photos        []PhotoView          `json:"photos"`
}
```

**Step 2: Commit**

```bash
git add apps/api/internal/modules/curator/types.go
git commit -m "feat: add multi-day detail types for curator client view"
```

---

### Task 3: Backend — Refactor GetClientDetail Service for Multi-Day

**Files:**
- Modify: `apps/api/internal/modules/curator/service.go`
- Modify: `apps/api/internal/modules/curator/handler.go`

**Step 1: Update handler to parse `days` query param**

In `GetClientDetail` handler, parse `days` query param (default 7). If `date` is provided, use it as single day. Pass both to service.

**Step 2: Refactor service GetClientDetail**

Change signature: `GetClientDetail(ctx, curatorID, clientID, date string, days int) (*ClientDetail, error)`

Compute date range:
- If `date` != "": startDate = date, endDate = date (single day)
- Else: endDate = today, startDate = today - (days-1) days

Query food entries for date range. Query water_logs for date range. Query daily_metrics for date range (steps, workouts). Group by date.

For each date in range, build `DayDetail`:
- KBZHU from food entries for that date
- Alerts computed from KBZHU vs plan
- Water from water_logs
- Steps/workout from daily_metrics

Also query `weekly_photos` for the client.

**Step 3: Update ServiceInterface**

```go
GetClientDetail(ctx context.Context, curatorID int64, clientID int64, date string, days int) (*ClientDetail, error)
```

**Step 4: Verify Go compiles**

Run: `go build ./...` from `apps/api/`

**Step 5: Commit**

```bash
git add apps/api/internal/modules/curator/
git commit -m "feat: multi-day client detail with water, steps, workouts, photos"
```

---

### Task 4: Backend — Run and Fix Tests

**Files:**
- Modify: `apps/api/internal/modules/curator/*_test.go` (if exists)

**Step 1: Run existing tests**

Run: `go test ./internal/modules/curator/ -v`

**Step 2: Fix any compilation or test failures**

Adapt test mocks/fixtures to new `GetClientDetail` signature and response shape.

**Step 3: Commit**

```bash
git add apps/api/internal/modules/curator/
git commit -m "test: fix curator tests for multi-day detail"
```

---

### Task 5: Frontend — Update Curator Types

**Files:**
- Modify: `apps/web/src/features/curator/types/index.ts`

**Step 1: Add new types**

Add `DayDetail`, `WaterView`, `WorkoutView`, `PhotoView` interfaces. Update `ClientDetail` to use `days: DayDetail[]` and add `photos: PhotoView[]`.

**Step 2: Update curatorApi**

Update `getClientDetail` to accept `days` param:
```typescript
getClientDetail: (id: number, days?: number) =>
    apiClient.get<ClientDetail>(`${BASE}/clients/${id}?days=${days ?? 7}`),
```

**Step 3: Commit**

```bash
git add apps/web/src/features/curator/
git commit -m "feat: update curator frontend types for multi-day view"
```

---

### Task 6: Frontend — Collapsible DaySection Component

**Files:**
- Create: `apps/web/src/features/curator/components/DaySection.tsx`

**Step 1: Build DaySection component**

Props: `day: DayDetail`, `defaultExpanded?: boolean`

Collapsed state shows:
- Date (formatted in Russian locale)
- KBZHU one-liner: "1850/2000 ккал | Б 95/120 | Ж 65/70 | У 200/250"
- Alert badges inline
- Water/steps/workout summary icons

Expanded state shows:
- Two-column layout (md+ breakpoint):
  - Left: KBZHUProgress bars + water + steps + workout details
  - Right: food entries grouped by meal
- Single column on mobile

Toggle via click on the day header.

**Step 2: Commit**

```bash
git add apps/web/src/features/curator/components/DaySection.tsx
git commit -m "feat: add collapsible DaySection component for curator view"
```

---

### Task 7: Frontend — PhotosSection Component

**Files:**
- Create: `apps/web/src/features/curator/components/PhotosSection.tsx`

**Step 1: Build PhotosSection component**

Props: `photos: PhotoView[]`

Display: grid of photos (2 columns on mobile, 3 on desktop). Each photo card shows:
- Image (from photo_url)
- Date range label: "01.03 — 07.03.2026"

If no photos, don't render anything.

**Step 2: Commit**

```bash
git add apps/web/src/features/curator/components/PhotosSection.tsx
git commit -m "feat: add PhotosSection component for curator client view"
```

---

### Task 8: Frontend — Refactor Client Detail Page

**Files:**
- Modify: `apps/web/src/app/curator/clients/[id]/page.tsx`

**Step 1: Replace current layout**

Remove single-date food entries section. Replace with:
1. Header (keep as-is)
2. Alerts summary (keep)
3. `days.map(day => <DaySection key={day.date} day={day} />)` — all collapsed by default
4. WeightSection (keep)
5. `<PhotosSection photos={detail.photos} />` (new)

Remove the date picker input. The API now returns 7 days automatically.

**Step 2: Update fetch call**

Change `curatorApi.getClientDetail(clientId, date)` to `curatorApi.getClientDetail(clientId)` (no date param).

**Step 3: Fix the UTC date bug**

Replace `new Date().toISOString().slice(0, 10)` with `formatLocalDate(new Date())` import.

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit` from `apps/web/`

**Step 5: Commit**

```bash
git add apps/web/src/app/curator/clients/[id]/page.tsx
git commit -m "feat: refactor client detail page with multi-day collapsible view"
```

---

### Task 9: Integration Testing & Verification

**Step 1: Run all Go tests**

Run: `go test ./...` from `apps/api/`

**Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit` from `apps/web/`

**Step 3: Run frontend lint**

Run: `npm run lint` from `apps/web/`

**Step 4: Manual smoke test (if possible)**

Start dev server and verify curator client detail page loads with multi-day data.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for curator client view"
```
