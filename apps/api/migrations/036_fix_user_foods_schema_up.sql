-- Fix user_foods table to match expected schema
-- On fresh databases (prod), 028 already creates the correct schema.
-- On older databases (dev), columns may have old names.
-- This migration is idempotent — safe to run in both cases.

-- Add brand column (no-op if already exists from 028)
ALTER TABLE user_foods ADD COLUMN IF NOT EXISTS brand TEXT;

-- Rename nutrition columns only if old names exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_foods' AND column_name = 'calories') THEN
        ALTER TABLE user_foods RENAME COLUMN calories TO calories_per_100;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_foods' AND column_name = 'protein') THEN
        ALTER TABLE user_foods RENAME COLUMN protein TO protein_per_100;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_foods' AND column_name = 'fat') THEN
        ALTER TABLE user_foods RENAME COLUMN fat TO fat_per_100;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_foods' AND column_name = 'carbs') THEN
        ALTER TABLE user_foods RENAME COLUMN carbs TO carbs_per_100;
    END IF;
END $$;

-- Drop old columns that don't exist in new schema
ALTER TABLE user_foods DROP COLUMN IF EXISTS category;
ALTER TABLE user_foods DROP COLUMN IF EXISTS is_shared;

-- Add missing column (no-op if already exists from 028)
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

-- Add constraints (no-op if they already exist — use IF NOT EXISTS via DO block)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_foods_calories_per_100_check') THEN
        ALTER TABLE user_foods ADD CONSTRAINT user_foods_calories_per_100_check CHECK (calories_per_100 >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_foods_protein_per_100_check') THEN
        ALTER TABLE user_foods ADD CONSTRAINT user_foods_protein_per_100_check CHECK (protein_per_100 >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_foods_fat_per_100_check') THEN
        ALTER TABLE user_foods ADD CONSTRAINT user_foods_fat_per_100_check CHECK (fat_per_100 >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_foods_carbs_per_100_check') THEN
        ALTER TABLE user_foods ADD CONSTRAINT user_foods_carbs_per_100_check CHECK (carbs_per_100 >= 0);
    END IF;
END $$;
