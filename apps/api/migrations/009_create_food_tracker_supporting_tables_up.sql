-- Migration: Create Food Tracker Supporting Tables
-- Description: Creates supporting tables for food tracker feature:
--   - user_foods: User-created custom food items
--   - nutrient_recommendations: System nutrient recommendations
--   - user_nutrient_preferences: User's tracked nutrients
--   - user_custom_recommendations: User-defined custom recommendations
--   - meal_templates: Saved meal templates
--   - user_favorite_foods: User's favorite foods
-- Version: 009
-- Date: 2025-01-30

-- ============================================================================
-- 1. Create user_foods table (User-created custom food items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',

  -- Serving info
  serving_size DECIMAL(10,2) NOT NULL DEFAULT 100,
  serving_unit TEXT NOT NULL DEFAULT 'г',

  -- Nutrition per 100g/100ml (КБЖУ)
  calories DECIMAL(10,2) NOT NULL CHECK (calories >= 0),
  protein DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (protein >= 0),
  fat DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (fat >= 0),
  carbs DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (carbs >= 0),

  -- Sharing option
  is_shared BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for user_foods
CREATE INDEX IF NOT EXISTS idx_user_foods_user_id ON user_foods(user_id);
CREATE INDEX IF NOT EXISTS idx_user_foods_name_fts ON user_foods USING GIN (to_tsvector('russian', name));
CREATE INDEX IF NOT EXISTS idx_user_foods_shared ON user_foods(is_shared) WHERE is_shared = true;

-- Comments for user_foods
COMMENT ON TABLE user_foods IS 'User-created custom food items with КБЖУ data';
COMMENT ON COLUMN user_foods.user_id IS 'Reference to the user who created this food item';
COMMENT ON COLUMN user_foods.name IS 'Food name (supports Russian language search)';
COMMENT ON COLUMN user_foods.category IS 'Food category (default: custom)';
COMMENT ON COLUMN user_foods.serving_size IS 'Standard serving size';
COMMENT ON COLUMN user_foods.serving_unit IS 'Serving unit (г for grams, мл for milliliters)';
COMMENT ON COLUMN user_foods.calories IS 'Calories per 100g/100ml';
COMMENT ON COLUMN user_foods.protein IS 'Protein in grams per 100g/100ml';
COMMENT ON COLUMN user_foods.fat IS 'Fat in grams per 100g/100ml';
COMMENT ON COLUMN user_foods.carbs IS 'Carbohydrates in grams per 100g/100ml';
COMMENT ON COLUMN user_foods.is_shared IS 'Whether this food is shared with the community (moderated)';

-- ============================================================================
-- 2. Create nutrient_recommendations table (System nutrient recommendations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS nutrient_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nutrient info
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('vitamins', 'minerals', 'lipids', 'fiber', 'plant')),

  -- Recommendation values
  daily_target DECIMAL(10,4) NOT NULL CHECK (daily_target > 0),
  unit TEXT NOT NULL,
  is_weekly BOOLEAN DEFAULT false,

  -- Descriptive info
  description TEXT,
  benefits TEXT,
  effects TEXT,

  -- Min/optimal recommendations
  min_recommendation DECIMAL(10,4),
  optimal_recommendation DECIMAL(10,4),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for nutrient_recommendations
CREATE INDEX IF NOT EXISTS idx_nutrient_recommendations_category ON nutrient_recommendations(category);
CREATE INDEX IF NOT EXISTS idx_nutrient_recommendations_weekly ON nutrient_recommendations(is_weekly) WHERE is_weekly = true;

-- Comments for nutrient_recommendations
COMMENT ON TABLE nutrient_recommendations IS 'System nutrient recommendations (vitamins, minerals, etc.)';
COMMENT ON COLUMN nutrient_recommendations.name IS 'Nutrient name in Russian';
COMMENT ON COLUMN nutrient_recommendations.category IS 'Category: vitamins (Витамины), minerals (Минералы), lipids (Липиды), fiber (Клетчатка), plant (Растительность)';
COMMENT ON COLUMN nutrient_recommendations.daily_target IS 'Daily recommended intake target';
COMMENT ON COLUMN nutrient_recommendations.unit IS 'Unit of measurement (г, мг, мкг, МЕ)';
COMMENT ON COLUMN nutrient_recommendations.is_weekly IS 'Whether this is a weekly recommendation instead of daily';
COMMENT ON COLUMN nutrient_recommendations.description IS 'What this nutrient is and why to take it (Что это и зачем принимать)';
COMMENT ON COLUMN nutrient_recommendations.benefits IS 'Benefits of this nutrient';
COMMENT ON COLUMN nutrient_recommendations.effects IS 'What it affects and how (На что влияет и как)';
COMMENT ON COLUMN nutrient_recommendations.min_recommendation IS 'Minimum recommended intake';
COMMENT ON COLUMN nutrient_recommendations.optimal_recommendation IS 'Optimal recommended intake';

-- ============================================================================
-- 3. Create user_nutrient_preferences table (User's tracked nutrients)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_nutrient_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nutrient_id UUID NOT NULL REFERENCES nutrient_recommendations(id) ON DELETE CASCADE,

  -- Tracking status
  is_tracked BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint to prevent duplicates
  UNIQUE(user_id, nutrient_id)
);

-- Indexes for user_nutrient_preferences
CREATE INDEX IF NOT EXISTS idx_user_nutrient_preferences_user_id ON user_nutrient_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_nutrient_preferences_tracked ON user_nutrient_preferences(user_id, is_tracked) WHERE is_tracked = true;

-- Comments for user_nutrient_preferences
COMMENT ON TABLE user_nutrient_preferences IS 'User preferences for which nutrients to track';
COMMENT ON COLUMN user_nutrient_preferences.user_id IS 'Reference to the user';
COMMENT ON COLUMN user_nutrient_preferences.nutrient_id IS 'Reference to the nutrient recommendation';
COMMENT ON COLUMN user_nutrient_preferences.is_tracked IS 'Whether the user is tracking this nutrient';

-- ============================================================================
-- 4. Create user_custom_recommendations table (User-defined custom recommendations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_custom_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Custom recommendation info
  name TEXT NOT NULL,
  daily_target DECIMAL(10,4) NOT NULL CHECK (daily_target > 0),
  unit TEXT NOT NULL CHECK (unit IN ('г', 'мг', 'мкг', 'МЕ')),

  -- Current intake tracking
  current_intake DECIMAL(10,4) DEFAULT 0 CHECK (current_intake >= 0),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for user_custom_recommendations
CREATE INDEX IF NOT EXISTS idx_user_custom_recommendations_user_id ON user_custom_recommendations(user_id);

-- Comments for user_custom_recommendations
COMMENT ON TABLE user_custom_recommendations IS 'User-defined custom nutrient recommendations';
COMMENT ON COLUMN user_custom_recommendations.user_id IS 'Reference to the user who created this recommendation';
COMMENT ON COLUMN user_custom_recommendations.name IS 'Custom nutrient/supplement name';
COMMENT ON COLUMN user_custom_recommendations.daily_target IS 'Daily target intake value';
COMMENT ON COLUMN user_custom_recommendations.unit IS 'Unit of measurement: г (grams), мг (milligrams), мкг (micrograms), МЕ (IU)';
COMMENT ON COLUMN user_custom_recommendations.current_intake IS 'Current daily intake value';

-- ============================================================================
-- 5. Create meal_templates table (Saved meal templates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS meal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Template info
  name TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),

  -- Food entries as JSON array
  entries JSONB NOT NULL,

  -- Calculated totals (КБЖУ)
  total_calories DECIMAL(10,2) NOT NULL CHECK (total_calories >= 0),
  total_protein DECIMAL(10,2) NOT NULL CHECK (total_protein >= 0),
  total_fat DECIMAL(10,2) NOT NULL CHECK (total_fat >= 0),
  total_carbs DECIMAL(10,2) NOT NULL CHECK (total_carbs >= 0),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for meal_templates
CREATE INDEX IF NOT EXISTS idx_meal_templates_user_id ON meal_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_templates_meal_type ON meal_templates(user_id, meal_type);

-- Comments for meal_templates
COMMENT ON TABLE meal_templates IS 'Saved meal templates for quick reuse';
COMMENT ON COLUMN meal_templates.user_id IS 'Reference to the user who created this template';
COMMENT ON COLUMN meal_templates.name IS 'Template name';
COMMENT ON COLUMN meal_templates.meal_type IS 'Meal type: breakfast (Завтрак), lunch (Обед), dinner (Ужин), snack (Перекус)';
COMMENT ON COLUMN meal_templates.entries IS 'JSON array of food entries with portions';
COMMENT ON COLUMN meal_templates.total_calories IS 'Total calories for all entries in template';
COMMENT ON COLUMN meal_templates.total_protein IS 'Total protein in grams for all entries';
COMMENT ON COLUMN meal_templates.total_fat IS 'Total fat in grams for all entries';
COMMENT ON COLUMN meal_templates.total_carbs IS 'Total carbohydrates in grams for all entries';

-- ============================================================================
-- 6. Create user_favorite_foods table (User's favorite foods)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_favorite_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_id UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint to prevent duplicates
  UNIQUE(user_id, food_id)
);

-- Indexes for user_favorite_foods
CREATE INDEX IF NOT EXISTS idx_user_favorite_foods_user_id ON user_favorite_foods(user_id);

-- Comments for user_favorite_foods
COMMENT ON TABLE user_favorite_foods IS 'User favorite foods for quick access';
COMMENT ON COLUMN user_favorite_foods.user_id IS 'Reference to the user';
COMMENT ON COLUMN user_favorite_foods.food_id IS 'Reference to the favorite food item';

-- ============================================================================
-- Migration complete
-- ============================================================================
