# Design Document: Dashboard

## Overview

The Dashboard is the central interface of the BURCEV platform, providing a comprehensive view of daily fitness tracking, weekly planning, and long-term progress. It combines real-time data entry with historical visualization, enabling clients to monitor their nutrition, weight, physical activity, and curator-assigned tasks in a single, cohesive interface.

The design follows a mobile-first approach with a vertical layout that prioritizes daily tracking at the top (most frequently accessed) and weekly/long-term sections below. The architecture emphasizes real-time updates, optimistic UI patterns, and seamless integration with existing features (notifications, food tracker, analytics).

## Architecture

### High-Level Structure

```
┌─────────────────────────────────────┐
│     Authenticated Layout            │
│  (Header + Footer from shared)      │
│                                     │
│  ┌───────────────────────────────┐ │
│  │   Dashboard Page Component    │ │
│  │                               │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │  Calendar Navigator     │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │  Daily Tracking Grid    │ │ │
│  │  │  - Nutrition Block      │ │ │
│  │  │  - Weight Block         │ │ │
│  │  │  - Steps Block          │ │ │
│  │  │  - Workout Block        │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │  Progress Section       │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │  Photo Upload Section   │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │  Weekly Plan Section    │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │  Tasks Section          │ │ │
│  │  └─────────────────────────┘ │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

### State Management

The dashboard uses Zustand for centralized state management, following the pattern established in the notifications feature:

```typescript
interface DashboardState {
  // Selected date context
  selectedDate: Date
  selectedWeek: { start: Date; end: Date }
  
  // Daily tracking data
  dailyData: Record<string, DailyMetrics>
  
  // Weekly data
  weeklyPlan: WeeklyPlan | null
  tasks: Task[]
  
  // UI state
  isLoading: boolean
  error: Error | null
  
  // Actions
  setSelectedDate: (date: Date) => void
  navigateWeek: (direction: 'prev' | 'next') => void
  fetchDailyData: (date: Date) => Promise<void>
  updateMetric: (date: string, metric: MetricUpdate) => Promise<void>
  submitWeeklyReport: () => Promise<void>
}
```

### Data Flow

1. **Initial Load**: Dashboard fetches current week data on mount
2. **Date Navigation**: User selects date → Store updates → Components re-render with new date's data
3. **Metric Update**: User logs metric → Optimistic update → API call → Rollback on error
4. **Real-time Sync**: Polling every 30 seconds for curator updates (plans, tasks)

## Components and Interfaces

### 1. DashboardPage Component

**Location**: `apps/web/src/features/dashboard/components/DashboardPage.tsx`

**Purpose**: Root component orchestrating all dashboard sections

**Props**: None (uses authenticated layout context)

**Structure**:
```typescript
export function DashboardPage() {
  const { selectedDate, fetchDailyData } = useDashboardStore()
  
  useEffect(() => {
    fetchDailyData(selectedDate)
  }, [selectedDate])
  
  return (
    <div className="dashboard-container">
      <CalendarNavigator />
      <DailyTrackingGrid />
      <ProgressSection />
      <PhotoUploadSection />
      <WeeklyPlanSection />
      <TasksSection />
    </div>
  )
}
```

### 2. CalendarNavigator Component

**Location**: `apps/web/src/features/dashboard/components/CalendarNavigator.tsx`

**Purpose**: Week view with day selection and goal completion indicators

**Interface**:
```typescript
interface CalendarNavigatorProps {
  className?: string
}

interface DayIndicator {
  date: Date
  dayName: string
  isToday: boolean
  isSelected: boolean
  completionStatus: {
    nutritionFilled: boolean
    weightLogged: boolean
    activityCompleted: boolean
  }
}
```

**Key Features**:
- Displays 7 days (Mon-Sun) with visual indicators
- Navigation arrows for previous/next week
- Click handler for day selection
- Green checkmarks for completed goals
- "Submit weekly report" button on Sunday

### 3. DailyTrackingGrid Component

**Location**: `apps/web/src/features/dashboard/components/DailyTrackingGrid.tsx`

**Purpose**: Container for the four daily tracking blocks

**Structure**:
```typescript
export function DailyTrackingGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NutritionBlock />
      <WeightBlock />
      <StepsBlock />
      <WorkoutBlock />
    </div>
  )
}
```

### 4. NutritionBlock Component

**Location**: `apps/web/src/features/dashboard/components/NutritionBlock.tsx`

**Interface**:
```typescript
interface NutritionBlockProps {
  date: Date
}

interface NutritionData {
  caloriesGoal: number
  caloriesCurrent: number
  macros: {
    protein: { current: number; goal: number }
    fat: { current: number; goal: number }
    carbs: { current: number; goal: number }
  }
}
```

**Key Features**:
- Circular progress indicator for calories
- Macro breakdown with progress bars
- Quick add button (+) linking to food tracker
- Real-time updates when food is logged
- Warning indicator when goal exceeded

### 5. WeightBlock Component

**Location**: `apps/web/src/features/dashboard/components/WeightBlock.tsx`

**Interface**:
```typescript
interface WeightBlockProps {
  date: Date
}

