-- Migration: Drop Food Entries Table
-- Description: Drops the food_entries table and its indexes
-- Version: 006
-- Date: 2025-01-30

-- ============================================================================
-- Drop food_entries table (CASCADE will drop indexes automatically)
-- ============================================================================

DROP TABLE IF EXISTS food_entries CASCADE;

-- ============================================================================
-- Migration rollback complete
-- ============================================================================
