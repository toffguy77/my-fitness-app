-- Migration Rollback: Password Reset Schema
-- Description: Removes password reset tables and functions
-- Version: 001
-- Date: 2024

-- ============================================================================
-- WARNING: This will permanently delete all password reset data
-- ============================================================================

-- Drop cleanup functions
DROP FUNCTION IF EXISTS cleanup_old_reset_attempts();
DROP FUNCTION IF EXISTS cleanup_expired_reset_tokens();

-- Remove password_changed_at column from users table (if it exists)
DO $
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'password_changed_at'
    ) THEN
        ALTER TABLE users DROP COLUMN password_changed_at;
    END IF;
END $;

-- Drop password_reset_attempts table
DROP TABLE IF EXISTS password_reset_attempts;

-- Drop reset_tokens table (CASCADE will drop the foreign key constraint if it exists)
DROP TABLE IF EXISTS reset_tokens CASCADE;

-- ============================================================================
-- Rollback complete
-- ============================================================================
