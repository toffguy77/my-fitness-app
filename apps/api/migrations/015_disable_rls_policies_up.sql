-- Migration: Disable RLS on dashboard tables
-- Description: Disables Row Level Security and drops policies that depend on
--   custom GUC parameter app.current_user_id, which is not supported on
--   Yandex Cloud Managed PostgreSQL. Application-level user_id filtering
--   in WHERE clauses provides equivalent data isolation.
-- Version: 015
-- Date: 2026-02-23
--
-- NOTE: Uses DO blocks with IF EXISTS checks because dashboard tables
--   (migration 003) and curator rename (migration 010) may or may not
--   have been applied to this database.

-- ============================================================================
-- 1. Drop all RLS policies (both old coach and new curator names)
-- ============================================================================

DO $$
BEGIN
    -- curator_client_relationships (post-migration 010 name)
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'curator_client_relationships') THEN
        DROP POLICY IF EXISTS "Curators can view own relationships" ON curator_client_relationships;
        DROP POLICY IF EXISTS "Clients can view own curator relationships" ON curator_client_relationships;
        DROP POLICY IF EXISTS "Curators can create relationships" ON curator_client_relationships;
        DROP POLICY IF EXISTS "Curators can update own relationships" ON curator_client_relationships;
        ALTER TABLE curator_client_relationships DISABLE ROW LEVEL SECURITY;
    END IF;

    -- coach_client_relationships (pre-migration 010 name)
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'coach_client_relationships') THEN
        DROP POLICY IF EXISTS "Coaches can view own relationships" ON coach_client_relationships;
        DROP POLICY IF EXISTS "Clients can view own relationships" ON coach_client_relationships;
        DROP POLICY IF EXISTS "Coaches can create relationships" ON coach_client_relationships;
        DROP POLICY IF EXISTS "Coaches can update own relationships" ON coach_client_relationships;
        ALTER TABLE coach_client_relationships DISABLE ROW LEVEL SECURITY;
    END IF;

    -- daily_metrics
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'daily_metrics') THEN
        DROP POLICY IF EXISTS "Users can view own metrics" ON daily_metrics;
        DROP POLICY IF EXISTS "Users can insert own metrics" ON daily_metrics;
        DROP POLICY IF EXISTS "Users can update own metrics" ON daily_metrics;
        DROP POLICY IF EXISTS "Coaches can view client metrics" ON daily_metrics;
        DROP POLICY IF EXISTS "Curators can view client metrics" ON daily_metrics;
        ALTER TABLE daily_metrics DISABLE ROW LEVEL SECURITY;
    END IF;

    -- weekly_plans
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'weekly_plans') THEN
        DROP POLICY IF EXISTS "Users can view own plans" ON weekly_plans;
        DROP POLICY IF EXISTS "Coaches can manage client plans" ON weekly_plans;
        DROP POLICY IF EXISTS "Curators can manage client plans" ON weekly_plans;
        ALTER TABLE weekly_plans DISABLE ROW LEVEL SECURITY;
    END IF;

    -- tasks
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'tasks') THEN
        DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;
        DROP POLICY IF EXISTS "Users can update own task status" ON tasks;
        DROP POLICY IF EXISTS "Coaches can manage client tasks" ON tasks;
        DROP POLICY IF EXISTS "Curators can manage client tasks" ON tasks;
        ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
    END IF;

    -- weekly_reports
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'weekly_reports') THEN
        DROP POLICY IF EXISTS "Users can view own reports" ON weekly_reports;
        DROP POLICY IF EXISTS "Users can insert own reports" ON weekly_reports;
        DROP POLICY IF EXISTS "Coaches can view and update client reports" ON weekly_reports;
        DROP POLICY IF EXISTS "Curators can view and update client reports" ON weekly_reports;
        ALTER TABLE weekly_reports DISABLE ROW LEVEL SECURITY;
    END IF;

    -- weekly_photos
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'weekly_photos') THEN
        DROP POLICY IF EXISTS "Users can manage own photos" ON weekly_photos;
        DROP POLICY IF EXISTS "Coaches can view client photos" ON weekly_photos;
        DROP POLICY IF EXISTS "Curators can view client photos" ON weekly_photos;
        ALTER TABLE weekly_photos DISABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================
