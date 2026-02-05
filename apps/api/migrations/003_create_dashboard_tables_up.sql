-- Migration: Create Dashboard Tables
-- Description: Creates all dashboard-related tables (daily_metrics, weekly_plans, tasks, weekly_reports, weekly_photos, coach_client_relationships)
-- Version: 003
-- Date: 2026-01-29

-- ============================================================================
-- 1. Create coach_client_relationships table
-- ============================================================================

CREATE TABLE IF NOT EXISTS coach_client_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(coach_id, client_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_coach_client_coach ON coach_client_relationships(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_coach_client_client ON coach_client_relationships(client_id, status);

-- Add comments
COMMENT ON TABLE coach_client_relationships IS 'Relationships between coaches and clients';
COMMENT ON COLUMN coach_client_relationships.status IS 'Relationship status: active, inactive, or pending';

-- ============================================================================
-- 2. Create daily_metrics table
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_daily_metrics_user_date ON daily_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(date DESC);

-- Add comments
COMMENT ON TABLE daily_metrics IS 'Daily tracking metrics for nutrition, weight, and activity';
COMMENT ON COLUMN daily_metrics.weight IS 'Morning weight in kg (up to 1 decimal place)';
COMMENT ON COLUMN daily_metrics.workout_duration IS 'Workout duration in minutes';

-- ============================================================================
-- 3. Create weekly_plans table
-- ============================================================================

CREATE TABLE IF NOT EXISTS weekly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by BIGINT NOT NULL REFERENCES users(id),

  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_weekly_plans_user_active ON weekly_plans(user_id, is_active, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_plans_dates ON weekly_plans(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_weekly_plans_coach ON weekly_plans(coach_id, created_at DESC);

-- Add comments
COMMENT ON TABLE weekly_plans IS 'Weekly nutrition and activity plans assigned by coaches';
COMMENT ON COLUMN weekly_plans.is_active IS 'Whether the plan is currently active';

-- ============================================================================
-- 4. Create tasks table
-- ============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Content
  title TEXT NOT NULL,
  description TEXT,

  -- Timing
  week_number INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  due_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'overdue')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status, due_date DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_week ON tasks(user_id, week_number DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_coach ON tasks(coach_id, created_at DESC);

-- Add comments
COMMENT ON TABLE tasks IS 'Tasks assigned by coaches to clients';
COMMENT ON COLUMN tasks.week_number IS 'Week number for organizing tasks';
COMMENT ON COLUMN tasks.status IS 'Task status: active, completed, or overdue';

-- ============================================================================
-- 5. Create weekly_reports table
-- ============================================================================

CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Week identifier
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_number INTEGER NOT NULL,

  -- Summary data (JSON for flexibility)
  summary JSONB NOT NULL,

  -- Photo
  photo_url TEXT,

  -- Status
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  coach_feedback TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, week_start)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week ON weekly_reports(user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_coach ON weekly_reports(coach_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_summary ON weekly_reports USING GIN (summary);

-- Add comments
COMMENT ON TABLE weekly_reports IS 'Weekly progress reports submitted by clients to coaches';
COMMENT ON COLUMN weekly_reports.summary IS 'JSON summary of weekly metrics (days logged, averages, totals)';

-- ============================================================================
-- 6. Create weekly_photos table
-- ============================================================================

CREATE TABLE IF NOT EXISTS weekly_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Week identifier
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_identifier TEXT NOT NULL, -- e.g., "2024-W01"

  -- Photo data
  photo_url TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,

  -- Metadata
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, week_identifier)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_weekly_photos_user_week ON weekly_photos(user_id, week_start DESC);

-- Add comments
COMMENT ON TABLE weekly_photos IS 'Weekly body form photos uploaded by clients';
COMMENT ON COLUMN weekly_photos.week_identifier IS 'ISO week identifier (e.g., 2024-W01)';
COMMENT ON COLUMN weekly_photos.file_size IS 'File size in bytes';

-- ============================================================================
-- Migration complete
-- ============================================================================
