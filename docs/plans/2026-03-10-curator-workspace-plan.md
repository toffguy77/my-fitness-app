# Curator Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a comprehensive curator workspace with analytics hub, weekly plan management, structured tasks, feedback system, and performance benchmarks.

**Architecture:** Extend existing curator module (backend Go/Gin, frontend Next.js/React) with new endpoints, DB tables, and UI components. Hub + Detail pattern: analytics dashboard at `/curator`, expanded client card with tabs at `/curator/clients/:id`.

**Tech Stack:** Go 1.26 / Gin / PostgreSQL (pgx/v5) backend; Next.js 16 / React 19 / TypeScript / Tailwind v4 / Zustand / Recharts frontend.

**Design doc:** `docs/plans/2026-03-10-curator-workspace-design.md`

---

## Phase 1: Database Migrations

### Task 1: Migration — Extend tasks table and create task_completions

**Files:**
- Create: `apps/api/migrations/039_extend_tasks_and_completions_up.sql`
- Create: `apps/api/migrations/039_extend_tasks_and_completions_down.sql`

**Step 1: Write up migration**

```sql
-- Extend tasks table with type, recurrence
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'habit';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20) NOT NULL DEFAULT 'once';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_days INTEGER[];

-- Validate type values
ALTER TABLE tasks ADD CONSTRAINT chk_task_type
  CHECK (type IN ('nutrition', 'workout', 'habit', 'measurement'));

-- Validate recurrence values
ALTER TABLE tasks ADD CONSTRAINT chk_task_recurrence
  CHECK (recurrence IN ('once', 'daily', 'weekly'));

-- Task completions for recurring tasks
CREATE TABLE IF NOT EXISTS task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, completed_date)
);

CREATE INDEX IF NOT EXISTS idx_task_completions_task_id ON task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(completed_date);
```

**Step 2: Write down migration**

```sql
DROP TABLE IF EXISTS task_completions;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_task_recurrence;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_task_type;
ALTER TABLE tasks DROP COLUMN IF EXISTS recurrence_days;
ALTER TABLE tasks DROP COLUMN IF EXISTS recurrence;
ALTER TABLE tasks DROP COLUMN IF EXISTS type;
```

**Step 3: Run migration**

Run: `cd apps/api && go run cmd/migrate/main.go up`
Expected: Migration 039 applied successfully.

**Step 4: Commit**

```bash
git add apps/api/migrations/039_*
git commit -m "feat(db): extend tasks with type/recurrence and add task_completions table"
```

---

### Task 2: Migration — Extend weekly_reports curator_feedback to JSONB

**Files:**
- Create: `apps/api/migrations/040_weekly_reports_feedback_jsonb_up.sql`
- Create: `apps/api/migrations/040_weekly_reports_feedback_jsonb_down.sql`

**Step 1: Write up migration**

```sql
-- Convert curator_feedback from TEXT to JSONB
ALTER TABLE weekly_reports
  ALTER COLUMN curator_feedback TYPE JSONB USING
    CASE
      WHEN curator_feedback IS NULL THEN NULL
      WHEN curator_feedback = '' THEN NULL
      ELSE jsonb_build_object('summary', curator_feedback)
    END;
```

**Step 2: Write down migration**

```sql
ALTER TABLE weekly_reports
  ALTER COLUMN curator_feedback TYPE TEXT USING
    CASE
      WHEN curator_feedback IS NULL THEN NULL
      ELSE curator_feedback->>'summary'
    END;
```

**Step 3: Run migration and commit**

Run: `cd apps/api && go run cmd/migrate/main.go up`

```bash
git add apps/api/migrations/040_*
git commit -m "feat(db): convert weekly_reports.curator_feedback to JSONB"
```

---

### Task 3: Migration — Curator analytics snapshot tables

**Files:**
- Create: `apps/api/migrations/041_curator_analytics_snapshots_up.sql`
- Create: `apps/api/migrations/041_curator_analytics_snapshots_down.sql`

**Step 1: Write up migration**

```sql
CREATE TABLE IF NOT EXISTS curator_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_clients INTEGER NOT NULL DEFAULT 0,
  attention_clients INTEGER NOT NULL DEFAULT 0,
  avg_kbzhu_percent NUMERIC(5,1) NOT NULL DEFAULT 0,
  total_unread INTEGER NOT NULL DEFAULT 0,
  active_tasks INTEGER NOT NULL DEFAULT 0,
  overdue_tasks INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  avg_client_streak NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(curator_id, date)
);

CREATE INDEX IF NOT EXISTS idx_curator_daily_snap_curator ON curator_daily_snapshots(curator_id);
CREATE INDEX IF NOT EXISTS idx_curator_daily_snap_date ON curator_daily_snapshots(date);

CREATE TABLE IF NOT EXISTS curator_weekly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  avg_kbzhu_percent NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_response_time_hours NUMERIC(5,1) NOT NULL DEFAULT 0,
  clients_with_feedback INTEGER NOT NULL DEFAULT 0,
  clients_total INTEGER NOT NULL DEFAULT 0,
  task_completion_rate NUMERIC(5,1) NOT NULL DEFAULT 0,
  clients_on_track INTEGER NOT NULL DEFAULT 0,
  clients_off_track INTEGER NOT NULL DEFAULT 0,
  avg_client_streak NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(curator_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_curator_weekly_snap_curator ON curator_weekly_snapshots(curator_id);

CREATE TABLE IF NOT EXISTS platform_weekly_benchmarks (
  week_start DATE PRIMARY KEY,
  avg_kbzhu_percent NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_response_time_hours NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_task_completion_rate NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_feedback_rate NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_client_streak NUMERIC(5,1) NOT NULL DEFAULT 0,
  curator_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Step 2: Write down migration**

```sql
DROP TABLE IF EXISTS platform_weekly_benchmarks;
DROP TABLE IF EXISTS curator_weekly_snapshots;
DROP TABLE IF EXISTS curator_daily_snapshots;
```

**Step 3: Run migration and commit**

Run: `cd apps/api && go run cmd/migrate/main.go up`

```bash
git add apps/api/migrations/041_*
git commit -m "feat(db): add curator analytics snapshot and benchmark tables"
```

---

## Phase 2: Backend — Weekly Plans CRUD

### Task 4: Backend types for weekly plans in curator module

**Files:**
- Modify: `apps/api/internal/modules/curator/types.go`

**Step 1: Add weekly plan request/response types**

Add to `types.go`:

```go
// Weekly plan management
type CreateWeeklyPlanRequest struct {
	Calories float64 `json:"calories" binding:"required,gt=0"`
	Protein  float64 `json:"protein" binding:"required,gte=0"`
	Fat      float64 `json:"fat" binding:"required,gte=0"`
	Carbs    float64 `json:"carbs" binding:"required,gte=0"`
	StartDate string `json:"start_date" binding:"required"`
	EndDate   string `json:"end_date" binding:"required"`
	Comment   string `json:"comment"`
}

