-- Migration: Drop Dashboard RLS Policies
-- Description: Removes Row Level Security policies from all dashboard tables
-- Version: 004
-- Date: 2026-01-29

-- ============================================================================
-- Drop RLS policies from all dashboard tables
-- ============================================================================

-- Weekly Photos policies
DROP POLICY IF EXISTS "Coaches can view client photos" ON weekly_photos;
DROP POLICY IF EXISTS "Users can manage own photos" ON weekly_photos;

-- Weekly Reports policies
DROP POLICY IF EXISTS "Coaches can view and update client reports" ON weekly_reports;
DROP POLICY IF EXISTS "Users can insert own reports" ON weekly_reports;
DROP POLICY IF EXISTS "Users can view own reports" ON weekly_reports;

-- Tasks policies
DROP POLICY IF EXISTS "Coaches can manage client tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update own task status" ON tasks;
DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;

-- Weekly Plans policies
DROP POLICY IF EXISTS "Coaches can manage client plans" ON weekly_plans;
DROP POLICY IF EXISTS "Users can view own plans" ON weekly_plans;

-- Daily Metrics policies
DROP POLICY IF EXISTS "Coaches can view client metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Users can update own metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Users can insert own metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Users can view own metrics" ON daily_metrics;

-- Coach-Client Relationships policies
DROP POLICY IF EXISTS "Coaches can update own relationships" ON coach_client_relationships;
DROP POLICY IF EXISTS "Coaches can create relationships" ON coach_client_relationships;
DROP POLICY IF EXISTS "Clients can view own relationships" ON coach_client_relationships;
DROP POLICY IF EXISTS "Coaches can view own relationships" ON coach_client_relationships;

-- ============================================================================
-- Disable RLS on all dashboard tables
-- ============================================================================

ALTER TABLE weekly_photos DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE coach_client_relationships DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Migration rollback complete
-- ============================================================================
