-- Migration: Password Reset Schema
-- Description: Creates tables for password reset functionality
-- Version: 001
-- Date: 2024

-- ============================================================================
-- 1. Create reset_tokens table
-- ============================================================================
-- Stores password reset tokens with security features:
-- - Tokens are stored hashed (never plain text)
-- - Tokens expire after 1 hour
-- - Tracks usage to prevent reuse
-- - Logs IP and user agent for security audit
-- ============================================================================

CREATE TABLE IF NOT EXISTS reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reset_tokens_token_hash ON reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id ON reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires_at ON reset_tokens(expires_at);

-- Add foreign key constraint if users table exists
DO $
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
        -- Add foreign key constraint if it doesn't already exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'reset_tokens_user_id_fkey'
            AND table_name = 'reset_tokens'
        ) THEN
            ALTER TABLE reset_tokens
            ADD CONSTRAINT reset_tokens_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
            RAISE NOTICE 'Added foreign key constraint to users table';
        END IF;
    ELSE
        RAISE NOTICE 'Users table does not exist yet. Foreign key constraint will need to be added later.';
        RAISE NOTICE 'Run this command after creating users table:';
        RAISE NOTICE 'ALTER TABLE reset_tokens ADD CONSTRAINT reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;';
    END IF;
END $;

-- Add comment for documentation
COMMENT ON TABLE reset_tokens IS 'Stores password reset tokens with expiration and usage tracking';
COMMENT ON COLUMN reset_tokens.token_hash IS 'SHA-256 hash of the reset token (never store plain text)';
COMMENT ON COLUMN reset_tokens.expires_at IS 'Token expiration time (1 hour from creation)';
COMMENT ON COLUMN reset_tokens.used_at IS 'Timestamp when token was used (NULL if unused)';

-- ============================================================================
-- 2. Create password_reset_attempts table
-- ============================================================================
-- Tracks password reset attempts for rate limiting:
-- - Email-based rate limiting (3 per hour)
-- - IP-based rate limiting (10 per hour)
-- - Security monitoring and abuse detection
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_reset_attempts (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    attempted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_reset_attempts_email_time ON password_reset_attempts(email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_reset_attempts_ip_time ON password_reset_attempts(ip_address, attempted_at DESC);

-- Add comment for documentation
COMMENT ON TABLE password_reset_attempts IS 'Tracks password reset attempts for rate limiting and security monitoring';
COMMENT ON COLUMN password_reset_attempts.email IS 'Email address used in reset request';
COMMENT ON COLUMN password_reset_attempts.ip_address IS 'IP address of the requester';

-- ============================================================================
-- 3. Add password_changed_at column to users table
-- ============================================================================
-- Tracks when user last changed their password:
-- - Useful for security policies (force password change after X days)
-- - Audit trail for password changes
-- - Can be used to invalidate old sessions
-- ============================================================================

-- Note: This assumes a 'users' table exists. If it doesn't exist yet,
-- this migration will fail and should be adjusted based on actual schema.

DO $
BEGIN
    -- Check if users table exists before adding column
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
        -- Add column if it doesn't exist
        IF NOT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'password_changed_at'
        ) THEN
            ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP;
            COMMENT ON COLUMN users.password_changed_at IS 'Timestamp of last password change';
        END IF;
    ELSE
        RAISE NOTICE 'Users table does not exist yet. Skipping password_changed_at column addition.';
    END IF;
END $;

-- ============================================================================
-- 4. Create cleanup function for expired tokens
-- ============================================================================
-- Function to clean up expired reset tokens (can be called periodically)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_reset_tokens()
RETURNS INTEGER AS $
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM reset_tokens
    WHERE expires_at < NOW()
    AND used_at IS NULL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_reset_tokens IS 'Removes expired and unused reset tokens from the database';

-- ============================================================================
-- 5. Create cleanup function for old reset attempts
-- ============================================================================
-- Function to clean up old password reset attempts (older than 24 hours)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_reset_attempts()
RETURNS INTEGER AS $
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM password_reset_attempts
    WHERE attempted_at < NOW() - INTERVAL '24 hours';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_reset_attempts IS 'Removes password reset attempts older than 24 hours';

-- ============================================================================
-- Migration complete
-- ============================================================================