type UpdateWeeklyPlanRequest struct {
	Calories *float64 `json:"calories"`
	Protein  *float64 `json:"protein"`
	Fat      *float64 `json:"fat"`
	Carbs    *float64 `json:"carbs"`
	Comment  *string  `json:"comment"`
}

type WeeklyPlanView struct {
	ID        string   `json:"id"`
	Calories  float64  `json:"calories"`
	Protein   float64  `json:"protein"`
	Fat       float64  `json:"fat"`
	Carbs     float64  `json:"carbs"`
	StartDate string   `json:"start_date"`
	EndDate   string   `json:"end_date"`
	Comment   string   `json:"comment,omitempty"`
	IsActive  bool     `json:"is_active"`
	CreatedAt string   `json:"created_at"`
}
```

**Step 2: Commit**

```bash
git add apps/api/internal/modules/curator/types.go
git commit -m "feat(curator): add weekly plan request/response types"
```

---

### Task 5: Backend service methods for weekly plans

**Files:**
- Modify: `apps/api/internal/modules/curator/service.go`

**Step 1: Add service interface methods**

Add to `ServiceInterface`:

```go
CreateWeeklyPlan(ctx context.Context, curatorID, clientID int64, req CreateWeeklyPlanRequest) (*WeeklyPlanView, error)
UpdateWeeklyPlan(ctx context.Context, curatorID, clientID int64, planID string, req UpdateWeeklyPlanRequest) (*WeeklyPlanView, error)
DeleteWeeklyPlan(ctx context.Context, curatorID, clientID int64, planID string) error
GetWeeklyPlans(ctx context.Context, curatorID, clientID int64) ([]WeeklyPlanView, error)
```

**Step 2: Implement CreateWeeklyPlan**

Follow existing pattern from `SetTargetWeight`:
1. Verify active curator-client relationship (reuse existing verification query)
2. Deactivate existing active plans: `UPDATE weekly_plans SET is_active = false WHERE user_id = $1 AND is_active = true`
3. Insert new plan: `INSERT INTO weekly_plans (user_id, curator_id, calories_goal, protein_goal, fat_goal, carbs_goal, start_date, end_date, comment, is_active, created_by) VALUES (...) RETURNING id, created_at`
4. Return `WeeklyPlanView`

**Step 3: Implement UpdateWeeklyPlan**

1. Verify relationship
2. Update only non-nil fields: build dynamic SET clause
3. Return updated plan

**Step 4: Implement DeleteWeeklyPlan**

1. Verify relationship
2. `DELETE FROM weekly_plans WHERE id = $1 AND curator_id = $2`

**Step 5: Implement GetWeeklyPlans**

1. Verify relationship
2. `SELECT ... FROM weekly_plans WHERE user_id = $1 ORDER BY start_date DESC LIMIT 20`

**Step 6: Write tests**

File: `apps/api/internal/modules/curator/service_test.go`

Add tests for each method using existing sqlmock pattern:
- `TestCreateWeeklyPlan_Success`
- `TestCreateWeeklyPlan_UnauthorizedRelationship`
- `TestUpdateWeeklyPlan_Success`
- `TestDeleteWeeklyPlan_Success`
- `TestGetWeeklyPlans_Success`

**Step 7: Run tests**

Run: `cd apps/api && go test ./internal/modules/curator/ -v -run "WeeklyPlan"`
Expected: All tests pass.

**Step 8: Commit**

```bash
git add apps/api/internal/modules/curator/service.go apps/api/internal/modules/curator/service_test.go
git commit -m "feat(curator): add weekly plan CRUD service methods with tests"
```

---

### Task 6: Backend handlers for weekly plans

**Files:**
- Modify: `apps/api/internal/modules/curator/handler.go`
- Modify: `apps/api/cmd/server/main.go`

**Step 1: Add handler methods**

Add `CreateWeeklyPlan`, `UpdateWeeklyPlan`, `DeleteWeeklyPlan`, `GetWeeklyPlans` handlers following existing `SetTargetWeight` pattern:
- Extract `userID` via `getUserID(c)`
- Parse `clientID` from URL param `:id`
- Bind JSON request body
- Call service method
- Return `response.Success(c, result)` or error

**Step 2: Register routes in main.go**

Add to `curatorGroup`:

```go
curatorGroup.POST("/clients/:id/weekly-plan", curatorHandler.CreateWeeklyPlan)
curatorGroup.PUT("/clients/:id/weekly-plan/:planId", curatorHandler.UpdateWeeklyPlan)
curatorGroup.DELETE("/clients/:id/weekly-plan/:planId", curatorHandler.DeleteWeeklyPlan)
curatorGroup.GET("/clients/:id/weekly-plans", curatorHandler.GetWeeklyPlans)
```

**Step 3: Write handler tests**

File: `apps/api/internal/modules/curator/handler_test.go`

Add tests using existing gin test context pattern.

**Step 4: Run tests**

Run: `cd apps/api && go test ./internal/modules/curator/ -v`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add apps/api/internal/modules/curator/handler.go apps/api/internal/modules/curator/handler_test.go apps/api/cmd/server/main.go
git commit -m "feat(curator): add weekly plan CRUD handlers and routes"
```

---

## Phase 3: Backend — Tasks CRUD

### Task 7: Backend types for structured tasks

**Files:**
- Modify: `apps/api/internal/modules/curator/types.go`

**Step 1: Add task types**

```go
type CreateTaskRequest struct {
	Title       string `json:"title" binding:"required,max=200"`
	Type        string `json:"type" binding:"required,oneof=nutrition workout habit measurement"`
	Description string `json:"description"`
	Deadline    string `json:"deadline" binding:"required"`
	Recurrence  string `json:"recurrence" binding:"required,oneof=once daily weekly"`
	RecurrenceDays []int `json:"recurrence_days,omitempty"`
}

type UpdateTaskRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Deadline    *string `json:"deadline"`
	Status      *string `json:"status"`
}

type TaskView struct {
	ID             string   `json:"id"`
	Title          string   `json:"title"`
	Type           string   `json:"type"`
	Description    string   `json:"description,omitempty"`
	Deadline       string   `json:"deadline"`
	Recurrence     string   `json:"recurrence"`
	RecurrenceDays []int    `json:"recurrence_days,omitempty"`
	Status         string   `json:"status"`
	Completions    []string `json:"completions,omitempty"`
	CreatedAt      string   `json:"created_at"`
}
```

**Step 2: Commit**

