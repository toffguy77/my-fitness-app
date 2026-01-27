-- Migration: Drop Users Table
-- Description: Drops users and user_consents tables
-- Version: 000
-- Date: 2026-01-27

-- Drop tables in reverse order (due to foreign keys)
DROP TABLE IF EXISTS user_consents;
DROP TABLE IF EXISTS users;
