-- Fix user_foods table to match expected schema
-- The table was created with old column names (calories, protein, fat, carbs)
-- but the code expects (brand, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)

-- Add brand column
ALTER TABLE user_foods ADD COLUMN IF NOT EXISTS brand TEXT;

-- Rename nutrition columns to per_100 convention
ALTER TABLE user_foods RENAME COLUMN calories TO calories_per_100;
ALTER TABLE user_foods RENAME COLUMN protein TO protein_per_100;
ALTER TABLE user_foods RENAME COLUMN fat TO fat_per_100;
ALTER TABLE user_foods RENAME COLUMN carbs TO carbs_per_100;

-- Drop old columns that don't exist in new schema
ALTER TABLE user_foods DROP COLUMN IF EXISTS category;
ALTER TABLE user_foods DROP COLUMN IF EXISTS is_shared;

-- Add missing column
ALTER TABLE user_foods ADD COLUMN IF NOT EXISTS source_food_id UUID;

-- Recreate FTS index to include brand
DROP INDEX IF EXISTS idx_user_foods_name_fts;
CREATE INDEX idx_user_foods_name_fts ON user_foods
    USING gin(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')));

-- Drop old indexes
DROP INDEX IF EXISTS idx_user_foods_shared;

-- Update check constraints to use new column names
ALTER TABLE user_foods DROP CONSTRAINT IF EXISTS user_foods_calories_check;
ALTER TABLE user_foods DROP CONSTRAINT IF EXISTS user_foods_protein_check;
ALTER TABLE user_foods DROP CONSTRAINT IF EXISTS user_foods_fat_check;
ALTER TABLE user_foods DROP CONSTRAINT IF EXISTS user_foods_carbs_check;

ALTER TABLE user_foods ADD CONSTRAINT user_foods_calories_per_100_check CHECK (calories_per_100 >= 0);
ALTER TABLE user_foods ADD CONSTRAINT user_foods_protein_per_100_check CHECK (protein_per_100 >= 0);
ALTER TABLE user_foods ADD CONSTRAINT user_foods_fat_per_100_check CHECK (fat_per_100 >= 0);
ALTER TABLE user_foods ADD CONSTRAINT user_foods_carbs_per_100_check CHECK (carbs_per_100 >= 0);
