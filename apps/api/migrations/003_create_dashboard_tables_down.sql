-- Migration: Drop Dashboard Tables
-- Description: Drops all dashboard-related tables in reverse order
-- Version: 003
-- Date: 2026-01-29

-- ============================================================================
-- Drop tables in reverse order to respect foreign key constraints
-- ============================================================================

-- Drop weekly_photos table
DROP TABLE IF EXISTS weekly_photos CASCADE;

-- Drop weekly_reports table
DROP TABLE IF EXISTS weekly_reports CASCADE;

-- Drop tasks table
DROP TABLE IF EXISTS tasks CASCADE;

-- Drop weekly_plans table
DROP TABLE IF EXISTS weekly_plans CASCADE;

-- Drop daily_metrics table
DROP TABLE IF EXISTS daily_metrics CASCADE;

-- Drop coach_client_relationships table
DROP TABLE IF EXISTS coach_client_relationships CASCADE;

-- ============================================================================
-- Migration rollback complete
-- ============================================================================
