-- Migration: Rename Coach to Curator
-- Description: Renames all coach-related tables, columns, indexes, and RLS policies to use curator terminology
-- Version: 010
-- Date: 2026-01-30

-- ============================================================================
-- 1. Rename coach_client_relationships table to curator_client_relationships
-- ============================================================================

ALTER TABLE coach_client_relationships
RENAME TO curator_client_relationships;

-- ============================================================================
-- 2. Rename coach_id columns to curator_id in all tables
-- ============================================================================

-- curator_client_relationships (formerly coach_client_relationships)
ALTER TABLE curator_client_relationships
RENAME COLUMN coach_id TO curator_id;

-- weekly_plans
ALTER TABLE weekly_plans
RENAME COLUMN coach_id TO curator_id;

-- tasks
ALTER TABLE tasks
RENAME COLUMN coach_id TO curator_id;

-- weekly_reports
ALTER TABLE weekly_reports
RENAME COLUMN coach_id TO curator_id;

-- ============================================================================
-- 3. Rename coach_feedback column to curator_feedback in weekly_reports
-- ============================================================================

ALTER TABLE weekly_reports
RENAME COLUMN coach_feedback TO curator_feedback;

-- ============================================================================
-- 4. Drop old indexes and create new ones with curator naming
-- ============================================================================

-- Drop old indexes on curator_client_relationships (formerly coach_client_relationships)
DROP INDEX IF EXISTS idx_coach_client_coach;
DROP INDEX IF EXISTS idx_coach_client_client;

-- Create new indexes on curator_client_relationships
CREATE INDEX IF NOT EXISTS idx_curator_client_curator ON curator_client_relationships(curator_id, status);
CREATE INDEX IF NOT EXISTS idx_curator_client_client ON curator_client_relationships(client_id, status);

-- Drop old indexes on weekly_plans
DROP INDEX IF EXISTS idx_weekly_plans_coach;

-- Create new index on weekly_plans
CREATE INDEX IF NOT EXISTS idx_weekly_plans_curator ON weekly_plans(curator_id, created_at DESC);

-- Drop old indexes on tasks
DROP INDEX IF EXISTS idx_tasks_coach;

-- Create new index on tasks
CREATE INDEX IF NOT EXISTS idx_tasks_curator ON tasks(curator_id, created_at DESC);

-- Drop old indexes on weekly_reports
DROP INDEX IF EXISTS idx_weekly_reports_coach;

-- Create new index on weekly_reports
CREATE INDEX IF NOT EXISTS idx_weekly_reports_curator ON weekly_reports(curator_id, submitted_at DESC);

-- ============================================================================
-- 5. Drop old RLS policies and create new ones with Curator naming
-- ============================================================================

-- Drop old policies on curator_client_relationships
DROP POLICY IF EXISTS "Coaches can view own relationships" ON curator_client_relationships;
DROP POLICY IF EXISTS "Clients can view own relationships" ON curator_client_relationships;
DROP POLICY IF EXISTS "Coaches can create relationships" ON curator_client_relationships;
DROP POLICY IF EXISTS "Coaches can update own relationships" ON curator_client_relationships;

-- Create new policies on curator_client_relationships
CREATE POLICY "Curators can view own relationships"
  ON curator_client_relationships FOR SELECT
  USING (curator_id = current_setting('app.current_user_id')::BIGINT);

CREATE POLICY "Clients can view own curator relationships"
  ON curator_client_relationships FOR SELECT
  USING (client_id = current_setting('app.current_user_id')::BIGINT);

CREATE POLICY "Curators can create relationships"
  ON curator_client_relationships FOR INSERT
  WITH CHECK (curator_id = current_setting('app.current_user_id')::BIGINT);

CREATE POLICY "Curators can update own relationships"
  ON curator_client_relationships FOR UPDATE
  USING (curator_id = current_setting('app.current_user_id')::BIGINT);

-- Drop old policies on daily_metrics that reference coach
DROP POLICY IF EXISTS "Coaches can view client metrics" ON daily_metrics;

-- Create new policy on daily_metrics
CREATE POLICY "Curators can view client metrics"
  ON daily_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM curator_client_relationships
      WHERE curator_id = current_setting('app.current_user_id')::BIGINT
      AND client_id = daily_metrics.user_id
      AND status = 'active'
    )
  );

-- Drop old policies on weekly_plans that reference coach
DROP POLICY IF EXISTS "Coaches can manage client plans" ON weekly_plans;

-- Create new policy on weekly_plans
CREATE POLICY "Curators can manage client plans"
  ON weekly_plans FOR ALL
  USING (
    curator_id = current_setting('app.current_user_id')::BIGINT AND
    EXISTS (
      SELECT 1 FROM curator_client_relationships
      WHERE curator_id = current_setting('app.current_user_id')::BIGINT
      AND client_id = weekly_plans.user_id
      AND status = 'active'
    )
  );

-- Drop old policies on tasks that reference coach
DROP POLICY IF EXISTS "Coaches can manage client tasks" ON tasks;

-- Create new policy on tasks
CREATE POLICY "Curators can manage client tasks"
  ON tasks FOR ALL
  USING (
    curator_id = current_setting('app.current_user_id')::BIGINT AND
    EXISTS (
      SELECT 1 FROM curator_client_relationships
      WHERE curator_id = current_setting('app.current_user_id')::BIGINT
      AND client_id = tasks.user_id
      AND status = 'active'
    )
  );

-- Drop old policies on weekly_reports that reference coach
DROP POLICY IF EXISTS "Coaches can view and update client reports" ON weekly_reports;

-- Create new policy on weekly_reports
CREATE POLICY "Curators can view and update client reports"
  ON weekly_reports FOR ALL
  USING (
    curator_id = current_setting('app.current_user_id')::BIGINT AND
    EXISTS (
      SELECT 1 FROM curator_client_relationships
      WHERE curator_id = current_setting('app.current_user_id')::BIGINT
      AND client_id = weekly_reports.user_id
      AND status = 'active'
    )
  );

-- Drop old policies on weekly_photos that reference coach
DROP POLICY IF EXISTS "Coaches can view client photos" ON weekly_photos;

-- Create new policy on weekly_photos
CREATE POLICY "Curators can view client photos"
  ON weekly_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM curator_client_relationships
      WHERE curator_id = current_setting('app.current_user_id')::BIGINT
      AND client_id = weekly_photos.user_id
      AND status = 'active'
    )
  );

-- ============================================================================
-- 6. Update table comments
-- ============================================================================

COMMENT ON TABLE curator_client_relationships IS 'Relationships between curators and clients';
COMMENT ON COLUMN curator_client_relationships.curator_id IS 'ID of the curator (fitness trainer/nutritionist)';
COMMENT ON COLUMN curator_client_relationships.status IS 'Relationship status: active, inactive, or pending';

COMMENT ON TABLE weekly_plans IS 'Weekly nutrition and activity plans assigned by curators';
COMMENT ON COLUMN weekly_plans.curator_id IS 'ID of the curator who created the plan';

COMMENT ON TABLE tasks IS 'Tasks assigned by curators to clients';
COMMENT ON COLUMN tasks.curator_id IS 'ID of the curator who assigned the task';

COMMENT ON TABLE weekly_reports IS 'Weekly progress reports submitted by clients to curators';
COMMENT ON COLUMN weekly_reports.curator_id IS 'ID of the curator receiving the report';
COMMENT ON COLUMN weekly_reports.curator_feedback IS 'Feedback from the curator on the weekly report';

-- ============================================================================
-- Migration complete
-- ============================================================================
