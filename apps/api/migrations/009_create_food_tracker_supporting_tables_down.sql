-- Migration: Drop Food Tracker Supporting Tables
-- Description: Rollback migration 009 - drops all supporting tables for food tracker
-- Version: 009
-- Date: 2025-01-30

-- ============================================================================
-- Drop tables in reverse order (respecting foreign key dependencies)
-- ============================================================================

-- 1. Drop user_favorite_foods (depends on food_items)
DROP TABLE IF EXISTS user_favorite_foods CASCADE;

-- 2. Drop meal_templates (no dependencies)
DROP TABLE IF EXISTS meal_templates CASCADE;

-- 3. Drop user_custom_recommendations (no dependencies)
DROP TABLE IF EXISTS user_custom_recommendations CASCADE;

-- 4. Drop user_nutrient_preferences (depends on nutrient_recommendations)
DROP TABLE IF EXISTS user_nutrient_preferences CASCADE;

-- 5. Drop nutrient_recommendations (referenced by user_nutrient_preferences)
DROP TABLE IF EXISTS nutrient_recommendations CASCADE;

-- 6. Drop user_foods (no dependencies)
DROP TABLE IF EXISTS user_foods CASCADE;

-- ============================================================================
-- Migration rollback complete
-- ============================================================================
