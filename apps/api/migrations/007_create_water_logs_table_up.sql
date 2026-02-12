-- Migration: Create Water Logs Table
-- Description: Creates the water_logs table for tracking daily water intake
-- Version: 007
-- Date: 2025-01-30

-- ============================================================================
-- 1. Create water_logs table
-- ============================================================================

CREATE TABLE IF NOT EXISTS water_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User reference
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Date of the water log
  date DATE NOT NULL,
  
  -- Water intake tracking
  glasses INTEGER NOT NULL DEFAULT 0 CHECK (glasses >= 0),
  goal INTEGER NOT NULL DEFAULT 8 CHECK (goal > 0),
  glass_size INTEGER NOT NULL DEFAULT 250 CHECK (glass_size > 0), -- in milliliters
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one water log per user per day
  UNIQUE(user_id, date)
);

-- ============================================================================
-- 2. Create indexes
-- ============================================================================

-- User ID index for efficient user-specific queries
CREATE INDEX IF NOT EXISTS idx_water_logs_user ON water_logs(user_id);

-- Date index (DESC) for efficient retrieval of recent entries
CREATE INDEX IF NOT EXISTS idx_water_logs_date ON water_logs(date DESC);

-- Composite index for user + date queries (most common pattern)
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs(user_id, date DESC);

-- ============================================================================
-- 3. Add comments for documentation
-- ============================================================================

COMMENT ON TABLE water_logs IS 'Daily water intake tracking for users (Отслеживание потребления воды)';

COMMENT ON COLUMN water_logs.user_id IS 'Reference to the user who logged water intake';
COMMENT ON COLUMN water_logs.date IS 'Date of the water log entry';
COMMENT ON COLUMN water_logs.glasses IS 'Number of glasses of water consumed (Количество стаканов воды)';
COMMENT ON COLUMN water_logs.goal IS 'Daily water intake goal in glasses (Цель по воде в стаканах)';
COMMENT ON COLUMN water_logs.glass_size IS 'Size of one glass in milliliters (Размер стакана в мл), default 250ml';
COMMENT ON COLUMN water_logs.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN water_logs.updated_at IS 'Timestamp when the record was last updated';

-- ============================================================================
-- Migration complete
-- ============================================================================