```bash
git add apps/api/internal/modules/curator/types.go
git commit -m "feat(curator): add structured task types"
```

---

### Task 8: Backend service and handlers for tasks

**Files:**
- Modify: `apps/api/internal/modules/curator/service.go`
- Modify: `apps/api/internal/modules/curator/handler.go`
- Modify: `apps/api/cmd/server/main.go`

**Step 1: Add service interface methods**

```go
CreateTask(ctx context.Context, curatorID, clientID int64, req CreateTaskRequest) (*TaskView, error)
UpdateTask(ctx context.Context, curatorID, clientID int64, taskID string, req UpdateTaskRequest) (*TaskView, error)
DeleteTask(ctx context.Context, curatorID, clientID int64, taskID string) error
GetTasks(ctx context.Context, curatorID, clientID int64, status string) ([]TaskView, error)
```

**Step 2: Implement service methods**

`CreateTask`:
1. Verify relationship
2. `INSERT INTO tasks (user_id, curator_id, title, description, type, recurrence, recurrence_days, due_date, status) VALUES (...) RETURNING id, created_at`

`GetTasks`:
1. Verify relationship
2. Query tasks with optional status filter
3. For recurring tasks: LEFT JOIN task_completions to get completion dates
4. Compute status: if `due_date < NOW()` and no completion → `overdue`; if completed → `completed`; else `active`

`UpdateTask`:
1. Verify relationship
2. Dynamic SET clause for non-nil fields

`DeleteTask`:
1. Verify relationship
2. `DELETE FROM tasks WHERE id = $1 AND curator_id = $2`

**Step 3: Add handlers**

Follow existing handler pattern. Register routes:

```go
curatorGroup.POST("/clients/:id/tasks", curatorHandler.CreateTask)
curatorGroup.PUT("/clients/:id/tasks/:taskId", curatorHandler.UpdateTask)
curatorGroup.DELETE("/clients/:id/tasks/:taskId", curatorHandler.DeleteTask)
curatorGroup.GET("/clients/:id/tasks", curatorHandler.GetTasks)
```

**Step 4: Write tests**

Add service and handler tests for all task methods.

**Step 5: Run tests**

Run: `cd apps/api && go test ./internal/modules/curator/ -v`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add apps/api/internal/modules/curator/service.go apps/api/internal/modules/curator/handler.go apps/api/internal/modules/curator/service_test.go apps/api/internal/modules/curator/handler_test.go apps/api/cmd/server/main.go
git commit -m "feat(curator): add structured task CRUD with recurrence support"
```

---

## Phase 4: Backend — Weekly Report Feedback

### Task 9: Backend service and handlers for feedback

**Files:**
- Modify: `apps/api/internal/modules/curator/types.go`
- Modify: `apps/api/internal/modules/curator/service.go`
- Modify: `apps/api/internal/modules/curator/handler.go`
- Modify: `apps/api/cmd/server/main.go`

**Step 1: Add feedback types**

```go
type CategoryRating struct {
	Rating  string `json:"rating" binding:"required,oneof=excellent good needs_improvement"`
	Comment string `json:"comment"`
}

type SubmitFeedbackRequest struct {
	Nutrition       *CategoryRating `json:"nutrition"`
	Activity        *CategoryRating `json:"activity"`
	Water           *CategoryRating `json:"water"`
	PhotoUploaded   *bool           `json:"photo_uploaded"`
	Summary         string          `json:"summary" binding:"required"`
	Recommendations string          `json:"recommendations"`
}

