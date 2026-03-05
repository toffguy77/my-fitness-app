# Weight Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix weight saving bug, connect weight chart to real data, add target weight, and add weight info to curator views.

**Architecture:** Fix frontend request body to match backend SaveMetricRequest. Add backend endpoint for weight history/progress data. Add target_weight column to user_settings. Extend curator endpoints to include weight history and trend data.

**Tech Stack:** Go/Gin backend, Next.js/React frontend, PostgreSQL, Zustand, Tailwind CSS

---

### Task 1: Fix weight save bug in dashboardStore

**Files:**
- Modify: `apps/web/src/features/dashboard/store/dashboardStore.ts:1132`

**Step 1: Fix the API call body**

In `dashboardStore.ts`, line 1132, change:
```typescript
() => apiClient.post(url, { date, ...metric }),
```
to:
```typescript
() => apiClient.post(url, { date, metric }),
```

This wraps `metric` (which is `{ type, data }`) inside a `metric` key, matching the backend's `SaveMetricRequest` struct:
```go
type SaveMetricRequest struct {
    Date   string       `json:"date" binding:"required"`
    Metric MetricUpdate `json:"metric" binding:"required"`
}
```

**Step 2: Verify the fix compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add apps/web/src/features/dashboard/store/dashboardStore.ts
git commit -m "fix: wrap metric in correct request body structure for weight save"
```

---

### Task 2: Add backend endpoint for weight progress data

**Files:**
- Modify: `apps/api/internal/modules/dashboard/handler.go` (add GetProgress handler)
- Modify: `apps/api/internal/modules/dashboard/service.go` (add GetProgressData method)
- Modify: `apps/api/internal/modules/dashboard/types.go` (add ProgressData types)
- Modify: `apps/api/cmd/server/main.go` (register route)

**Step 1: Add types in types.go**

Add to end of `apps/api/internal/modules/dashboard/types.go`:
```go
// WeightTrendPoint represents a single weight data point
type WeightTrendPoint struct {
	Date   string  `json:"date"`
	Weight float64 `json:"weight"`
}