interface WeightData {
  current: number | null
  previous: number | null
  unit: 'kg' | 'lbs'
}
```

**Key Features**:
- Input field with validation (positive number, max 500kg, 1 decimal)
- Quick add button (+) to save
- Comparison with previous day's weight
- Visual completion indicator

### 6. StepsBlock Component

**Location**: `apps/web/src/features/dashboard/components/StepsBlock.tsx`

**Interface**:
```typescript
interface StepsBlockProps {
  date: Date
}

interface StepsData {
  goal: number
  current: number
}
```

**Key Features**:
- Progress bar or circular indicator
- Quick add button (+) opening input dialog
- Validation (non-negative integer)
- Completion indicator when goal reached

### 7. WorkoutBlock Component

**Location**: `apps/web/src/features/dashboard/components/WorkoutBlock.tsx`

**Interface**:
```typescript
interface WorkoutBlockProps {
  date: Date
}

interface WorkoutData {
  completed: boolean
  type?: string
  duration?: number
}
```

**Key Features**:
- Quick add button (+) opening workout dialog
- Displays workout type if logged
- Completion indicator
- Optional (not required for daily goals)

### 8. ProgressSection Component

**Location**: `apps/web/src/features/dashboard/components/ProgressSection.tsx`

**Interface**:
```typescript
interface ProgressSectionProps {
  className?: string
}

interface ProgressData {
  weightTrend: { date: Date; weight: number }[]
  nutritionAdherence: number
  achievements: Achievement[]
}
```

**Key Features**:
- Preview chart (weight trend over 4 weeks)
- Nutrition adherence percentage
- Recent achievements
- Click to navigate to analytics page
- Placeholder when insufficient data

### 9. PhotoUploadSection Component

**Location**: `apps/web/src/features/dashboard/components/PhotoUploadSection.tsx`

**Interface**:
```typescript
interface PhotoUploadSectionProps {
  weekStart: Date
  weekEnd: Date
}

interface PhotoData {
  url?: string
  uploadedAt?: Date
  weekIdentifier: string
}
```

**Key Features**:
- Camera icon button
- File picker (JPEG, PNG, WebP)
- Validation (max 10MB)
- Thumbnail preview if uploaded
- Prominent display on Saturday/Sunday

### 10. WeeklyPlanSection Component

**Location**: `apps/web/src/features/dashboard/components/WeeklyPlanSection.tsx`

**Interface**:
```typescript
interface WeeklyPlanSectionProps {
  className?: string
}

interface WeeklyPlan {
  id: string
  caloriesGoal: number
  proteinGoal: number
  startDate: Date
  endDate: Date
  isActive: boolean
}
```

**Key Features**:
- Displays calorie and protein targets
- Shows plan dates
- Active indicator
- Placeholder "Скоро тут будет твоя планка" when no plan
- Auto-refresh every 30 seconds

### 11. TasksSection Component

**Location**: `apps/web/src/features/dashboard/components/TasksSection.tsx`

**Interface**:
```typescript
interface TasksSectionProps {
  className?: string
}

interface Task {
  id: string
  title: string
  description: string
  weekNumber: number
  status: 'active' | 'completed' | 'overdue'
  assignedAt: Date
  dueDate: Date
}
```

**Key Features**:
- Current week tasks (active)
- Previous week tasks with status
- Week indicators (Неделя 1, Неделя 2)
- Click to view full details
- "Еще" link when > 5 tasks
- Mark as complete action

## Data Models

### DailyMetrics

```typescript
interface DailyMetrics {
  date: string // ISO date string
  userId: string
  
  // Nutrition
  nutrition: {
    calories: number
    protein: number
    fat: number
    carbs: number
  }
  
  // Weight
  weight: number | null
  
  // Activity
  steps: number
  workout: {
    completed: boolean
    type?: string
    duration?: number
  }
  
  // Completion status
  completionStatus: {
    nutritionFilled: boolean
    weightLogged: boolean
    activityCompleted: boolean
  }
  
  // Metadata
  createdAt: Date
  updatedAt: Date
}
```

### WeeklyPlan

```typescript
interface WeeklyPlan {
  id: string
  userId: string
  curatorId: string
  
  // Targets
  caloriesGoal: number
  proteinGoal: number
  fatGoal?: number
  carbsGoal?: number
  stepsGoal?: number
  
  // Dates
  startDate: Date
  endDate: Date
  
  // Status
  isActive: boolean
  
  // Metadata
  createdAt: Date
  updatedAt: Date
  createdBy: string
}
```

### Task

```typescript
interface Task {
  id: string
  userId: string
  curatorId: string
  
  // Content
  title: string
  description: string
  
  // Timing
  weekNumber: number
  assignedAt: Date
  dueDate: Date
  completedAt?: Date
  
  // Status
  status: 'active' | 'completed' | 'overdue'
  
  // Metadata
  createdAt: Date
  updatedAt: Date
}
```

### WeeklyReport

```typescript
interface WeeklyReport {
  id: string
  userId: string
  curatorId: string
  
  // Week identifier
  weekStart: Date
  weekEnd: Date
  weekNumber: number
  
  // Summary data
  summary: {
    daysWithNutrition: number
    daysWithWeight: number
    daysWithActivity: number
    averageCalories: number
    averageWeight: number
    totalSteps: number
    workoutsCompleted: number
  }
  
  // Photo
  photoUrl?: string
  
  // Status
  submittedAt: Date
  reviewedAt?: Date
  curatorFeedback?: string
  