type WeeklyReportView struct {
	ID              string          `json:"id"`
	WeekStart       string          `json:"week_start"`
	WeekEnd         string          `json:"week_end"`
	Summary         json.RawMessage `json:"summary"`
	SubmittedAt     string          `json:"submitted_at"`
	CuratorFeedback json.RawMessage `json:"curator_feedback,omitempty"`
	HasFeedback     bool            `json:"has_feedback"`
}
```

**Step 2: Implement service methods**

`SubmitFeedback`:
1. Verify relationship
2. Marshal `SubmitFeedbackRequest` to JSON
3. `UPDATE weekly_reports SET curator_feedback = $1, reviewed_at = NOW() WHERE id = $2 AND curator_id = $3`

`GetWeeklyReports`:
1. Verify relationship
2. `SELECT ... FROM weekly_reports WHERE user_id = $1 ORDER BY week_start DESC LIMIT 20`
3. Set `has_feedback = curator_feedback IS NOT NULL`

**Step 3: Add handlers and routes**

```go
curatorGroup.PUT("/clients/:id/weekly-reports/:reportId/feedback", curatorHandler.SubmitFeedback)
curatorGroup.GET("/clients/:id/weekly-reports", curatorHandler.GetWeeklyReports)
```

**Step 4: Write tests and run**

Run: `cd apps/api && go test ./internal/modules/curator/ -v`

**Step 5: Commit**

```bash
git add apps/api/internal/modules/curator/*.go apps/api/cmd/server/main.go
git commit -m "feat(curator): add weekly report feedback with structured ratings"
```

---

## Phase 5: Backend — Analytics Hub

### Task 10: Backend types and service for analytics

**Files:**
- Modify: `apps/api/internal/modules/curator/types.go`
- Modify: `apps/api/internal/modules/curator/service.go`

**Step 1: Add analytics types**

```go
type AnalyticsSummary struct {
	TotalClients     int     `json:"total_clients"`
	AttentionClients int     `json:"attention_clients"`
	AvgKBZHUPercent  float64 `json:"avg_kbzhu_percent"`
	TotalUnread      int     `json:"total_unread"`
	ClientsWaiting   int     `json:"clients_waiting"`
	ActiveTasks      int     `json:"active_tasks"`
	OverdueTasks     int     `json:"overdue_tasks"`
	CompletedToday   int     `json:"completed_today"`
}

type AttentionItem struct {
	ClientID     int64  `json:"client_id"`
	ClientName   string `json:"client_name"`
	ClientAvatar string `json:"client_avatar,omitempty"`
	Reason       string `json:"reason"`
	Detail       string `json:"detail"`
	Priority     int    `json:"priority"`
	ActionURL    string `json:"action_url"`
}
```

**Step 2: Implement GetAnalytics service method**

1. Count total clients from `curator_client_relationships WHERE curator_id = $1 AND status = 'active'`
2. Count attention clients (with red/yellow alerts — reuse existing alert logic from `GetClients`)
3. Compute avg KBZHU %: `AVG(CASE WHEN plan_calories > 0 THEN (actual_calories / plan_calories * 100) ELSE NULL END)` across clients for current week
4. Count unread messages and clients with unread (reuse `getUnreadCounts` helper)
5. Count active/overdue/completed-today tasks from `tasks` table

**Step 3: Implement GetAttentionList service method**

Build priority list by querying:
1. Red alerts (from today's KBZHU vs plan)
2. Overdue tasks (`due_date < CURRENT_DATE AND status = 'active'`)
3. Inactive clients (`last food_entry date < CURRENT_DATE - 2`)
4. Unread messages
5. Reports without feedback (`curator_feedback IS NULL AND submitted_at IS NOT NULL`)

Sort by priority, limit 20.

**Step 4: Write tests**

**Step 5: Run tests**

Run: `cd apps/api && go test ./internal/modules/curator/ -v -run "Analytics|Attention"`

**Step 6: Commit**

```bash
git add apps/api/internal/modules/curator/types.go apps/api/internal/modules/curator/service.go apps/api/internal/modules/curator/service_test.go
git commit -m "feat(curator): add analytics summary and attention list service"
```

---

### Task 11: Backend handlers for analytics and extended client list

**Files:**
- Modify: `apps/api/internal/modules/curator/handler.go`
- Modify: `apps/api/internal/modules/curator/service.go`
- Modify: `apps/api/cmd/server/main.go`

**Step 1: Add analytics handlers**

```go
func (h *Handler) GetAnalytics(c *gin.Context) { ... }
func (h *Handler) GetAttentionList(c *gin.Context) { ... }
```

**Step 2: Register routes**

```go
curatorGroup.GET("/analytics", curatorHandler.GetAnalytics)
curatorGroup.GET("/attention", curatorHandler.GetAttentionList)
```

**Step 3: Extend GetClients response**

Add to `ClientCard` type:

```go
WeeklyKBZHUPercent  *float64 `json:"weekly_kbzhu_percent,omitempty"`
ActiveTasksCount    int      `json:"active_tasks_count"`
OverdueTasksCount   int      `json:"overdue_tasks_count"`
LastActivityDate    *string  `json:"last_activity_date,omitempty"`
StreakDays          int      `json:"streak_days"`
```

Update `GetClients` service to compute these additional fields using batch queries (same pattern as existing `getUnreadCounts`, `getWeightData` helpers).

**Step 4: Write tests and run**

Run: `cd apps/api && go test ./internal/modules/curator/ -v`

**Step 5: Commit**

```bash
git add apps/api/internal/modules/curator/*.go apps/api/cmd/server/main.go
git commit -m "feat(curator): add analytics/attention handlers and extend client list"
```

---

## Phase 6: Backend — Snapshots & Benchmarks

### Task 12: Backend snapshot collection service

**Files:**
- Create: `apps/api/internal/modules/curator/snapshots.go`
- Modify: `apps/api/internal/modules/curator/types.go`
- Modify: `apps/api/internal/modules/curator/handler.go`
- Modify: `apps/api/cmd/server/main.go`

**Step 1: Add snapshot types**

```go
type DailySnapshot struct {
	Date             string  `json:"date"`
	TotalClients     int     `json:"total_clients"`
	AttentionClients int     `json:"attention_clients"`
	AvgKBZHUPercent  float64 `json:"avg_kbzhu_percent"`
	TotalUnread      int     `json:"total_unread"`
	ActiveTasks      int     `json:"active_tasks"`
	OverdueTasks     int     `json:"overdue_tasks"`
	CompletedTasks   int     `json:"completed_tasks"`
	AvgClientStreak  float64 `json:"avg_client_streak"`
}

type WeeklySnapshot struct {
	WeekStart            string  `json:"week_start"`
	AvgKBZHUPercent      float64 `json:"avg_kbzhu_percent"`
	AvgResponseTimeHours float64 `json:"avg_response_time_hours"`
	ClientsWithFeedback  int     `json:"clients_with_feedback"`
	ClientsTotal         int     `json:"clients_total"`
	TaskCompletionRate   float64 `json:"task_completion_rate"`
	ClientsOnTrack       int     `json:"clients_on_track"`
	ClientsOffTrack      int     `json:"clients_off_track"`
	AvgClientStreak      float64 `json:"avg_client_streak"`
}

type BenchmarkData struct {
	OwnSnapshots       []WeeklySnapshot    `json:"own_snapshots"`
	PlatformBenchmarks []PlatformBenchmark `json:"platform_benchmarks"`
}

type PlatformBenchmark struct {
	WeekStart            string  `json:"week_start"`
	AvgKBZHUPercent      float64 `json:"avg_kbzhu_percent"`
	AvgResponseTimeHours float64 `json:"avg_response_time_hours"`
	AvgTaskCompletionRate float64 `json:"avg_task_completion_rate"`
	AvgFeedbackRate      float64 `json:"avg_feedback_rate"`
	AvgClientStreak      float64 `json:"avg_client_streak"`
	CuratorCount         int     `json:"curator_count"`
}
```

**Step 2: Implement snapshot collection in `snapshots.go`**

`CollectDailySnapshot(ctx, curatorID)`:
- Reuse analytics computation logic from `GetAnalytics`
- `INSERT INTO curator_daily_snapshots (...) VALUES (...) ON CONFLICT (curator_id, date) DO UPDATE SET ...`

`CollectWeeklySnapshots(ctx)` (runs for all curators):
- For each curator with active clients:
  - Compute avg KBZHU % for past week
  - Compute avg response time: `AVG(first_response_time)` from messages
  - Count clients with feedback this week
  - Compute task completion rate
  - Count on-track/off-track clients
- Insert into `curator_weekly_snapshots`
- Compute and insert `platform_weekly_benchmarks` (averages across all curators)

**Step 3: Add history/benchmark handlers**

```go
func (h *Handler) GetAnalyticsHistory(c *gin.Context) { ... }  // ?period=daily&days=30 | ?period=weekly&weeks=12
func (h *Handler) GetBenchmark(c *gin.Context) { ... }          // ?weeks=12
```

Routes:
```go
curatorGroup.GET("/analytics/history", curatorHandler.GetAnalyticsHistory)
curatorGroup.GET("/analytics/benchmark", curatorHandler.GetBenchmark)
```

**Step 4: Register daily snapshot in main.go startup**

Add a goroutine in `main.go` that runs nightly snapshot collection using `time.Ticker` or integrate with existing cron mechanism if present.

**Step 5: Write tests and run**

Run: `cd apps/api && go test ./internal/modules/curator/ -v -run "Snapshot|Benchmark"`

**Step 6: Commit**

```bash
git add apps/api/internal/modules/curator/*.go apps/api/cmd/server/main.go
git commit -m "feat(curator): add analytics snapshot collection and benchmark endpoints"
```

---

## Phase 7: Backend — Client-Side Endpoints

### Task 13: Dashboard endpoints for tasks and feedback

**Files:**
- Modify: `apps/api/internal/modules/dashboard/handler.go`
- Modify: `apps/api/internal/modules/dashboard/service.go`
- Modify: `apps/api/internal/modules/dashboard/types.go`
- Modify: `apps/api/cmd/server/main.go`

**Step 1: Add client task types**

In `types.go`:

```go
type ClientTaskView struct {
	ID             string   `json:"id"`
	Title          string   `json:"title"`
	Type           string   `json:"type"`
	Description    string   `json:"description,omitempty"`
	Deadline       string   `json:"deadline"`
	Recurrence     string   `json:"recurrence"`
	RecurrenceDays []int    `json:"recurrence_days,omitempty"`
	Status         string   `json:"status"`
	Completions    []string `json:"completions,omitempty"`
}

type FeedbackView struct {
	Nutrition       *CategoryRatingView `json:"nutrition,omitempty"`
	Activity        *CategoryRatingView `json:"activity,omitempty"`
	Water           *CategoryRatingView `json:"water,omitempty"`
	PhotoUploaded   *bool               `json:"photo_uploaded,omitempty"`
	Summary         string              `json:"summary"`
	Recommendations string              `json:"recommendations,omitempty"`
}

type CategoryRatingView struct {
	Rating  string `json:"rating"`
	Comment string `json:"comment,omitempty"`
}
```

**Step 2: Implement service methods**

`GetClientTasks(ctx, userID)`:
- `SELECT ... FROM tasks WHERE user_id = $1 AND status = 'active' ORDER BY due_date`
- LEFT JOIN task_completions for recurring tasks

`CompleteTask(ctx, userID, taskID)`:
- For `once` recurrence: `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = $1 AND user_id = $2`
- For `daily`/`weekly`: `INSERT INTO task_completions (task_id, completed_date) VALUES ($1, CURRENT_DATE) ON CONFLICT DO NOTHING`

`GetReportFeedback(ctx, userID, reportID)`:
- `SELECT curator_feedback FROM weekly_reports WHERE id = $1 AND user_id = $2`
- Unmarshal JSONB into `FeedbackView`

**Step 3: Add handlers and routes**

Existing dashboard group pattern — add:

```go
dashboardGroup.GET("/tasks", dashboardHandler.GetClientTasks)
dashboardGroup.PUT("/tasks/:taskId/complete", dashboardHandler.CompleteTask)
dashboardGroup.GET("/weekly-reports/:reportId/feedback", dashboardHandler.GetReportFeedback)
```

**Step 4: Write tests and run**

Run: `cd apps/api && go test ./internal/modules/dashboard/ -v -run "ClientTask|Feedback"`

**Step 5: Commit**

```bash
git add apps/api/internal/modules/dashboard/*.go apps/api/cmd/server/main.go
git commit -m "feat(dashboard): add client-facing task completion and feedback endpoints"
```

---

## Phase 8: Backend — Notifications

### Task 14: Add new notification types

**Files:**
- Modify: `apps/api/internal/modules/notifications/types.go`
- Modify: `apps/api/internal/modules/curator/service.go`
- Modify: `apps/api/internal/modules/dashboard/service.go`

**Step 1: Add notification types**

In notifications `types.go`, add to `NotificationType`:
- `plan_updated`
- `task_assigned`
- `task_overdue`
- `feedback_received`

**Step 2: Send notifications from curator service**

After `CreateWeeklyPlan` / `UpdateWeeklyPlan`: send `plan_updated` notification to client.
After `CreateTask`: send `task_assigned` notification to client.
After `SubmitFeedback`: send `feedback_received` notification to client.

Follow existing notification sending pattern from dashboard service (`sendPlanUpdateNotification`, etc.).

**Step 3: Send overdue notification**

In the daily snapshot collection (Task 12), check for newly overdue tasks and send `task_overdue` notifications.

**Step 4: Write tests and run**

Run: `cd apps/api && go test ./internal/modules/curator/ ./internal/modules/notifications/ -v`

**Step 5: Commit**

```bash
git add apps/api/internal/modules/notifications/types.go apps/api/internal/modules/curator/service.go apps/api/internal/modules/dashboard/service.go
git commit -m "feat(notifications): add plan_updated, task_assigned, task_overdue, feedback_received types"
```

---

## Phase 9: Frontend — Curator Types and API

### Task 15: Frontend types for new curator features

**Files:**
- Modify: `apps/web/src/features/curator/types/index.ts`

**Step 1: Add new types**

```typescript
// Weekly plans
export interface WeeklyPlanView {
  id: string
  calories: number
  protein: number
  fat: number
  carbs: number
  start_date: string
  end_date: string
  comment?: string
  is_active: boolean
  created_at: string
}

export interface CreateWeeklyPlanRequest {
  calories: number
  protein: number
  fat: number
  carbs: number
  start_date: string
  end_date: string
  comment?: string
}

export interface UpdateWeeklyPlanRequest {
  calories?: number
  protein?: number
  fat?: number
  carbs?: number
  comment?: string
}

// Tasks
export type TaskType = 'nutrition' | 'workout' | 'habit' | 'measurement'
export type TaskRecurrence = 'once' | 'daily' | 'weekly'
export type TaskStatus = 'active' | 'completed' | 'overdue'

export interface TaskView {
  id: string
  title: string
  type: TaskType
  description?: string
  deadline: string
  recurrence: TaskRecurrence
  recurrence_days?: number[]
  status: TaskStatus
  completions?: string[]
  created_at: string
}

export interface CreateTaskRequest {
  title: string
  type: TaskType
  description?: string
  deadline: string
  recurrence: TaskRecurrence
  recurrence_days?: number[]
}

// Weekly reports
export interface WeeklyReportView {
  id: string
  week_start: string
  week_end: string
  summary: Record<string, unknown>
  submitted_at: string
  curator_feedback?: CuratorFeedback
  has_feedback: boolean
}

export interface CuratorFeedback {
  nutrition?: CategoryRating
  activity?: CategoryRating
  water?: CategoryRating
  photo_uploaded?: boolean
  summary: string
  recommendations?: string
}

export type RatingLevel = 'excellent' | 'good' | 'needs_improvement'

export interface CategoryRating {
  rating: RatingLevel
  comment?: string
}

export interface SubmitFeedbackRequest {
  nutrition?: CategoryRating
  activity?: CategoryRating
  water?: CategoryRating
  photo_uploaded?: boolean
  summary: string
  recommendations?: string
}

// Analytics
export interface AnalyticsSummary {
  total_clients: number
  attention_clients: number
  avg_kbzhu_percent: number
  total_unread: number
  clients_waiting: number
  active_tasks: number
  overdue_tasks: number
  completed_today: number
}

export interface AttentionItem {
  client_id: number
  client_name: string
  client_avatar?: string
  reason: 'red_alert' | 'overdue_task' | 'inactive' | 'unread_message' | 'awaiting_feedback'
  detail: string
  priority: number
  action_url: string
}

// Extended ClientCard fields
export interface ClientCardExtended extends ClientCard {
  weekly_kbzhu_percent?: number
  active_tasks_count: number
  overdue_tasks_count: number
  last_activity_date?: string
  streak_days: number
}

// Navigation update
export type CuratorNavigationItemId = 'hub' | 'chats' | 'content' | 'profile'
```

**Step 2: Commit**

```bash
git add apps/web/src/features/curator/types/index.ts
git commit -m "feat(curator-fe): add types for plans, tasks, feedback, analytics"
```

---

### Task 16: Frontend API client extensions

**Files:**
- Modify: `apps/web/src/features/curator/api/curatorApi.ts`

**Step 1: Add API methods**

```typescript
import type {
  ClientCard, ClientDetail, WeeklyPlanView, CreateWeeklyPlanRequest,
  UpdateWeeklyPlanRequest, TaskView, CreateTaskRequest, UpdateTaskRequest,
  WeeklyReportView, SubmitFeedbackRequest, AnalyticsSummary, AttentionItem,
} from '../types'

const BASE = '/api/v1/curator'

export const curatorApi = {
  // Existing
  getClients: () => apiClient.get<ClientCard[]>(`${BASE}/clients`),
  getClientDetail: (id: number, days?: number) =>
    apiClient.get<ClientDetail>(`${BASE}/clients/${id}?days=${days ?? 7}`),
  setTargetWeight: (clientId: number, targetWeight: number | null) =>
    apiClient.put(`${BASE}/clients/${clientId}/target-weight`, { target_weight: targetWeight }),
  setWaterGoal: (clientId: number, waterGoal: number | null) =>
    apiClient.put(`${BASE}/clients/${clientId}/water-goal`, { water_goal: waterGoal }),

  // Weekly plans
  getWeeklyPlans: (clientId: number) =>
    apiClient.get<WeeklyPlanView[]>(`${BASE}/clients/${clientId}/weekly-plans`),
  createWeeklyPlan: (clientId: number, req: CreateWeeklyPlanRequest) =>
    apiClient.post<WeeklyPlanView>(`${BASE}/clients/${clientId}/weekly-plan`, req),
  updateWeeklyPlan: (clientId: number, planId: string, req: UpdateWeeklyPlanRequest) =>
    apiClient.put<WeeklyPlanView>(`${BASE}/clients/${clientId}/weekly-plan/${planId}`, req),
  deleteWeeklyPlan: (clientId: number, planId: string) =>
    apiClient.delete(`${BASE}/clients/${clientId}/weekly-plan/${planId}`),

  // Tasks
  getTasks: (clientId: number, status?: string) =>
    apiClient.get<TaskView[]>(`${BASE}/clients/${clientId}/tasks${status ? `?status=${status}` : ''}`),
  createTask: (clientId: number, req: CreateTaskRequest) =>
    apiClient.post<TaskView>(`${BASE}/clients/${clientId}/tasks`, req),
  updateTask: (clientId: number, taskId: string, req: Partial<CreateTaskRequest>) =>
    apiClient.put<TaskView>(`${BASE}/clients/${clientId}/tasks/${taskId}`, req),
  deleteTask: (clientId: number, taskId: string) =>
    apiClient.delete(`${BASE}/clients/${clientId}/tasks/${taskId}`),

  // Weekly reports & feedback
  getWeeklyReports: (clientId: number) =>
    apiClient.get<WeeklyReportView[]>(`${BASE}/clients/${clientId}/weekly-reports`),
  submitFeedback: (clientId: number, reportId: string, req: SubmitFeedbackRequest) =>
    apiClient.put(`${BASE}/clients/${clientId}/weekly-reports/${reportId}/feedback`, req),

  // Analytics
  getAnalytics: () => apiClient.get<AnalyticsSummary>(`${BASE}/analytics`),
  getAttentionList: () => apiClient.get<AttentionItem[]>(`${BASE}/attention`),
  getAnalyticsHistory: (period: 'daily' | 'weekly', count: number) =>
    apiClient.get(`${BASE}/analytics/history?period=${period}&${period === 'daily' ? 'days' : 'weeks'}=${count}`),
  getBenchmark: (weeks: number) =>
    apiClient.get(`${BASE}/analytics/benchmark?weeks=${weeks}`),
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/curator/api/curatorApi.ts
git commit -m "feat(curator-fe): extend API client with plans, tasks, feedback, analytics"
```

---

## Phase 10: Frontend — Analytics Hub

### Task 17: Analytics summary cards component

**Files:**
- Create: `apps/web/src/features/curator/components/AnalyticsSummaryCards.tsx`

**Step 1: Build component**

4 metric cards in a 2x2 grid using existing Card component from `@/shared/components/ui/Card`. Each card shows:
- Icon (Lucide: Users, Target, MessageSquare, CheckSquare)
- Primary value (large number)
- Secondary detail (e.g., "из них требуют внимания: N")
- Color coding for attention values

Follow existing `ClientCard` styling patterns: `rounded-xl bg-white p-4 shadow-sm border border-gray-100`.

**Step 2: Write test**

File: `apps/web/src/features/curator/components/__tests__/AnalyticsSummaryCards.test.tsx`

Test: renders all 4 cards with correct values, handles zero state.

**Step 3: Run test**

Run: `cd apps/web && npx jest --testPathPattern="AnalyticsSummaryCards" --no-coverage`

**Step 4: Commit**

```bash
git add apps/web/src/features/curator/components/AnalyticsSummaryCards.tsx apps/web/src/features/curator/components/__tests__/AnalyticsSummaryCards.test.tsx
git commit -m "feat(curator-fe): add analytics summary cards component"
```

---

### Task 18: Attention list component

**Files:**
- Create: `apps/web/src/features/curator/components/AttentionList.tsx`

**Step 1: Build component**

Vertical list of `AttentionItem` cards. Each card:
- Client avatar + name (reuse initials pattern from `ClientCard`)
- Reason badge (color by priority: 1-2 red, 3-4 yellow, 5 blue)
- Detail text
- Click navigates to `action_url`

Props: `items: AttentionItem[]`

**Step 2: Write test**

**Step 3: Run test and commit**

```bash
git add apps/web/src/features/curator/components/AttentionList.tsx apps/web/src/features/curator/components/__tests__/AttentionList.test.tsx
git commit -m "feat(curator-fe): add attention list component"
```

---

### Task 19: Analytics dynamics chart component

**Files:**
- Create: `apps/web/src/features/curator/components/AnalyticsDynamicsChart.tsx`

**Step 1: Build component**

Recharts `LineChart` showing weekly metrics vs platform benchmark. Follow existing `StepsChart` pattern:
- `ResponsiveContainer` with fixed height
- Lines for own data (blue) and benchmark (gray dashed)
- Period toggle: 4/8/12 weeks (buttons)
- Collapsible wrapper

Props: `ownSnapshots: WeeklySnapshot[]`, `benchmarks: PlatformBenchmark[]`

**Step 2: Write test and commit**

```bash
git add apps/web/src/features/curator/components/AnalyticsDynamicsChart.tsx apps/web/src/features/curator/components/__tests__/AnalyticsDynamicsChart.test.tsx
git commit -m "feat(curator-fe): add analytics dynamics chart with benchmark comparison"
```

---

### Task 20: Curator Hub page

**Files:**
- Modify: `apps/web/src/app/curator/page.tsx`

**Step 1: Rebuild curator index page**

Replace current simple `ClientList` render with the hub layout:

```
<div className="px-4 py-6 space-y-6">
  <AnalyticsSummaryCards analytics={analytics} />

  {attentionItems.length > 0 && (
    <section>
      <h2>Требуют внимания</h2>
      <AttentionList items={attentionItems} />
    </section>
  )}

  <AnalyticsDynamicsChart ... />  {/* collapsible */}

  <section>
    <h2>Все клиенты</h2>
    {/* filters and sorting */}
    <ClientList clients={clients} />
  </section>