// ProgressData represents progress metrics for the dashboard
type ProgressData struct {
	WeightTrend          []WeightTrendPoint `json:"weight_trend"`
	NutritionAdherence   float64            `json:"nutrition_adherence"`
	TargetWeight         *float64           `json:"target_weight"`
}
```

**Step 2: Add service method in service.go**

Add `GetProgressData` method that:
1. Queries `daily_metrics` for weight entries in the last 8 weeks where `weight IS NOT NULL`, ordered by date ASC
2. Calculates nutrition adherence: count of days where calories > 0 vs total days in range, compared to active weekly plan
3. Fetches `target_weight` from `user_settings`
4. Returns `ProgressData`

SQL for weight trend:
```sql
SELECT date, weight FROM daily_metrics
WHERE user_id = $1 AND weight IS NOT NULL AND date >= $2
ORDER BY date ASC
```

SQL for target weight:
```sql
SELECT target_weight FROM user_settings WHERE user_id = $1
```

**Step 3: Add handler in handler.go**

Add `GetProgress` handler:
```go
func (h *Handler) GetProgress(c *gin.Context) {
    userIDInterface, exists := c.Get("user_id")
    if !exists {
        response.Unauthorized(c, "Пользователь не аутентифицирован")
        return
    }
    userID, ok := userIDInterface.(int64)
    if !ok {
        response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
        return
    }

    weeksStr := c.DefaultQuery("weeks", "8")
    weeks, err := strconv.Atoi(weeksStr)
    if err != nil || weeks < 1 || weeks > 52 {
        weeks = 8
    }

    data, err := h.service.GetProgressData(c.Request.Context(), userID, weeks)
    if err != nil {
        h.log.Errorw("Failed to get progress data", "error", err, "user_id", userID)
        response.InternalError(c, "Не удалось получить данные прогресса")
        return
    }

    response.Success(c, http.StatusOK, data)
}
```

**Step 4: Register route in main.go**

In `apps/api/cmd/server/main.go`, add inside the dashboard group (after line 316):
```go
dashGroup.GET("/progress", dashboardHandler.GetProgress)
```

**Step 5: Run backend tests**

Run: `cd apps/api && go build ./...`
Expected: Compiles successfully

**Step 6: Commit**

```bash
git add apps/api/internal/modules/dashboard/types.go apps/api/internal/modules/dashboard/service.go apps/api/internal/modules/dashboard/handler.go apps/api/cmd/server/main.go
git commit -m "feat: add GET /dashboard/progress endpoint for weight trend and nutrition adherence"
```

---

### Task 3: Connect ProgressSection to real API data

**Files:**
- Modify: `apps/web/src/features/dashboard/components/ProgressSection.tsx:321-347`

**Step 1: Replace mock data with real API call**

In `ProgressSection.tsx`, replace the `useEffect` (lines 321-347) that uses mock data:

```typescript
useEffect(() => {
    const fetchProgressData = async () => {
        setIsLoading(true)
        try {
            const url = `/backend-api/v1/dashboard/progress?weeks=8`
            const data = await apiClient.get<{
                weight_trend: Array<{ date: string; weight: number }>
                nutrition_adherence: number
                target_weight: number | null
            }>(url)

            setProgressData({
                weightTrend: (data.weight_trend || []).map(p => ({
                    date: new Date(p.date),
                    weight: p.weight,
                })),
                nutritionAdherence: data.nutrition_adherence || 0,
                achievements: [], // TODO: achievements endpoint later
            })
        } catch (error) {
            console.error('Failed to fetch progress data:', error)
            setProgressData(null)
        } finally {
            setIsLoading(false)
        }
    }

    fetchProgressData()
}, [])
```

Add import at top:
```typescript
import { apiClient } from '@/shared/utils/api-client'
```

**Step 2: Add target weight line to WeightTrendChart**

Update `ProgressSectionProps` and `WeightTrendChartProps` to accept optional `targetWeight`:

```typescript
interface WeightTrendChartProps {
    data: ProgressData['weightTrend']
    targetWeight?: number | null
    className?: string
}
```

In the SVG, add a dashed horizontal line at the target weight y-position:
```tsx
{targetWeight != null && (
    <line
        x1={padding.left}
        y1={padding.top + chartHeight - ((targetWeight - minWeight) / weightRange) * chartHeight}
        x2={width - padding.right}
        y2={padding.top + chartHeight - ((targetWeight - minWeight) / weightRange) * chartHeight}
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="6 3"
        className="text-green-500"
    />
)}
```

Also include `targetWeight` in the min/max calculation so the chart Y-axis accommodates it.

**Step 3: Pass targetWeight through from ProgressSection**

Store `targetWeight` in state alongside `progressData` and pass to `WeightTrendChart`.

**Step 4: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add apps/web/src/features/dashboard/components/ProgressSection.tsx
git commit -m "feat: connect ProgressSection weight chart to real API data with target weight line"
```

---

### Task 4: Add target_weight to database and user settings

**Files:**
- Create: `apps/api/migrations/021_add_target_weight_up.sql`
- Create: `apps/api/migrations/021_add_target_weight_down.sql`
- Modify: `apps/api/internal/modules/users/service.go` (Settings struct, GetProfile query, UpdateSettings query)
- Modify: `apps/api/internal/modules/users/handler.go` (UpdateSettingsRequest struct)

**Step 1: Create migration**

`apps/api/migrations/021_add_target_weight_up.sql`:
```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS target_weight DECIMAL(5,1);
COMMENT ON COLUMN user_settings.target_weight IS 'Target weight goal in kg (0.1-500), nullable';
```

`apps/api/migrations/021_add_target_weight_down.sql`:
```sql
ALTER TABLE user_settings DROP COLUMN IF EXISTS target_weight;
```

**Step 2: Update Settings struct**

In `apps/api/internal/modules/users/service.go`, add to `Settings` struct:
```go
TargetWeight *float64 `json:"target_weight"`
```

**Step 3: Update GetProfile query**

In `GetProfile`, extend the SELECT to include `s.target_weight` and add `&profile.Settings.TargetWeight` to the Scan call. Use `sql.NullFloat64` for scanning.

**Step 4: Update UpdateSettings**

In `service.go` `UpdateSettings`, add `target_weight` to the INSERT and ON CONFLICT DO UPDATE. Scan it back in RETURNING.