  // Metadata
  createdAt: Date
  updatedAt: Date
}
```

### MetricUpdate

```typescript
type MetricUpdate = 
  | { type: 'nutrition'; data: { calories: number; protein: number; fat: number; carbs: number } }
  | { type: 'weight'; data: { weight: number } }
  | { type: 'steps'; data: { steps: number } }
  | { type: 'workout'; data: { completed: boolean; type?: string; duration?: number } }
```

## Database Schema

### daily_metrics table

```sql
CREATE TABLE daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Nutrition
  calories INTEGER DEFAULT 0,
  protein INTEGER DEFAULT 0,
  fat INTEGER DEFAULT 0,
  carbs INTEGER DEFAULT 0,
  
  -- Weight
  weight DECIMAL(5,1),
  
  -- Activity
  steps INTEGER DEFAULT 0,
  workout_completed BOOLEAN DEFAULT FALSE,
  workout_type TEXT,
  workout_duration INTEGER,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

-- RLS policies
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics"
  ON daily_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own metrics"
  ON daily_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metrics"
  ON daily_metrics FOR UPDATE
  USING (auth.uid() = user_id);

-- Curators can view client metrics
CREATE POLICY "Curators can view client metrics"
  ON daily_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM curator_client_relationships
      WHERE curator_id = auth.uid()
      AND client_id = daily_metrics.user_id
      AND status = 'active'
    )
  );

-- Indexes
CREATE INDEX idx_daily_metrics_user_date ON daily_metrics(user_id, date DESC);
CREATE INDEX idx_daily_metrics_date ON daily_metrics(date DESC);
```

### weekly_plans table

```sql
CREATE TABLE weekly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Targets
  calories_goal INTEGER NOT NULL,
  protein_goal INTEGER NOT NULL,
  fat_goal INTEGER,
  carbs_goal INTEGER,
  steps_goal INTEGER,
  
  -- Dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- RLS policies
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plans"
  ON weekly_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Curators can manage client plans"
  ON weekly_plans FOR ALL
  USING (
    auth.uid() = curator_id AND
    EXISTS (
      SELECT 1 FROM curator_client_relationships
      WHERE curator_id = auth.uid()
      AND client_id = weekly_plans.user_id
      AND status = 'active'
    )
  );

-- Indexes
CREATE INDEX idx_weekly_plans_user_active ON weekly_plans(user_id, is_active, start_date DESC);
CREATE INDEX idx_weekly_plans_dates ON weekly_plans(start_date, end_date);
```

### tasks table

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Content
  title TEXT NOT NULL,
  description TEXT,
  
  -- Timing
  week_number INTEGER NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  due_date DATE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'overdue')),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own task status"
  ON tasks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Curators can manage client tasks"
  ON tasks FOR ALL
  USING (
    auth.uid() = curator_id AND
    EXISTS (
      SELECT 1 FROM curator_client_relationships
      WHERE curator_id = auth.uid()
      AND client_id = tasks.user_id
      AND status = 'active'
    )
  );

-- Indexes
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status, due_date DESC);
CREATE INDEX idx_tasks_week ON tasks(user_id, week_number DESC);
```

### weekly_reports table

```sql
CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Week identifier
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_number INTEGER NOT NULL,
  
  -- Summary data (JSON for flexibility)
  summary JSONB NOT NULL,
  
  -- Photo
  photo_url TEXT,
  
  -- Status
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  curator_feedback TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, week_start)
);

-- RLS policies
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports"
  ON weekly_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports"
  ON weekly_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Curators can view and update client reports"
  ON weekly_reports FOR ALL
  USING (
    auth.uid() = curator_id AND
    EXISTS (
      SELECT 1 FROM curator_client_relationships
      WHERE curator_id = auth.uid()
      AND client_id = weekly_reports.user_id
      AND status = 'active'
    )
  );

-- Indexes
CREATE INDEX idx_weekly_reports_user_week ON weekly_reports(user_id, week_start DESC);
CREATE INDEX idx_weekly_reports_curator ON weekly_reports(curator_id, submitted_at DESC);
```

### weekly_photos table