</div>
```

Data fetching: parallel `Promise.all([curatorApi.getAnalytics(), curatorApi.getAttentionList(), curatorApi.getClients()])` in useEffect.

**Step 2: Update ClientList to accept props**

Modify `ClientList` to accept optional `clients` prop (for external data) or fetch internally if not provided. Add filter/sort controls.

**Step 3: Write test**

**Step 4: Run tests**

Run: `cd apps/web && npx jest --testPathPattern="curator" --no-coverage`

**Step 5: Commit**

```bash
git add apps/web/src/app/curator/page.tsx apps/web/src/features/curator/components/ClientList.tsx
git commit -m "feat(curator-fe): build analytics hub page with summary, attention, and dynamics"
```

---

### Task 21: Update footer navigation

**Files:**
- Modify: `apps/web/src/features/curator/utils/curatorNavigationConfig.ts`
- Modify: `apps/web/src/features/curator/components/CuratorFooterNavigation.tsx`

**Step 1: Change first nav item**

In `curatorNavigationConfig.ts`, change first item from `clients` to `hub`:
- id: `'hub'`
- label: `'Хаб'`
- icon: `LayoutDashboard` (from lucide-react)
- href: `'/curator'`

**Step 2: Update type**

In `types/index.ts`, `CuratorNavigationItemId` already updated in Task 15.

**Step 3: Commit**

```bash
git add apps/web/src/features/curator/utils/curatorNavigationConfig.ts apps/web/src/features/curator/components/CuratorFooterNavigation.tsx
git commit -m "feat(curator-fe): update footer nav — rename Clients to Hub"
```

---

## Phase 11: Frontend — Client Card Tabs

### Task 22: Tab navigation component for client detail

**Files:**
- Create: `apps/web/src/features/curator/components/ClientDetailTabs.tsx`

**Step 1: Build tab navigation**

Horizontal scrollable tabs. Uses `useSearchParams` to read/write `?tab=` parameter.

```typescript
const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'plan', label: 'План' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'reports', label: 'Отчёты' },
] as const
```

Styling: underline active tab, horizontal scroll on mobile.

**Step 2: Write test and commit**

```bash
git add apps/web/src/features/curator/components/ClientDetailTabs.tsx apps/web/src/features/curator/components/__tests__/ClientDetailTabs.test.tsx
git commit -m "feat(curator-fe): add client detail tab navigation component"
```

---

### Task 23: Plan tab component

**Files:**
- Create: `apps/web/src/features/curator/components/PlanTab.tsx`
- Create: `apps/web/src/features/curator/components/PlanForm.tsx`

**Step 1: Build PlanTab**

Shows current active plan (if exists) with KBZHU values, period, comment. Button "Скорректировать" opens `PlanForm` modal.

Plan history: collapsible list below current plan fetched from `curatorApi.getWeeklyPlans(clientId)`.

**Step 2: Build PlanForm**

Bottom-sheet modal (full-screen on mobile). Fields:
- Calories, Protein, Fat, Carbs — number inputs, pre-filled with auto-calculated values from client's nutrition calc targets
- Start date, End date — date inputs (default: this Monday — Sunday)
- Comment — textarea
- "Пересчитать макросы" checkbox — when calories change, proportionally adjust P/F/C

Submit calls `curatorApi.createWeeklyPlan()` or `curatorApi.updateWeeklyPlan()`.

**Step 3: Write tests**

**Step 4: Run tests and commit**

```bash
git add apps/web/src/features/curator/components/PlanTab.tsx apps/web/src/features/curator/components/PlanForm.tsx apps/web/src/features/curator/components/__tests__/PlanTab.test.tsx
git commit -m "feat(curator-fe): add plan tab with create/edit form"
```

---

### Task 24: Tasks tab component

**Files:**
- Create: `apps/web/src/features/curator/components/TasksTab.tsx`
- Create: `apps/web/src/features/curator/components/TaskForm.tsx`
- Create: `apps/web/src/features/curator/components/TaskCard.tsx`

**Step 1: Build TasksTab**

Filter buttons: Активные / Завершённые / Просроченные. List of `TaskCard` components. FAB button "+" to open `TaskForm`.

**Step 2: Build TaskCard**

Shows: type icon (Lucide: UtensilsCrossed for nutrition, Dumbbell for workout, Star for habit, Ruler for measurement), title, deadline, status badge.

For recurring tasks: mini-calendar row showing last 7 days with filled/empty circles.

**Step 3: Build TaskForm**

Bottom-sheet modal. Fields: title, type (select), description (textarea), deadline (date), recurrence (select), recurrence_days (weekday checkboxes, shown only for `weekly`).

Submit calls `curatorApi.createTask()`.

**Step 4: Write tests**

**Step 5: Run tests and commit**

```bash
git add apps/web/src/features/curator/components/TasksTab.tsx apps/web/src/features/curator/components/TaskForm.tsx apps/web/src/features/curator/components/TaskCard.tsx apps/web/src/features/curator/components/__tests__/TasksTab.test.tsx
git commit -m "feat(curator-fe): add tasks tab with create form and task cards"
```

---

### Task 25: Reports tab component

**Files:**
- Create: `apps/web/src/features/curator/components/ReportsTab.tsx`
- Create: `apps/web/src/features/curator/components/FeedbackForm.tsx`
- Create: `apps/web/src/features/curator/components/ReportCard.tsx`

**Step 1: Build ReportsTab**

List of `ReportCard` components fetched from `curatorApi.getWeeklyReports(clientId)`.

**Step 2: Build ReportCard**

Shows: week period, auto-collected summary (avg calories, weight, steps, workouts), status badge ("Ожидает обратной связи" / "Обратная связь дана"). Click expands to show full summary + feedback (if given) or opens `FeedbackForm`.

**Step 3: Build FeedbackForm**

Bottom-sheet modal. Structured form:
- Nutrition rating (3 buttons: excellent/good/needs_improvement) + comment textarea
- Activity rating + comment
- Water rating + comment
- Photo status (checkbox)
- Summary textarea (required)
- Recommendations textarea

Submit calls `curatorApi.submitFeedback()`.

**Step 4: Write tests**

**Step 5: Run tests and commit**

```bash
git add apps/web/src/features/curator/components/ReportsTab.tsx apps/web/src/features/curator/components/FeedbackForm.tsx apps/web/src/features/curator/components/ReportCard.tsx apps/web/src/features/curator/components/__tests__/ReportsTab.test.tsx
git commit -m "feat(curator-fe): add reports tab with feedback form"
```

---

### Task 26: Integrate tabs into client detail page

**Files:**
- Modify: `apps/web/src/app/curator/clients/[id]/page.tsx`

**Step 1: Add tab routing**

Use `useSearchParams()` to read `tab` parameter. Render corresponding tab component:

```typescript
const tab = searchParams.get('tab') || 'overview'

