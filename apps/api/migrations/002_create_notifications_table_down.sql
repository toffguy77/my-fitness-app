-- Migration Rollback: Drop Notifications Table
-- Description: Removes notifications table and related indexes
-- Version: 002
-- Date: 2026-01-27

-- ============================================================================
-- 1. Drop indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_notifications_user_unread;
DROP INDEX IF EXISTS idx_notifications_user_category;

-- ============================================================================
-- 2. Drop notifications table
-- ============================================================================

DROP TABLE IF EXISTS notifications;

-- ============================================================================
-- Rollback complete
-- ============================================================================
