-- Migration: Dashboard RLS Policies
-- Description: Implements Row Level Security policies for all dashboard tables
-- Version: 004
-- Date: 2026-01-29

-- ============================================================================
-- 1. Enable RLS on all dashboard tables
-- ============================================================================

ALTER TABLE coach_client_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_photos ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Coach-Client Relationships RLS Policies
-- ============================================================================

-- Coaches can view their relationships
CREATE POLICY "Coaches can view own relationships"
  ON coach_client_relationships FOR SELECT
  USING (coach_id = current_setting('app.current_user_id')::BIGINT);

-- Clients can view their relationships
CREATE POLICY "Clients can view own relationships"
  ON coach_client_relationships FOR SELECT
  USING (client_id = current_setting('app.current_user_id')::BIGINT);

-- Only coaches can create relationships
CREATE POLICY "Coaches can create relationships"
  ON coach_client_relationships FOR INSERT
  WITH CHECK (coach_id = current_setting('app.current_user_id')::BIGINT);

-- Only coaches can update their relationships
CREATE POLICY "Coaches can update own relationships"
  ON coach_client_relationships FOR UPDATE
  USING (coach_id = current_setting('app.current_user_id')::BIGINT);

-- ============================================================================
-- 3. Daily Metrics RLS Policies
-- ============================================================================

-- Users can view own metrics
CREATE POLICY "Users can view own metrics"
  ON daily_metrics FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::BIGINT);

-- Users can insert own metrics
CREATE POLICY "Users can insert own metrics"
  ON daily_metrics FOR INSERT
  WITH CHECK (user_id = current_setting('app.current_user_id')::BIGINT);

-- Users can update own metrics
CREATE POLICY "Users can update own metrics"
  ON daily_metrics FOR UPDATE
  USING (user_id = current_setting('app.current_user_id')::BIGINT);

-- Coaches can view client metrics
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

-- ============================================================================
-- 4. Weekly Plans RLS Policies
-- ============================================================================

-- Users can view own plans
CREATE POLICY "Users can view own plans"
  ON weekly_plans FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::BIGINT);

-- Coaches can manage client plans
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

-- ============================================================================
-- 5. Tasks RLS Policies
-- ============================================================================

-- Users can view own tasks
CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::BIGINT);

-- Users can update own task status
CREATE POLICY "Users can update own task status"
  ON tasks FOR UPDATE
  USING (user_id = current_setting('app.current_user_id')::BIGINT)
  WITH CHECK (user_id = current_setting('app.current_user_id')::BIGINT);

-- Coaches can manage client tasks
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

-- ============================================================================
-- 6. Weekly Reports RLS Policies
-- ============================================================================

-- Users can view own reports
CREATE POLICY "Users can view own reports"
  ON weekly_reports FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::BIGINT);

-- Users can insert own reports
CREATE POLICY "Users can insert own reports"
  ON weekly_reports FOR INSERT
  WITH CHECK (user_id = current_setting('app.current_user_id')::BIGINT);

-- Coaches can view and update client reports
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

-- ============================================================================
-- 7. Weekly Photos RLS Policies
-- ============================================================================

-- Users can manage own photos
CREATE POLICY "Users can manage own photos"
  ON weekly_photos FOR ALL
  USING (user_id = current_setting('app.current_user_id')::BIGINT);

-- Coaches can view client photos
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
-- Migration complete
-- ============================================================================
