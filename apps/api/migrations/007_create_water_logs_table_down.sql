-- Migration: Drop Water Logs Table
-- Description: Drops the water_logs table and its indexes
-- Version: 007
-- Date: 2025-01-30

-- ============================================================================
-- Drop water_logs table (CASCADE will drop indexes automatically)
-- ============================================================================

DROP TABLE IF EXISTS water_logs CASCADE;

-- ============================================================================
-- Migration rollback complete
-- ============================================================================