```sql
CREATE TABLE weekly_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Week identifier
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_identifier TEXT NOT NULL, -- e.g., "2024-W01"
  
  -- Photo data
  photo_url TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  
  -- Metadata
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, week_identifier)
);

-- RLS policies
ALTER TABLE weekly_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own photos"
  ON weekly_photos FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Curators can view client photos"
  ON weekly_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM curator_client_relationships
      WHERE curator_id = auth.uid()
      AND client_id = weekly_photos.user_id
      AND status = 'active'
    )
  );

-- Indexes
CREATE INDEX idx_weekly_photos_user_week ON weekly_photos(user_id, week_start DESC);
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several areas of redundancy:

1. **Week navigation (1.3, 1.4)**: Both test navigation in different directions - can be combined into a single bidirectional property
2. **Nutrition data display (2.1, 2.2)**: Both test that nutrition data is displayed - can be combined into comprehensive nutrition display property
3. **Real-time updates (11.1-11.4)**: All test 500ms update latency for different metrics - can be combined into a single property about metric updates
4. **Weekly plan data display (8.1, 8.2, 8.3)**: All test that plan fields are displayed - can be combined into comprehensive plan display property
5. **Responsive layouts (12.1, 12.2, 12.3)**: All test layout at different breakpoints - these are specific examples, not redundant

After reflection, the following properties provide unique validation value without redundancy:

### Property 1: Week Navigation Bidirectionality

*For any* selected week, navigating forward then backward (or backward then forward) should return to the original week.

**Validates: Requirements 1.3, 1.4**

### Property 2: Day Selection Updates Context

*For any* day in the calendar, clicking it should update all daily tracking blocks to display data for that specific date.

**Validates: Requirements 1.5**

### Property 3: Goal Completion Indicators Match Data

*For any* day with daily metrics, the calendar should display completion indicators that accurately reflect the data (nutrition filled if calories > 0, weight logged if weight exists, activity completed if steps >= goal OR workout completed).

**Validates: Requirements 1.6**

### Property 4: Nutrition Data Display Completeness

*For any* nutrition data (calories, protein, fat, carbs with goals), the Nutrition_Block should display all values and calculate the correct percentage of goal achieved for each metric.

**Validates: Requirements 2.1, 2.2, 2.5**

### Property 5: Progress Indicator Reactivity

*For any* nutrition or steps data update, the corresponding progress indicator should reflect the new values within 500ms without page refresh.

**Validates: Requirements 2.3, 4.5**

### Property 6: Weight Value Persistence

*For any* valid weight value (positive number with up to 1 decimal place, ≤ 500kg), saving it should persist the value and make it retrievable for that date.

**Validates: Requirements 3.2, 3.4**

### Property 7: Weight Comparison Display

*For any* two consecutive days where both have weight data, the Weight_Block should display the previous day's weight when viewing the current day.

**Validates: Requirements 3.6**

### Property 8: Weight Input Validation

*For any* input string, the weight validation should accept valid weights (positive numbers with ≤1 decimal, ≤500kg) and reject invalid inputs (negative, non-numeric, >500kg, >1 decimal place) with appropriate error messages.

**Validates: Requirements 3.3, 3.7**

### Property 9: Steps Data Display and Calculation

*For any* steps data (goal and current count), the Steps_Block should display both values and calculate the correct percentage of goal achieved.

**Validates: Requirements 4.1, 4.7**

### Property 10: Steps Input Validation

*For any* input string, the steps validation should accept valid step counts (non-negative integers) and reject invalid inputs (negative, non-integer, non-numeric) with appropriate error messages.

**Validates: Requirements 4.4**

### Property 11: Workout Data Display

*For any* workout data (completed status, type, duration), the Workout_Block should display the completion status and workout type if present.

**Validates: Requirements 5.1, 5.3, 5.5**

### Property 12: Workout Completion Persistence

*For any* workout entry (type and completion status), saving it should persist the data and make it retrievable for that date with a completion indicator visible.

**Validates: Requirements 5.4**

### Property 13: Progress Chart Data Rendering

*For any* set of weight data points over 4 weeks, the Progress_Section should render a chart displaying the trend, and for any nutrition data, should calculate and display adherence percentage.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 14: Photo File Validation

*For any* file upload attempt, the system should accept valid image formats (JPEG, PNG, WebP) under 10MB and reject invalid files (wrong format or >10MB) with appropriate error messages.

**Validates: Requirements 7.3, 7.4**

### Property 15: Photo Upload Persistence

*For any* valid photo upload, the system should save it with the correct week identifier and user ID, and display the upload date and thumbnail preview.

**Validates: Requirements 7.5**

### Property 16: Weekly Plan Data Display

*For any* active weekly plan, the Weekly_Plan_Section should display all plan fields (calorie goal, protein goal, start date, end date) and an active indicator.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

### Property 17: Plan Polling Updates

*For any* weekly plan update by a curator, the client's Weekly_Plan_Section should reflect the updated targets within 30 seconds through polling.

**Validates: Requirements 8.7**

### Property 18: Tasks Data Display

*For any* task, the Tasks_Section should display all task fields (title, description, assigned date, status, week number).

**Validates: Requirements 9.1, 9.2, 9.3, 9.8**

### Property 19: Task Status Update

*For any* task marked as complete by a user, the system should update the task status to 'completed', set the completed_at timestamp, and display a completion indicator.

**Validates: Requirements 9.5**

### Property 20: Weekly Report Validation

*For any* week's data, the weekly report submission should validate that required data exists (nutrition logged for ≥5 days, weight logged for ≥5 days, weekly photo uploaded) and reject submission with specific error messages if requirements are not met.

**Validates: Requirements 10.2, 10.3**

### Property 21: Weekly Report Creation

*For any* valid week's data (meeting all requirements), submitting the weekly report should create a report record, notify the curator, disable editing for that week, and display a "Report submitted" indicator.

**Validates: Requirements 10.4, 10.5, 10.6, 10.7**

### Property 22: Real-time Metric Updates

*For any* metric update (nutrition, weight, steps, workout), the corresponding UI block should update within 500ms without page refresh, and the calendar goal completion indicators should update within 500ms.

**Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**

### Property 23: Responsive Interaction Consistency

*For any* device size (mobile, tablet, desktop), all interactive elements (calendar navigation, quick add buttons, form inputs) should remain fully functional with touch or click interactions.

**Validates: Requirements 12.4**

### Property 24: Content Viewport Fit

*For any* device size, all text and content should be readable without requiring horizontal scrolling.

**Validates: Requirements 12.5**

### Property 25: Orientation Change Adaptation

*For any* device orientation change, the dashboard layout should adapt within 300ms to the new orientation.

**Validates: Requirements 12.6**

### Property 26: Data Persistence Reliability

*For any* metric logged by a user, the system should persist the data to the database immediately and make it retrievable on subsequent loads.

**Validates: Requirements 13.1**

### Property 27: Dashboard Load Performance

*For any* dashboard load, the system should fetch and display all data for the current week within 2 seconds.

**Validates: Requirements 13.2**

### Property 28: Save Error Handling with Retry

*For any* database error during save, the system should display an error message, retain the unsaved data in memory, and allow the user to retry the operation.

**Validates: Requirements 13.3**

### Property 29: Offline Data Sync

*For any* pending changes made while offline, when internet connection is restored, the system should sync all changes to the server.

**Validates: Requirements 13.5**

### Property 30: Authentication Validation

*For all* data operations (read, write, update, delete), the system should validate user authentication and authorization before processing the request.

**Validates: Requirements 13.6**

### Property 31: Curator Plan Validation

*For any* weekly plan created by a curator, the system should validate that required fields exist (calorie goal, protein goal, valid start/end dates with end >= start) and reject invalid plans with error messages.

**Validates: Requirements 14.1, 14.2**

### Property 32: Curator Task Validation

*For any* task assigned by a curator, the system should validate that required fields exist (title, description, due date) and reject invalid tasks with error messages.

**Validates: Requirements 14.3**

### Property 33: Curator-Client Notification

*For any* curator update (plan or task) or client action (weekly report submission), the system should notify the relevant party (client or curator) within 30 seconds.

**Validates: Requirements 14.4, 14.5**

### Property 34: Curator Authorization

*For all* curator actions (create/update plan, assign/update task, view client data), the system should verify the curator has an active relationship with the specific client before processing.

**Validates: Requirements 14.6**

### Property 35: Keyboard Navigation Support

*For all* interactive elements (buttons, inputs, links, calendar days), the system should provide full keyboard navigation support with visible focus indicators.

**Validates: Requirements 15.1, 15.4**

### Property 36: Screen Reader Accessibility

*For all* visual indicators (goal completion checkmarks, progress bars, status icons), the system should provide text alternatives (ARIA labels, alt text) for screen readers.

**Validates: Requirements 15.2**

### Property 37: Form Accessibility

*For all* form inputs, the system should provide clear labels, error messages, and ARIA live region announcements for errors.

**Validates: Requirements 15.3, 15.6**

### Property 38: Color-Independent Information

*For all* color-coded information (completion status, warnings, progress indicators), the system should provide additional non-color indicators (icons, text labels, patterns).

**Validates: Requirements 15.5**

### Property 39: Attention Indicator Display

*For any* incomplete daily metric on the current day, the corresponding block should display a visual attention indicator (badge, highlight, or icon).

**Validates: Requirements 15.1, 15.2, 15.3, 15.4**

### Property 40: Attention Indicator Removal

*For any* attention indicator displayed, when the user completes the corresponding action, the indicator should disappear within 500ms.

**Validates: Requirements 15.11**

### Property 41: Task Attention Indicator

*For any* incomplete task approaching due date (within 2 days), the Tasks_Section should display an attention indicator with the count of urgent tasks.

**Validates: Requirements 15.6**

### Property 42: Weekly Plan Adherence Indicator

*For any* active weekly plan where daily goals are not being met (< 80% adherence for 2+ consecutive days), the Weekly_Plan_Section should display an attention indicator.

**Validates: Requirements 15.7**

### Property 43: Photo Upload Attention Indicator

*For any* week end (Saturday or Sunday) where the weekly photo is not uploaded, the Photo_Upload_Section should display a prominent attention indicator.

**Validates: Requirements 15.8**

### Property 44: Weekly Report Submission Indicator

*For any* Sunday where the weekly report is not submitted, the Calendar_Navigator should display a pulsing attention indicator on the submit button.

**Validates: Requirements 15.9**

### Property 45: Attention Indicator Accessibility

*For all* attention indicators, the system should provide ARIA labels and announcements for screen reader users.

**Validates: Requirements 15.10, 15.12**

## Error Handling

### Client-Side Error Handling

**Input Validation Errors**:
- Display inline error messages below form fields
- Prevent form submission until errors are resolved
- Use red text and error icons for visibility
- Announce errors to screen readers via ARIA live regions

**Network Errors**:
- Display toast notifications for failed API calls
- Implement automatic retry with exponential backoff (3 attempts)
- Show "Retry" button for manual retry
- Cache unsaved data in localStorage for recovery

**Authentication Errors**:
- Redirect to login page with return URL
- Display session expired message
- Preserve unsaved data in localStorage
- Auto-restore data after re-authentication

**File Upload Errors**:
- Validate file size and type before upload
- Display progress indicator during upload
- Show specific error messages (file too large, invalid format)
- Allow user to select different file

### Server-Side Error Handling

**Database Errors**:
- Log errors with context (user ID, operation, timestamp)
- Return appropriate HTTP status codes (500 for server errors)
- Return user-friendly error messages (hide technical details)
- Implement database connection pooling and retry logic

**Validation Errors**:
- Return 400 Bad Request with detailed validation errors
- Include field names and specific error messages
- Use consistent error response format:
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "weight", "message": "Weight must be a positive number" }
  ]
}
```

