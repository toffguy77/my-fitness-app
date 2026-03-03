# Curator Client View Improvements — Design

## Problem

The curator's client detail page is missing important client data (water, steps, workouts, photos) and has a flat, ungrouped layout that makes daily review inefficient. Additionally, curators and admins incorrectly appear as clients in the curator assignment system.

## Requirements

1. **Fix assignment logic** — only assign `role='client'` users; clean up existing bad assignments
2. **KBZHU + meals side by side** — two-column layout on client detail page
3. **Group by days, collapsible** — multi-day view, default collapsed showing only KBZHU and deviations
4. **Show water intake** — curator sees client's daily water consumption
5. **Show steps** — curator sees client's daily step count
6. **Show workouts** — curator sees workout type, duration, completion
7. **Show client photos** — chronological weekly photos with dates

## Architecture

### 1. Fix Assignment Logic

The `assignCurator()` function in `auth/service.go` already filters coordinators correctly (`WHERE u.role = 'coordinator'`). The new user always gets role='client' at registration. The issue is that users whose roles were later changed to coordinator/admin still have stale relationships.

**Data cleanup migration (023):**

```sql
DELETE FROM curator_client_relationships
WHERE client_id IN (SELECT id FROM users WHERE role IN ('coordinator', 'admin'));

DELETE FROM conversations
WHERE client_id IN (SELECT id FROM users WHERE role IN ('coordinator', 'admin'));
```

**Guard in `assignCurator()`:** Add check to skip assignment if the user already has a non-client role (defensive).

### 2. Multi-Day Client Detail API

**Current:** `GET /curator/clients/:id?date=YYYY-MM-DD` — single day.

**New:** `GET /curator/clients/:id?days=7` — last N days (default 7). If `date` param provided, returns single day in `days[]` for backward compat.

**New response types:**

```go
type ClientDetail struct {
    ClientCard
    Days          []DayDetail          `json:"days"`
    WeeklyPlan    *PlanKBZHU           `json:"weekly_plan"`
    WeightHistory []WeightHistoryPoint `json:"weight_history"`
    Photos        []PhotoView          `json:"photos"`
}

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

### 3. Backend Service Changes

Refactor `GetClientDetail` to:
- Parse `days` param (default 7) to compute date range
- Query food_entries, water_logs, daily_metrics for entire range
- Group by date into `[]DayDetail`
- Query weekly_photos for the client (last 20)
- Return enriched `ClientDetail`

### 4. Frontend — Client Detail Page

**Layout (collapsed day):**
```
┌─ 03.03.2026 ──────────────────────────────────┐
│ 1850/2000 ккал | Б 95/120 | Ж 65/70 | У 200/250 │
│ ⚠ Белок ниже нормы                               │
│ 💧 6/8 | 👟 8500 шагов | 🏋 Силовая 45 мин       │
└───────────────────────────────────────────────────┘
```

**Layout (expanded day — two columns on md+):**
```
┌───────────────────┬───────────────────────────────┐
│ KBZHU Progress    │ Food entries by meal           │
│ bars + water +    │ (breakfast, lunch, dinner,     │
│ steps + workout   │  snack)                        │
└───────────────────┴───────────────────────────────┘
```

**Photos section at bottom:** Grid with week dates.

### 5. Frontend Types

```typescript
interface DayDetail {
    date: string
    kbzhu: DailyKBZHU | null
    plan: PlanKBZHU | null
    alerts: Alert[]
    food_entries: FoodEntryView[]
    water: WaterView | null
    steps: number
    workout: WorkoutView | null
}

interface WaterView {
    glasses: number
    goal: number
    glass_size: number
}

interface WorkoutView {
    completed: boolean
    type: string
    duration: number
}

interface PhotoView {
    id: string
    photo_url: string
    week_start: string
    week_end: string
    uploaded_at: string
}

interface ClientDetail extends ClientCard {
    days: DayDetail[]
    weekly_plan: PlanKBZHU | null
    weight_history: WeightHistoryPoint[]
    photos: PhotoView[]
}
```

### 6. Edge Cases

| Case | Handling |
|------|----------|
| No food entries for a day | Show "Нет записей" |
| No water log for a day | Don't show water line |
| No daily_metrics row | Steps=0, no workout |
| No photos | Hide photos section |
| Old `?date=` param | Returns 1-day array in `days` |

## Non-Goals

- Curator editing water/steps/workouts (read-only for now)
- Photo upload by curator
- Real-time updates
- Custom date range picker (future work)
