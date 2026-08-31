-- Migration: Create Food Items Table
-- Description: Creates the food_items table for storing food database with nutrition data
-- Version: 005
-- Date: 2025-01-30

-- ============================================================================
-- 0. Products catalogue
-- ============================================================================
-- `products` holds the imported food catalogue (OpenFoodFacts and similar). It
-- has existed in production since before this migration set — created outside
-- the migrations and never captured here — while migrations 012, 018 and 044
-- build indexes on it. A database created purely from migrations therefore
-- failed at 012 with "relation products does not exist", which meant the schema
-- could not be reproduced from the repository at all: no local database from
-- scratch, no restore from migrations alone.
--
-- Added to this already-applied migration deliberately, rather than as a new
-- one: no version below 012 was free, and the statement is idempotent, so it is
-- a no-op everywhere the table already exists. Columns are those the
-- application reads (internal/modules/food-tracker/service.go).
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT,
    category_id BIGINT,
    -- Nutrition per 100 g, matching how the application interprets these.
    calories NUMERIC(10,2),
    proteins NUMERIC(10,2),
    fats NUMERIC(10,2),
    carbs NUMERIC(10,2),
    fiber NUMERIC(10,2),
    -- barcode is what a scanner reads; vendor_code is the supplier identifier.
    barcode TEXT,
    vendor_code TEXT,
    -- 'database' marks the curated catalogue, which search ranks first.
    source TEXT DEFAULT 'database',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_vendor_code ON products(vendor_code);

COMMENT ON TABLE products IS 'Imported food catalogue; predates the migration set, captured here so the schema can be built from scratch';

-- ============================================================================
-- 1. Create food_items table
-- ============================================================================

CREATE TABLE IF NOT EXISTS food_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL,

  -- Serving info
  serving_size DECIMAL(10,2) NOT NULL DEFAULT 100,
  serving_unit TEXT NOT NULL DEFAULT 'г',

  -- Nutrition per 100g/100ml (КБЖУ)
  calories DECIMAL(10,2) NOT NULL,
  protein DECIMAL(10,2) NOT NULL DEFAULT 0,
  fat DECIMAL(10,2) NOT NULL DEFAULT 0,
  carbs DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Barcode for product lookup
  barcode TEXT,

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'database' CHECK (source IN ('database', 'usda', 'openfoodfacts', 'user')),
  verified BOOLEAN DEFAULT false,

  -- Additional nutrients (vitamins, minerals, fiber, etc.)
  additional_nutrients JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. Create indexes
-- ============================================================================

-- Full-text search index for Russian language
-- Enables fast search by food name with Russian morphology support
CREATE INDEX IF NOT EXISTS idx_food_items_name_fts ON food_items USING GIN (to_tsvector('russian', name));

-- Barcode index for quick product lookups (partial index for non-null barcodes)
CREATE INDEX IF NOT EXISTS idx_food_items_barcode ON food_items(barcode) WHERE barcode IS NOT NULL;

-- Category index for filtering by food category
CREATE INDEX IF NOT EXISTS idx_food_items_category ON food_items(category);

-- Source index for filtering by data source
CREATE INDEX IF NOT EXISTS idx_food_items_source ON food_items(source);

-- ============================================================================
-- 3. Add comments for documentation
-- ============================================================================

COMMENT ON TABLE food_items IS 'Food database with nutrition information (КБЖУ) from multiple sources';

COMMENT ON COLUMN food_items.name IS 'Food name (supports Russian language search)';
COMMENT ON COLUMN food_items.brand IS 'Brand name for packaged products';
COMMENT ON COLUMN food_items.category IS 'Food category (e.g., meat, dairy, vegetables)';
COMMENT ON COLUMN food_items.serving_size IS 'Standard serving size';
COMMENT ON COLUMN food_items.serving_unit IS 'Serving unit (г for grams, мл for milliliters)';
COMMENT ON COLUMN food_items.calories IS 'Calories per 100g/100ml';
COMMENT ON COLUMN food_items.protein IS 'Protein in grams per 100g/100ml';
COMMENT ON COLUMN food_items.fat IS 'Fat in grams per 100g/100ml';
COMMENT ON COLUMN food_items.carbs IS 'Carbohydrates in grams per 100g/100ml';
COMMENT ON COLUMN food_items.barcode IS 'Product barcode for scanner lookup';
COMMENT ON COLUMN food_items.source IS 'Data source: database (internal), usda, openfoodfacts, or user (custom)';
COMMENT ON COLUMN food_items.verified IS 'Whether nutrition data has been verified';
COMMENT ON COLUMN food_items.additional_nutrients IS 'Additional nutrients as JSON (fiber, sugar, sodium, vitamins, minerals)';

-- ============================================================================
-- Migration complete
-- ============================================================================