**Authorization Errors**:
- Return 401 Unauthorized for authentication failures
- Return 403 Forbidden for authorization failures
- Log unauthorized access attempts
- Include minimal information in error response (security)

**Rate Limiting**:
- Implement rate limiting per user (100 requests/minute)
- Return 429 Too Many Requests when limit exceeded
- Include Retry-After header
- Log rate limit violations

### Error Recovery Strategies

**Optimistic Updates with Rollback**:
```typescript
async function updateMetric(metric: MetricUpdate) {
  // 1. Optimistically update UI
  const previousState = store.getState()
  store.updateMetric(metric)
  
  try {
    // 2. Send to server
    await api.updateMetric(metric)
  } catch (error) {
    // 3. Rollback on failure
    store.setState(previousState)
    toast.error('Failed to save. Please try again.')
    
    // 4. Store for retry
    localStorage.setItem('pendingUpdate', JSON.stringify(metric))
  }
}
```

**Offline Queue**:
- Queue all mutations when offline
- Store queue in localStorage
- Process queue when connection restored
- Show sync status indicator

**Graceful Degradation**:
- Show cached data when API fails
- Disable features that require server connection
- Display "Offline mode" indicator
- Allow read-only access to cached data

## Testing Strategy

### Dual Testing Approach

The dashboard feature requires both unit testing and property-based testing for comprehensive coverage:

**Unit Tests**: Verify specific examples, edge cases, and error conditions
- Specific UI rendering scenarios
- Navigation flows
- Error handling paths
- Integration between components

**Property Tests**: Verify universal properties across all inputs
- Data validation rules
- Calculation correctness
- State management consistency
- Accessibility compliance

Together, these approaches provide comprehensive coverage where unit tests catch concrete bugs and property tests verify general correctness.

### Property-Based Testing Configuration

**Library**: fast-check (TypeScript/JavaScript property-based testing library)

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `Feature: dashboard, Property {N}: {property_text}`

**Example Property Test**:
```typescript
import fc from 'fast-check'

describe('Property 8: Weight Input Validation', () => {
  it('accepts valid weights and rejects invalid inputs', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.float({ min: 0.1, max: 500, noNaN: true }), // valid
          fc.float({ min: -100, max: -0.1 }), // invalid: negative
          fc.float({ min: 500.1, max: 1000 }), // invalid: > 500
          fc.constant('abc'), // invalid: non-numeric
        ),
        (input) => {
          const result = validateWeight(input)
          
          if (typeof input === 'number' && input > 0 && input <= 500) {
            expect(result.isValid).toBe(true)
          } else {
            expect(result.isValid).toBe(false)
            expect(result.error).toBeDefined()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: dashboard, Property 8: Weight Input Validation
```

### Backend Property-Based Testing

**Library**: gopter (Go property-based testing library)

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number

**Example Property Test**:
```go
import (
    "testing"
    "github.com/leanovate/gopter"
    "github.com/leanovate/gopter/gen"
    "github.com/leanovate/gopter/prop"
)

// Feature: dashboard, Property 26: Data Persistence Reliability
func TestDataPersistenceProperty(t *testing.T) {
    properties := gopter.NewProperties(nil)
    
    properties.Property("any metric persisted is retrievable", prop.ForAll(
        func(metric DailyMetrics) bool {
            // Save metric
            err := service.SaveMetric(ctx, metric)
            if err != nil {
                return false
            }
            
            // Retrieve metric
            retrieved, err := service.GetMetric(ctx, metric.UserID, metric.Date)
            if err != nil {
                return false
            }
            
            // Verify equality
            return metricsEqual(metric, retrieved)
        },
        genDailyMetrics(),
    ))
    
    properties.TestingRun(t, gopter.ConsoleReporter(t))
}
```

### Unit Testing Strategy

**Frontend Unit Tests** (Jest + React Testing Library):
- Component rendering with different props
- User interactions (clicks, inputs, navigation)
- State management (Zustand store actions)
- API integration with MSW mocks
- Accessibility (keyboard navigation, screen readers)

**Backend Unit Tests** (Go testing + testify):
- HTTP handler responses
- Service layer business logic
- Database queries (with mock DB)
- Validation logic
- Authorization checks

**Coverage Goals**:
- Overall: 80%+ coverage
- Critical paths: 95%+ coverage
- Property tests: 100% of correctness properties implemented

### Integration Testing

**End-to-End Tests** (Playwright):
- Complete user flows (login → dashboard → log metrics → submit report)
- Cross-browser testing (Chrome, Firefox, Safari)
- Mobile and desktop viewports
- Offline/online transitions
- Real-time updates and polling

**API Integration Tests**:
- Full request/response cycles
- Database transactions
- Authentication and authorization
- Error scenarios
- Rate limiting

### Test Organization

```
apps/web/src/features/dashboard/
  components/
    __tests__/
      DashboardPage.test.tsx
      CalendarNavigator.test.tsx
      NutritionBlock.test.tsx
      ...
  hooks/
    __tests__/
      useDashboardStore.test.ts
      ...
  utils/
    __tests__/
      validation.test.ts
      calculations.test.ts
      ...
  __tests__/
    properties/
      weight-validation.property.test.ts
      data-persistence.property.test.ts
      ...

apps/api/internal/modules/dashboard/
  handler_test.go
  service_test.go
  validation_test.go
  properties_test.go
```

