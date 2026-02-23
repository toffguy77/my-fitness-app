-- Migration: Re-enable RLS on dashboard tables
-- Description: Reverts migration 015 by re-enabling RLS on tables that exist.
-- Version: 015 (rollback)
-- Date: 2026-02-23
--
-- NOTE: This only re-enables RLS. Full policies from 004/010 must be
--   reapplied separately.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'curator_client_relationships') THEN
        ALTER TABLE curator_client_relationships ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'coach_client_relationships') THEN
        ALTER TABLE coach_client_relationships ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'daily_metrics') THEN
        ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'weekly_plans') THEN
        ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'tasks') THEN
        ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'weekly_reports') THEN
        ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'weekly_photos') THEN
        ALTER TABLE weekly_photos ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;
