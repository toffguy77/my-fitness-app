-- Migration: Drop Barcode Cache Table
-- Description: Drops the barcode_cache table and its indexes
-- Version: 008
-- Date: 2025-01-30

-- ============================================================================
-- Drop barcode_cache table (CASCADE will drop indexes automatically)
-- ============================================================================

DROP TABLE IF EXISTS barcode_cache CASCADE;

-- ============================================================================
-- Migration rollback complete
-- ============================================================================