### Testing Best Practices

1. **Test Isolation**: Each test should be independent and not rely on other tests
2. **Mock External Dependencies**: Use MSW for API mocks, mock database for Go tests
3. **Test User Behavior**: Focus on what users do, not implementation details
4. **Accessibility Testing**: Include keyboard navigation and screen reader tests
5. **Property Test Generators**: Create reusable generators for test data
6. **Error Scenarios**: Test both happy paths and error conditions
7. **Performance Testing**: Verify load times and update latencies
8. **Visual Regression**: Use snapshot tests for UI components (sparingly)

## API Endpoints

### Dashboard Data Endpoints

**GET /api/dashboard/daily/:date**
- Fetch daily metrics for a specific date
- Query params: `date` (ISO date string)
- Response: `DailyMetrics` object
- Auth: Required (user must own data or be assigned curator)

**POST /api/dashboard/daily**
- Create or update daily metrics
- Body: `MetricUpdate` object
- Response: Updated `DailyMetrics`
- Auth: Required (user can only update own data)

**GET /api/dashboard/week**
- Fetch daily metrics for a week
- Query params: `start` (ISO date), `end` (ISO date)
- Response: Array of `DailyMetrics`
- Auth: Required

**GET /api/dashboard/weekly-plan**
- Fetch active weekly plan for user
- Response: `WeeklyPlan` object or null
- Auth: Required

**POST /api/dashboard/weekly-plan** (Curator only)
- Create or update weekly plan for client
- Body: `WeeklyPlan` object
- Response: Created `WeeklyPlan`
- Auth: Required (curator must have active relationship with client)

**GET /api/dashboard/tasks**
- Fetch tasks for user
- Query params: `week` (optional week number)
- Response: Array of `Task` objects
- Auth: Required

**POST /api/dashboard/tasks** (Curator only)
- Create task for client
- Body: `Task` object
- Response: Created `Task`
- Auth: Required (curator must have active relationship with client)

**PATCH /api/dashboard/tasks/:id**
- Update task status (mark complete)
- Body: `{ status: 'completed' }`
- Response: Updated `Task`
- Auth: Required (user can only update own tasks)

**POST /api/dashboard/weekly-report**
- Submit weekly report
- Body: `{ weekStart: Date, weekEnd: Date }`
- Response: Created `WeeklyReport`
- Auth: Required
- Validation: Checks required data (5+ days nutrition, 5+ days weight, photo)

**POST /api/dashboard/photo-upload**
- Upload weekly photo
- Body: FormData with file and week identifier
- Response: `{ url: string, uploadedAt: Date }`
- Auth: Required
- Validation: File size (max 10MB), format (JPEG, PNG, WebP)

**GET /api/dashboard/progress**
- Fetch progress data (weight trends, adherence)
- Query params: `weeks` (number of weeks, default 4)
- Response: `ProgressData` object
- Auth: Required

### Response Formats

**Success Response**:
```json
{
  "data": { /* response data */ },
  "message": "Success"
}
```

**Error Response**:
```json
{
  "error": "Error message",
  "details": [
    { "field": "fieldName", "message": "Specific error" }
  ]
}
```

