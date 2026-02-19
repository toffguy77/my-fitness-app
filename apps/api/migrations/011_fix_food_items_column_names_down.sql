-- Rollback: Revert food_items column names
ALTER TABLE food_items DROP COLUMN IF EXISTS fiber_per_100;
ALTER TABLE food_items DROP COLUMN IF EXISTS sugar_per_100;
ALTER TABLE food_items DROP COLUMN IF EXISTS sodium_per_100;

ALTER TABLE food_items RENAME COLUMN calories_per_100 TO calories;
ALTER TABLE food_items RENAME COLUMN protein_per_100 TO protein;
ALTER TABLE food_items RENAME COLUMN fat_per_100 TO fat;
ALTER TABLE food_items RENAME COLUMN carbs_per_100 TO carbs;
