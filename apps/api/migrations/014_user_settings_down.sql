-- Migration: Revert User Settings
-- Description: Drops user_settings table and removes avatar/onboarding columns from users
-- Version: 014
-- Date: 2026-02-23

-- ============================================================================
-- 1. Drop user_settings table
-- ============================================================================

DROP TABLE IF EXISTS user_settings;

-- ============================================================================
-- 2. Remove columns from users table
-- ============================================================================

ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed;

-- ============================================================================
-- Migration rollback complete
-- ============================================================================