**Validation Error Response**:
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "weight", "message": "Weight must be positive" },
    { "field": "calories", "message": "Calories must be non-negative" }
  ]
}
```

## Performance Considerations

### Frontend Optimization

**Code Splitting**:
- Lazy load dashboard components
- Split by route (dashboard, analytics, settings)
- Use React.lazy() and Suspense

**Data Fetching**:
- Fetch only current week data on initial load
- Prefetch adjacent weeks on navigation
- Cache API responses in Zustand store
- Implement stale-while-revalidate pattern

**Rendering Optimization**:
- Use React.memo for expensive components
- Implement virtual scrolling for long task lists
- Debounce input handlers (weight, steps)
- Throttle scroll and resize handlers

**Bundle Size**:
- Tree-shake unused dependencies
- Use dynamic imports for charts (Recharts)
- Optimize images (WebP format, lazy loading)
- Minimize CSS (Tailwind purge)

### Backend Optimization

**Database Queries**:
- Use indexes on frequently queried columns (user_id, date)
- Batch fetch week data in single query
- Use connection pooling
- Implement query result caching (Redis)

**API Performance**:
- Implement response compression (gzip)
- Use HTTP/2 for multiplexing
- Set appropriate cache headers
- Implement rate limiting per user

**Caching Strategy**:
- Cache weekly plans (30 second TTL)
- Cache progress data (5 minute TTL)
- Invalidate cache on data updates
- Use Redis for distributed caching

### Monitoring

**Frontend Metrics**:
- Page load time (target: < 2s)
- Time to interactive (target: < 3s)
- API response times
- Error rates

**Backend Metrics**:
- API endpoint latencies (p50, p95, p99)
- Database query times
- Error rates and types
- Active connections

**Alerts**:
- Page load time > 3s
- API error rate > 5%
- Database connection pool exhausted
- Disk space < 20%

## Security Considerations

### Authentication & Authorization

**JWT-Based Authentication**:
- Tokens stored in httpOnly cookies
- Short-lived access tokens (15 minutes)
- Refresh tokens for renewal
- Secure token transmission (HTTPS only)

**Row-Level Security (RLS)**:
- All database tables have RLS policies
- Users can only access own data
- Curators can access client data (with active relationship)
- Super admins have full access

**Authorization Checks**:
- Verify user identity on every request
- Check curator-client relationship for curator actions
- Validate resource ownership before operations
- Log unauthorized access attempts

### Input Validation

**Client-Side Validation**:
- Validate all inputs before submission
- Use Zod schemas for type safety
- Sanitize user inputs (prevent XSS)
- Limit input lengths

**Server-Side Validation**:
- Never trust client-side validation
- Validate all inputs on server
- Use parameterized queries (prevent SQL injection)
- Validate file uploads (size, type, content)

### Data Protection

**Sensitive Data**:
- Encrypt sensitive data at rest
- Use HTTPS for all communications
- Mask sensitive data in logs
- Implement data retention policies

**File Uploads**:
- Validate file types (whitelist)
- Scan for malware
- Store in isolated storage (S3, Cloud Storage)
- Generate unique filenames (prevent overwrites)

**Rate Limiting**:
- Limit API requests per user (100/minute)
- Limit file uploads per user (10/day)
- Implement CAPTCHA for suspicious activity
- Block IPs with excessive failed attempts

### CORS Configuration

```go
router.Use(cors.New(cors.Config{
    AllowOrigins:     []string{"https://burcev.team"},
    AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE"},
    AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
    ExposeHeaders:    []string{"Content-Length"},
    AllowCredentials: true,
    MaxAge:           12 * time.Hour,
}))
```

## Deployment Considerations

### Environment Configuration

**Environment Variables**:
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/burcev
DB_MAX_CONNECTIONS=20
DB_IDLE_CONNECTIONS=5

# API
API_PORT=4000
API_URL=https://api.burcev.team
JWT_SECRET=<secret>
JWT_EXPIRY=15m

# Frontend
NEXT_PUBLIC_API_URL=https://api.burcev.team
NEXT_PUBLIC_ENV=production

# Storage
STORAGE_BUCKET=burcev-photos
STORAGE_REGION=ru-central1

# Monitoring
SENTRY_DSN=<dsn>
LOG_LEVEL=info
```

### Database Migrations

**Migration Files**:
- Located in `apps/api/migrations/`
- Numbered sequentially (001_, 002_, etc.)
- Include both up and down migrations
- Test migrations on staging before production

**Migration Process**:
1. Create migration file
2. Test on local database
3. Deploy to staging
4. Verify data integrity
5. Deploy to production
6. Monitor for errors

### Deployment Steps

**Frontend Deployment**:
1. Build Next.js app: `npm run build`
2. Run tests: `npm test`
3. Deploy to Vercel or VPS
4. Verify deployment
5. Monitor error rates

**Backend Deployment**:
1. Build Go binary: `make build-api`
2. Run tests: `make test-api`
3. Build Docker image
4. Push to registry
5. Deploy to VPS
6. Run migrations
7. Verify health endpoint
8. Monitor logs

### Rollback Strategy

**Frontend Rollback**:
- Keep previous build artifacts
- Use Vercel instant rollback
- Or redeploy previous Docker image

**Backend Rollback**:
- Keep previous Docker images (last 5)
- Redeploy previous image
- Rollback database migrations if needed
- Verify data consistency

### Monitoring & Logging

**Application Logs**:
- Structured logging with Zap (Go)
- Log levels: debug, info, warn, error
- Include context (user ID, request ID, timestamp)
- Ship logs to centralized system (ELK, Loki)

**Error Tracking**:
- Use Sentry for error tracking
- Capture stack traces
- Include user context
- Set up alerts for critical errors

**Health Checks**:
- `/health` endpoint for liveness
- `/ready` endpoint for readiness
- Check database connectivity
- Check external service availability

## Future Enhancements

### Phase 1 Enhancements (Post-MVP)

1. **Offline Support**:
   - Service worker for offline caching
   - IndexedDB for local data storage
   - Background sync when online
   - Offline indicator in UI

2. **Advanced Analytics**:
   - Trend predictions (weight, nutrition)
   - Goal achievement probability
   - Personalized recommendations
   - Comparative analytics (vs. similar users)

3. **Gamification**:
   - Achievement badges
   - Streak tracking
   - Leaderboards (opt-in)
   - Challenges and competitions

### Phase 2 Enhancements

1. **Social Features**:
   - Share progress with friends
   - Community challenges
   - Public profiles (opt-in)
   - Social feed

2. **Integration**:
   - Fitness tracker sync (Fitbit, Apple Health)
   - Smart scale integration
   - Calendar integration
   - Third-party app webhooks

3. **AI Features**:
   - Meal photo recognition
   - Automatic calorie estimation
   - Personalized meal suggestions
   - Chatbot for quick logging

### Technical Debt

1. **Testing**:
   - Increase E2E test coverage
   - Add visual regression tests
   - Implement load testing
   - Add chaos engineering tests

2. **Performance**:
   - Implement GraphQL for flexible queries
   - Add Redis caching layer
   - Optimize database queries
   - Implement CDN for static assets

3. **Developer Experience**:
   - Improve error messages
   - Add more TypeScript types
   - Better documentation
   - Automated deployment pipeline