{tab === 'overview' && <OverviewContent detail={detail} />}
{tab === 'plan' && <PlanTab clientId={clientId} />}
{tab === 'tasks' && <TasksTab clientId={clientId} />}
{tab === 'reports' && <ReportsTab clientId={clientId} />}
```

**Step 2: Add mini-summary to overview tab**

Add streak days, weight trend summary, and quick action buttons at the top of the overview content.

**Step 3: Write test**

**Step 4: Run tests**

Run: `cd apps/web && npx jest --testPathPattern="curator" --no-coverage`

**Step 5: Commit**

```bash
git add apps/web/src/app/curator/clients/[id]/page.tsx
git commit -m "feat(curator-fe): integrate tabs into client detail page"
```

---

## Phase 12: Frontend — Client Dashboard Changes

### Task 27: Client tasks section in dashboard

**Files:**
- Create: `apps/web/src/features/dashboard/components/ClientTasksSection.tsx`
- Modify: `apps/web/src/features/dashboard/api/` (add task endpoints)

**Step 1: Add dashboard API methods**

In dashboard API client, add:
```typescript
getMyTasks: () => apiClient.get<ClientTaskView[]>('/api/v1/dashboard/tasks'),
completeTask: (taskId: string) => apiClient.put(`/api/v1/dashboard/tasks/${taskId}/complete`, {}),
```

**Step 2: Build ClientTasksSection**

Shows active tasks with checkboxes. Task type icon + title + deadline. For recurring tasks: progress bar (e.g., "4/7 дней"). Overdue tasks highlighted in red.

On checkbox click: call `completeTask()` with optimistic update.

**Step 3: Integrate into dashboard page**

Add `<ClientTasksSection />` to the dashboard layout (in the existing tasks section slot).

**Step 4: Write test**

**Step 5: Run tests and commit**

```bash
git add apps/web/src/features/dashboard/components/ClientTasksSection.tsx apps/web/src/features/dashboard/api/
git commit -m "feat(dashboard): add client tasks section with completion"
```

---

### Task 28: Client feedback section in dashboard

**Files:**
- Create: `apps/web/src/features/dashboard/components/CuratorFeedbackSection.tsx`

**Step 1: Add dashboard API method**

```typescript
getLatestFeedback: (reportId: string) =>
  apiClient.get<FeedbackView>(`/api/v1/dashboard/weekly-reports/${reportId}/feedback`),
