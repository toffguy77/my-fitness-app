-- Migration: Create Food Entries Table
-- Description: Creates the food_entries table for storing user food log entries with КБЖУ data
-- Version: 006
-- Date: 2025-01-30

-- ============================================================================
-- 1. Create food_entries table
-- ============================================================================

CREATE TABLE IF NOT EXISTS food_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Food reference
  food_id UUID NOT NULL REFERENCES food_items(id) ON DELETE RESTRICT,
  food_name TEXT NOT NULL, -- Denormalized for display

  -- Meal categorization
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),

  -- Portion information
  portion_type TEXT NOT NULL CHECK (portion_type IN ('grams', 'milliliters', 'portion')),
  portion_amount DECIMAL(10,2) NOT NULL CHECK (portion_amount > 0),

  -- Calculated nutrition based on portion (КБЖУ)
  calories DECIMAL(10,2) NOT NULL CHECK (calories >= 0),
  protein DECIMAL(10,2) NOT NULL CHECK (protein >= 0),
  fat DECIMAL(10,2) NOT NULL CHECK (fat >= 0),
  carbs DECIMAL(10,2) NOT NULL CHECK (carbs >= 0),

  -- Time and date
  time TEXT NOT NULL, -- HH:mm format
  date DATE NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. Create indexes
-- ============================================================================

-- Composite index on (user_id, date) for efficient daily queries
-- DESC on date for faster retrieval of recent entries
CREATE INDEX IF NOT EXISTS idx_food_entries_user_date ON food_entries(user_id, date DESC);

-- Meal type index for filtering by meal category
CREATE INDEX IF NOT EXISTS idx_food_entries_meal_type ON food_entries(meal_type);

-- Food ID index for food item lookups and statistics
CREATE INDEX IF NOT EXISTS idx_food_entries_food_id ON food_entries(food_id);

-- Composite index for user + date + meal_type queries (common pattern)
CREATE INDEX IF NOT EXISTS idx_food_entries_user_date_meal ON food_entries(user_id, date, meal_type);

-- ============================================================================
-- 3. Add comments for documentation
-- ============================================================================

COMMENT ON TABLE food_entries IS 'User food log entries with calculated КБЖУ values';

COMMENT ON COLUMN food_entries.user_id IS 'Reference to the user who logged this entry';
COMMENT ON COLUMN food_entries.food_id IS 'Reference to the food item from food_items table';
COMMENT ON COLUMN food_entries.food_name IS 'Denormalized food name for display (avoids JOIN for listing)';
COMMENT ON COLUMN food_entries.meal_type IS 'Meal category: breakfast (Завтрак), lunch (Обед), dinner (Ужин), snack (Перекус)';
COMMENT ON COLUMN food_entries.portion_type IS 'Portion measurement type: grams (Граммы), milliliters (Миллилитры), portion (Порция)';
COMMENT ON COLUMN food_entries.portion_amount IS 'Amount of the portion in the specified unit';
COMMENT ON COLUMN food_entries.calories IS 'Calculated calories based on portion size';
COMMENT ON COLUMN food_entries.protein IS 'Calculated protein in grams based on portion size';
COMMENT ON COLUMN food_entries.fat IS 'Calculated fat in grams based on portion size';
COMMENT ON COLUMN food_entries.carbs IS 'Calculated carbohydrates in grams based on portion size';
COMMENT ON COLUMN food_entries.time IS 'Time of the meal in HH:mm format (24-hour)';
COMMENT ON COLUMN food_entries.date IS 'Date of the food entry';

-- ============================================================================
-- Migration complete
-- ============================================================================
