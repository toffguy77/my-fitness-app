-- Migration: Create Barcode Cache Table
-- Description: Creates the barcode_cache table for caching OpenFoodFacts API responses
-- Version: 008
-- Date: 2025-01-30

-- ============================================================================
-- 1. Create barcode_cache table
-- ============================================================================

CREATE TABLE IF NOT EXISTS barcode_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Barcode identifier (unique)
  barcode TEXT NOT NULL UNIQUE,
  
  -- Cached food data from external API (OpenFoodFacts, USDA)
  food_data JSONB NOT NULL,
  
  -- Data source
  source TEXT NOT NULL DEFAULT 'openfoodfacts' CHECK (source IN ('openfoodfacts', 'usda')),
  
  -- Cache expiration (30-day cache expiry)
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. Create indexes
-- ============================================================================

-- Barcode index for quick lookups (covered by UNIQUE constraint, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_barcode_cache_barcode ON barcode_cache(barcode);

-- Expiry index for efficient cache cleanup queries
CREATE INDEX IF NOT EXISTS idx_barcode_cache_expires ON barcode_cache(expires_at);

-- Source index for filtering by data source
CREATE INDEX IF NOT EXISTS idx_barcode_cache_source ON barcode_cache(source);

-- ============================================================================
-- 3. Add comments for documentation
-- ============================================================================

COMMENT ON TABLE barcode_cache IS 'Cache for barcode lookup results from external APIs (Кэш результатов поиска по штрих-коду)';

COMMENT ON COLUMN barcode_cache.id IS 'Unique identifier for the cache entry';
COMMENT ON COLUMN barcode_cache.barcode IS 'Product barcode (EAN-13, UPC-A, etc.) - unique identifier for lookup';
COMMENT ON COLUMN barcode_cache.food_data IS 'Cached food item data in JSONB format (name, brand, nutrition per 100g, image URL, etc.)';
COMMENT ON COLUMN barcode_cache.source IS 'Data source: openfoodfacts or usda (Источник данных)';
COMMENT ON COLUMN barcode_cache.expires_at IS 'Cache expiration timestamp (30-day default) - entries older than this should be refreshed';
COMMENT ON COLUMN barcode_cache.created_at IS 'Timestamp when the cache entry was created';
COMMENT ON COLUMN barcode_cache.updated_at IS 'Timestamp when the cache entry was last updated';

-- ============================================================================
-- Migration complete
-- ============================================================================