```

**Step 2: Build CuratorFeedbackSection**

Collapsible card showing:
- Category ratings as colored badges (green=excellent, yellow=good, red=needs_improvement)
- Summary text
- Recommendations text
- Visible until end of next week (check date logic)

**Step 3: Integrate into dashboard page**

Add below the weekly report section.

**Step 4: Write test and commit**

```bash
git add apps/web/src/features/dashboard/components/CuratorFeedbackSection.tsx
git commit -m "feat(dashboard): add curator feedback section"
```

---

### Task 29: Enhanced weekly plan display in dashboard

**Files:**
- Modify: `apps/web/src/features/dashboard/components/` (existing WeeklyPlan component)

**Step 1: Update plan display**

If a weekly plan exists, show:
- Target KBZHU values
- Curator comment (if any)
- Comparison with last week's plan (↑/↓ arrows per macro)

No source label (per design decision — no "auto" vs "curator" distinction visible to client).

**Step 2: Write test and commit**

```bash
git add apps/web/src/features/dashboard/components/
git commit -m "feat(dashboard): enhance weekly plan display with comparison"
```

---

## Phase 13: Frontend — Exports and Integration

### Task 30: Update feature exports and run full test suite

**Files:**
- Modify: `apps/web/src/features/curator/index.ts`

**Step 1: Export new components**

Add exports for all new components from `index.ts`.

**Step 2: Run full frontend test suite**

Run: `cd apps/web && npx jest --no-coverage`
Expected: All tests pass.

**Step 3: Run type check**

Run: `cd apps/web && npm run type-check`
Expected: No TypeScript errors.

**Step 4: Run lint**

Run: `cd apps/web && npm run lint`
Expected: No lint errors.

**Step 5: Run full backend test suite**

Run: `cd apps/api && go test ./... -v`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add apps/web/src/features/curator/index.ts
git commit -m "feat(curator): export new components and verify full test suite"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-3 | Database migrations (extend tasks, JSONB feedback, snapshot tables) |
| 2 | 4-6 | Backend weekly plans CRUD |
| 3 | 7-8 | Backend structured tasks CRUD |
| 4 | 9 | Backend weekly report feedback |
| 5 | 10-11 | Backend analytics hub (summary, attention list, extended client list) |
| 6 | 12 | Backend snapshots & benchmarks |
| 7 | 13 | Backend client-side endpoints (task completion, feedback view) |
| 8 | 14 | Backend notification types |
| 9 | 15-16 | Frontend types and API client |
| 10 | 17-21 | Frontend analytics hub (cards, attention, chart, page, nav) |
| 11 | 22-26 | Frontend client card tabs (plan, tasks, reports) |
| 12 | 27-29 | Frontend client dashboard changes |
| 13 | 30 | Integration, exports, full test suite |

Total: 30 tasks across 13 phases.
