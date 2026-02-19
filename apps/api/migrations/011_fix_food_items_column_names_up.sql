-- Migration: Fix food_items column names to match Go code
-- Description: Renames calories->calories_per_100, protein->protein_per_100, etc.
--              Adds missing fiber_per_100, sugar_per_100, sodium_per_100 columns.
-- Version: 011
-- Date: 2026-02-19

-- Rename existing columns
ALTER TABLE food_items RENAME COLUMN calories TO calories_per_100;
ALTER TABLE food_items RENAME COLUMN protein TO protein_per_100;
ALTER TABLE food_items RENAME COLUMN fat TO fat_per_100;
ALTER TABLE food_items RENAME COLUMN carbs TO carbs_per_100;

-- Add missing nutrient columns
ALTER TABLE food_items ADD COLUMN IF NOT EXISTS fiber_per_100 DECIMAL(10,2) DEFAULT 0;
ALTER TABLE food_items ADD COLUMN IF NOT EXISTS sugar_per_100 DECIMAL(10,2) DEFAULT 0;
ALTER TABLE food_items ADD COLUMN IF NOT EXISTS sodium_per_100 DECIMAL(10,2) DEFAULT 0;
