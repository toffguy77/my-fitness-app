-- Migration: Rollback Rename Coach to Curator
-- Description: Reverts all curator-related tables, columns, indexes, and RLS policies back to coach terminology
-- Version: 010
-- Date: 2026-01-30

-- ============================================================================
-- 1. Rename curator_feedback column back to coach_feedback in weekly_reports
-- ============================================================================

ALTER TABLE weekly_reports 
RENAME COLUMN curator_feedback TO coach_feedback;

-- ============================================================================
-- 2. Rename curator_id columns back to coach_id in all tables
-- ============================================================================

-- weekly_reports
ALTER TABLE weekly_reports 
RENAME COLUMN curator_id TO coach_id;

-- tasks
ALTER TABLE tasks 
RENAME COLUMN curator_id TO coach_id;

-- weekly_plans
ALTER TABLE weekly_plans 
RENAME COLUMN curator_id TO coach_id;

-- curator_client_relationships (will be renamed to coach_client_relationships)
ALTER TABLE curator_client_relationships 
RENAME COLUMN curator_id TO coach_id;

-- ============================================================================
-- 3. Rename curator_client_relationships table back to coach_client_relationships
-- ============================================================================

ALTER TABLE curator_client_relationships 
RENAME TO coach_client_relationships;

-- ============================================================================
-- 4. Drop new indexes and recreate old ones with coach naming
-- ============================================================================

-- Drop new indexes on coach_client_relationships (formerly curator_client_relationships)
DROP INDEX IF EXISTS idx_curator_client_curator;
DROP INDEX IF EXISTS idx_curator_client_client;

-- Recreate old indexes on coach_client_relationships
CREATE INDEX IF NOT EXISTS idx_coach_client_coach ON coach_client_relationships(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_coach_client_client ON coach_client_relationships(client_id, status);

-- Drop new index on weekly_plans
DROP INDEX IF EXISTS idx_weekly_plans_curator;

-- Recreate old index on weekly_plans
CREATE INDEX IF NOT EXISTS idx_weekly_plans_coach ON weekly_plans(coach_id, created_at DESC);

-- Drop new index on tasks
DROP INDEX IF EXISTS idx_tasks_curator;

-- Recreate old index on tasks
CREATE INDEX IF NOT EXISTS idx_tasks_coach ON tasks(coach_id, created_at DESC);

-- Drop new index on weekly_reports
DROP INDEX IF EXISTS idx_weekly_reports_curator;

-- Recreate old index on weekly_reports
CREATE INDEX IF NOT EXISTS idx_weekly_reports_coach ON weekly_reports(coach_id, submitted_at DESC);

-- ============================================================================
-- 5. Drop new RLS policies and recreate old ones with Coach naming
-- ============================================================================

-- Drop new policies on coach_client_relationships
DROP POLICY IF EXISTS "Curators can view own relationships" ON coach_client_relationships;
DROP POLICY IF EXISTS "Clients can view own curator relationships" ON coach_client_relationships;
DROP POLICY IF EXISTS "Curators can create relationships" ON coach_client_relationships;
DROP POLICY IF EXISTS "Curators can update own relationships" ON coach_client_relationships;

-- Recreate old policies on coach_client_relationships
CREATE POLICY "Coaches can view own relationships"
  ON coach_client_relationships FOR SELECT
  USING (coach_id = current_setting('app.current_user_id')::BIGINT);

CREATE POLICY "Clients can view own relationships"
  ON coach_client_relationships FOR SELECT
  USING (client_id = current_setting('app.current_user_id')::BIGINT);

CREATE POLICY "Coaches can create relationships"
  ON coach_client_relationships FOR INSERT
  WITH CHECK (coach_id = current_setting('app.current_user_id')::BIGINT);

CREATE POLICY "Coaches can update own relationships"
  ON coach_client_relationships FOR UPDATE
  USING (coach_id = current_setting('app.current_user_id')::BIGINT);

-- Drop new policy on daily_metrics
DROP POLICY IF EXISTS "Curators can view client metrics" ON daily_metrics;

-- Recreate old policy on daily_metrics
CREATE POLICY "Coaches can view client metrics"
  ON daily_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_client_relationships
      WHERE coach_id = current_setting('app.current_user_id')::BIGINT
      AND client_id = daily_metrics.user_id
      AND status = 'active'
    )
  );

-- Drop new policy on weekly_plans
DROP POLICY IF EXISTS "Curators can manage client plans" ON weekly_plans;

-- Recreate old policy on weekly_plans
CREATE POLICY "Coaches can manage client plans"
  ON weekly_plans FOR ALL
  USING (
    coach_id = current_setting('app.current_user_id')::BIGINT AND
    EXISTS (
      SELECT 1 FROM coach_client_relationships
      WHERE coach_id = current_setting('app.current_user_id')::BIGINT
      AND client_id = weekly_plans.user_id
      AND status = 'active'
    )
  );

-- Drop new policy on tasks
DROP POLICY IF EXISTS "Curators can manage client tasks" ON tasks;

-- Recreate old policy on tasks
CREATE POLICY "Coaches can manage client tasks"
  ON tasks FOR ALL
  USING (
    coach_id = current_setting('app.current_user_id')::BIGINT AND
    EXISTS (
      SELECT 1 FROM coach_client_relationships
      WHERE coach_id = current_setting('app.current_user_id')::BIGINT
      AND client_id = tasks.user_id
      AND status = 'active'
    )
  );

-- Drop new policy on weekly_reports
DROP POLICY IF EXISTS "Curators can view and update client reports" ON weekly_reports;

-- Recreate old policy on weekly_reports
CREATE POLICY "Coaches can view and update client reports"
  ON weekly_reports FOR ALL
  USING (
    coach_id = current_setting('app.current_user_id')::BIGINT AND
    EXISTS (
      SELECT 1 FROM coach_client_relationships
      WHERE coach_id = current_setting('app.current_user_id')::BIGINT
      AND client_id = weekly_reports.user_id
      AND status = 'active'
    )
  );

-- Drop new policy on weekly_photos
DROP POLICY IF EXISTS "Curators can view client photos" ON weekly_photos;

-- Recreate old policy on weekly_photos
CREATE POLICY "Coaches can view client photos"
  ON weekly_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_client_relationships
      WHERE coach_id = current_setting('app.current_user_id')::BIGINT
      AND client_id = weekly_photos.user_id
      AND status = 'active'
    )
  );

-- ============================================================================
-- 6. Restore original table comments
-- ============================================================================

COMMENT ON TABLE coach_client_relationships IS 'Relationships between coaches and clients';
COMMENT ON COLUMN coach_client_relationships.coach_id IS 'ID of the coach (fitness trainer/nutritionist)';
COMMENT ON COLUMN coach_client_relationships.status IS 'Relationship status: active, inactive, or pending';

COMMENT ON TABLE weekly_plans IS 'Weekly nutrition and activity plans assigned by coaches';
COMMENT ON COLUMN weekly_plans.coach_id IS 'ID of the coach who created the plan';

COMMENT ON TABLE tasks IS 'Tasks assigned by coaches to clients';
COMMENT ON COLUMN tasks.coach_id IS 'ID of the coach who assigned the task';

COMMENT ON TABLE weekly_reports IS 'Weekly progress reports submitted by clients to coaches';
COMMENT ON COLUMN weekly_reports.coach_id IS 'ID of the coach receiving the report';
COMMENT ON COLUMN weekly_reports.coach_feedback IS 'Feedback from the coach on the weekly report';

-- ============================================================================
-- Migration rollback complete
-- ============================================================================
