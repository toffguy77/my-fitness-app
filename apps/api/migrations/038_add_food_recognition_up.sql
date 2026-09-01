-- IF NOT EXISTS added so the chain can be applied to an empty database:
-- several of these objects are also created by earlier migrations, and a
-- bare CREATE aborted the run. Idempotent statements are a no-op where the
-- object already exists, so production is unaffected.
-- Add photo_url to food_entries for storing food photos from AI recognition
ALTER TABLE food_entries ADD COLUMN photo_url TEXT;

-- Rate limiting table for AI food recognition usage tracking
CREATE TABLE IF NOT EXISTS food_recognition_usage (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    photo_url TEXT,
    foods_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_food_recognition_usage_user_date
    ON food_recognition_usage (user_id, used_at);