In `handler.go` `UpdateSettingsRequest`, add:
```go
TargetWeight *float64 `json:"target_weight"`
```

Pass it through to the service.

**Step 5: Run migration locally (or verify SQL compiles)**

Run: `cd apps/api && go build ./...`
Expected: Compiles

**Step 6: Commit**

```bash
git add apps/api/migrations/021_add_target_weight_up.sql apps/api/migrations/021_add_target_weight_down.sql apps/api/internal/modules/users/service.go apps/api/internal/modules/users/handler.go
git commit -m "feat: add target_weight column to user_settings with API support"
```

---

### Task 5: Add curator endpoint to set target weight

**Files:**
- Modify: `apps/api/internal/modules/curator/handler.go` (add SetTargetWeight handler)
- Modify: `apps/api/internal/modules/curator/service.go` (add SetTargetWeight method + ServiceInterface)
- Modify: `apps/api/cmd/server/main.go` (register route)

**Step 1: Add service method**

In `curator/service.go`, add:
```go
func (s *Service) SetTargetWeight(ctx context.Context, curatorID int64, clientID int64, targetWeight *float64) error {
    // Verify relationship
    var exists bool
    err := s.db.QueryRowContext(ctx,
        `SELECT EXISTS (SELECT 1 FROM curator_client_relationships WHERE curator_id = $1 AND client_id = $2 AND status = 'active')`,
        curatorID, clientID,
    ).Scan(&exists)
    if err != nil {
        return fmt.Errorf("failed to verify relationship: %w", err)
    }
    if !exists {
        return fmt.Errorf("unauthorized")
    }

    // Upsert target weight
    _, err = s.db.ExecContext(ctx,
        `INSERT INTO user_settings (user_id, target_weight, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET target_weight = $2, updated_at = NOW()`,
        clientID, targetWeight,
    )
    return err
}
```

Update `ServiceInterface` to include `SetTargetWeight`.

**Step 2: Add handler**

In `curator/handler.go`, add:
```go
type SetTargetWeightRequest struct {
    TargetWeight *float64 `json:"target_weight" binding:"omitempty,gt=0,lte=500"`
}

func (h *Handler) SetTargetWeight(c *gin.Context) {
    userID, ok := h.getUserID(c)
    if !ok { return }

    clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
    if err != nil {
        response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
        return
    }

    var req SetTargetWeightRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        response.Error(c, http.StatusBadRequest, "Неверные данные")
        return
    }

    if err := h.service.SetTargetWeight(c.Request.Context(), userID, clientID, req.TargetWeight); err != nil {
        if err.Error() == "unauthorized" {
            response.Forbidden(c, "Нет активной связи с данным клиентом")
            return
        }
        response.InternalError(c, "Не удалось обновить целевой вес")
        return
    }

    response.Success(c, http.StatusOK, gin.H{"message": "Целевой вес обновлён"})
}
```

**Step 3: Register route in main.go**

In curator group, add:
```go
curatorGroup.PUT("/clients/:id/target-weight", curatorHandler.SetTargetWeight)
```

**Step 4: Verify**

Run: `cd apps/api && go build ./...`

**Step 5: Commit**

```bash
git add apps/api/internal/modules/curator/handler.go apps/api/internal/modules/curator/service.go apps/api/cmd/server/main.go
git commit -m "feat: add PUT /curator/clients/:id/target-weight endpoint"
```

---

### Task 6: Extend curator client detail with weight history

**Files:**
- Modify: `apps/api/internal/modules/curator/types.go` (add weight_history, target_weight to ClientDetail)
- Modify: `apps/api/internal/modules/curator/service.go` (query weight history in GetClientDetail)

**Step 1: Update types**

In `curator/types.go`, add:
```go
type WeightHistoryPoint struct {
    Date   string  `json:"date"`
    Weight float64 `json:"weight"`
}
```

Add to `ClientDetail`:
```go
type ClientDetail struct {
    ClientCard
    FoodEntries    []FoodEntryView    `json:"food_entries"`
    WeeklyPlan     *PlanKBZHU         `json:"weekly_plan"`
    LastWeight     *float64           `json:"last_weight"`
    TargetWeight   *float64           `json:"target_weight"`
    WeightHistory  []WeightHistoryPoint `json:"weight_history"`
}
```

**Step 2: Query weight history in GetClientDetail**

In `service.go` `GetClientDetail`, after the existing last weight query (line ~294), add:
```go
// Get weight history (last 8 weeks)
historyQuery := `
    SELECT date, weight FROM daily_metrics
    WHERE user_id = $1 AND weight IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '56 days'
    ORDER BY date ASC
`
historyRows, err := s.db.QueryContext(ctx, historyQuery, clientID)
// ... scan into []WeightHistoryPoint

// Get target weight
var targetWeight sql.NullFloat64
_ = s.db.QueryRowContext(ctx,
    `SELECT target_weight FROM user_settings WHERE user_id = $1`, clientID,
).Scan(&targetWeight)
```

Assign to `detail.WeightHistory` and `detail.TargetWeight`.

**Step 3: Verify**

Run: `cd apps/api && go build ./...`

**Step 4: Commit**

```bash
git add apps/api/internal/modules/curator/types.go apps/api/internal/modules/curator/service.go
git commit -m "feat: add weight_history and target_weight to curator client detail response"
```

---

### Task 7: Extend curator client list with weight info

**Files:**
- Modify: `apps/api/internal/modules/curator/types.go` (add fields to ClientCard)
- Modify: `apps/api/internal/modules/curator/service.go` (query weight data in GetClients)

**Step 1: Update ClientCard type**

Add to `ClientCard` struct:
```go
LastWeight   *float64 `json:"last_weight"`
WeightTrend  string   `json:"weight_trend"` // "up", "down", "stable", ""
TargetWeight *float64 `json:"target_weight"`
```

**Step 2: Add weight data query in GetClients**

After the main client query, add a batch query for weight info per client:
```sql
SELECT DISTINCT ON (user_id)
    user_id, weight, date
FROM daily_metrics
WHERE user_id = ANY($1) AND weight IS NOT NULL
ORDER BY user_id, date DESC
```

And a similar query for the second-to-last weight to compute trend.

Also batch-query target_weight from user_settings:
```sql
SELECT user_id, target_weight FROM user_settings WHERE user_id = ANY($1) AND target_weight IS NOT NULL
```

Compute trend: if last_weight > prev_weight → "up", if less → "down", else "stable".

**Step 3: Verify**

Run: `cd apps/api && go build ./...`

**Step 4: Commit**

```bash
git add apps/api/internal/modules/curator/types.go apps/api/internal/modules/curator/service.go
git commit -m "feat: add last_weight, weight_trend, target_weight to curator clients list"
```

---

### Task 8: Update curator frontend types

**Files:**
- Modify: `apps/web/src/features/curator/types/index.ts`

**Step 1: Update types**

Add to `ClientCard`:
```typescript
last_weight: number | null
weight_trend: 'up' | 'down' | 'stable' | ''
target_weight: number | null
```

Add to `ClientDetail`:
```typescript
target_weight: number | null
weight_history: Array<{ date: string; weight: number }>
```

**Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/features/curator/types/index.ts
git commit -m "feat: add weight fields to curator frontend types"
```

---

### Task 9: Add weight info to ClientCard component

**Files:**
- Modify: `apps/web/src/features/curator/components/ClientCard.tsx`

**Step 1: Add weight display after KBZHU section**

After the KBZHU progress section (around line 80), before the alerts section, add:
```tsx
{client.last_weight != null && (
    <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-gray-600">
            Вес: <span className="font-semibold text-gray-900">{client.last_weight} кг</span>
        </span>
        <div className="flex items-center gap-1">
            {client.weight_trend === 'down' && (
                <span className="text-green-600 font-medium flex items-center gap-0.5">
                    <TrendingDown className="h-3 w-3" /> Снижение
                </span>
            )}
            {client.weight_trend === 'up' && (
                <span className="text-orange-600 font-medium flex items-center gap-0.5">
                    <TrendingUp className="h-3 w-3" /> Рост
                </span>
            )}
            {client.weight_trend === 'stable' && (
                <span className="text-gray-500 font-medium">Стабильно</span>
            )}
        </div>
    </div>
)}
{client.target_weight != null && client.last_weight != null && (
    <div className="mt-1 text-xs text-gray-500">
        Цель: {client.target_weight} кг (осталось {Math.abs(client.last_weight - client.target_weight).toFixed(1)} кг)
    </div>
)}
```

Import `TrendingUp`, `TrendingDown` from `lucide-react`.

**Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/features/curator/components/ClientCard.tsx
git commit -m "feat: display weight, trend, and target on curator client cards"
```

---

### Task 10: Add weight chart to curator client detail page

**Files:**
- Modify: `apps/web/src/app/curator/clients/[id]/page.tsx`

**Step 1: Add weight dynamics section**

Replace the existing "Last weight" section (lines 218-224) with a full weight chart section:

```tsx
{/* Weight dynamics */}
{(detail.weight_history?.length > 0 || detail.last_weight != null) && (
    <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Динамика веса</h2>

        {detail.weight_history && detail.weight_history.length >= 2 ? (
            <CuratorWeightChart
                data={detail.weight_history}
                targetWeight={detail.target_weight}
            />
        ) : detail.last_weight != null ? (
            <p className="text-lg font-semibold text-gray-900">{detail.last_weight} кг</p>
        ) : null}

        {detail.target_weight != null && detail.last_weight != null && (
            <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-gray-600">
                    Цель: <span className="font-semibold">{detail.target_weight} кг</span>
                </span>
                <span className="text-gray-600">
                    Осталось: <span className="font-semibold">{Math.abs(detail.last_weight - detail.target_weight).toFixed(1)} кг</span>
                </span>
            </div>
        )}
    </section>
)}
```

**Step 2: Create CuratorWeightChart component inline or extract**

Reuse the same SVG chart pattern from `WeightTrendChart` in `ProgressSection.tsx`. Create it as a simple inline component in the same file or as a separate component. The chart should:
- Accept `data: Array<{ date: string; weight: number }>` and `targetWeight: number | null`
- Render an SVG line chart (same approach as `WeightTrendChart`)
- Show target weight as a dashed green line
- Show weight change summary below

**Step 3: Add curator API method for setting target weight**

In `apps/web/src/features/curator/api/curatorApi.ts`, add:
```typescript
setTargetWeight: (clientId: number, targetWeight: number | null) =>
    apiClient.put<void>(`${BASE}/clients/${clientId}/target-weight`, { target_weight: targetWeight }),
```

**Step 4: Add target weight edit UI (optional)**

Add a small edit button next to target weight that opens an inline input for the curator to set/update target weight.

**Step 5: Verify**

Run: `cd apps/web && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add apps/web/src/app/curator/clients/[id]/page.tsx apps/web/src/features/curator/api/curatorApi.ts
git commit -m "feat: add weight dynamics chart and target weight to curator client detail page"
```

---

### Task 11: Final verification

**Step 1: Run all frontend checks**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`

**Step 2: Run backend build**

Run: `cd apps/api && go build ./... && go vet ./...`

**Step 3: Run frontend tests**

Run: `cd apps/web && npx jest --passWithNoTests`

**Step 4: Run backend tests**

Run: `cd apps/api && go test ./...`

**Step 5: Commit any fixes from linting/testing**

---

## Summary of changes

| Area | Files | What |
|------|-------|------|
| Bug fix | `dashboardStore.ts` | Wrap metric in `{ date, metric }` |
| Backend progress endpoint | `dashboard/handler.go`, `service.go`, `types.go`, `main.go` | New GET /dashboard/progress |
| Frontend chart | `ProgressSection.tsx` | Replace mock data with real API call |
| Target weight DB | `migrations/021_*` | Add target_weight to user_settings |
| Target weight API | `users/service.go`, `handler.go` | Extend settings to include target_weight |
| Curator set target | `curator/handler.go`, `service.go`, `main.go` | New PUT /curator/clients/:id/target-weight |
| Curator detail | `curator/types.go`, `service.go` | Add weight_history + target_weight to response |
| Curator list | `curator/types.go`, `service.go` | Add last_weight + trend + target to client cards |
| Curator frontend types | `curator/types/index.ts` | Add weight fields |
| Curator ClientCard | `ClientCard.tsx` | Show weight, trend, target |
| Curator detail page | `clients/[id]/page.tsx`, `curatorApi.ts` | Weight chart + target weight UI |
