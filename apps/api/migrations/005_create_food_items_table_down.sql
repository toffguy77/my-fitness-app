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

-- Indexes added alongside the products catalogue in the up-migration.
-- The table itself is deliberately NOT dropped: in production it holds an
-- imported catalogue that predates these migrations, and rolling back must not
-- destroy it.
DROP INDEX IF EXISTS idx_products_vendor_code;
DROP INDEX IF EXISTS idx_products_barcode;
