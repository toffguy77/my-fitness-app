-- Revert user_foods schema changes
ALTER TABLE user_foods RENAME COLUMN calories_per_100 TO calories;
ALTER TABLE user_foods RENAME COLUMN protein_per_100 TO protein;
ALTER TABLE user_foods RENAME COLUMN fat_per_100 TO fat;
ALTER TABLE user_foods RENAME COLUMN carbs_per_100 TO carbs;

ALTER TABLE user_foods DROP COLUMN IF EXISTS brand;
ALTER TABLE user_foods DROP COLUMN IF EXISTS source_food_id;

ALTER TABLE user_foods ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE user_foods ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

DROP INDEX IF EXISTS idx_user_foods_name_fts;
CREATE INDEX idx_user_foods_name_fts ON user_foods
    USING gin(to_tsvector('russian', name));

CREATE INDEX IF NOT EXISTS idx_user_foods_shared ON user_foods(is_shared) WHERE is_shared = true;

ALTER TABLE user_foods DROP CONSTRAINT IF EXISTS user_foods_calories_per_100_check;
ALTER TABLE user_foods DROP CONSTRAINT IF EXISTS user_foods_protein_per_100_check;
ALTER TABLE user_foods DROP CONSTRAINT IF EXISTS user_foods_fat_per_100_check;
ALTER TABLE user_foods DROP CONSTRAINT IF EXISTS user_foods_carbs_per_100_check;

ALTER TABLE user_foods ADD CONSTRAINT user_foods_calories_check CHECK (calories >= 0);
ALTER TABLE user_foods ADD CONSTRAINT user_foods_protein_check CHECK (protein >= 0);
ALTER TABLE user_foods ADD CONSTRAINT user_foods_fat_check CHECK (fat >= 0);
ALTER TABLE user_foods ADD CONSTRAINT user_foods_carbs_check CHECK (carbs >= 0);
