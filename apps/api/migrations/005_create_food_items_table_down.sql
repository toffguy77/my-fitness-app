-- Migration: Drop Food Items Table
-- Description: Drops the food_items table and its indexes
-- Version: 005
-- Date: 2025-01-30

-- ============================================================================
-- Drop food_items table (CASCADE will drop indexes automatically)
-- ============================================================================

DROP TABLE IF EXISTS food_items CASCADE;

-- ============================================================================
-- Migration rollback complete
-- ============================================================================
