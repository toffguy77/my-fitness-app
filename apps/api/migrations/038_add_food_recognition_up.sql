-- Add photo_url to food_entries for storing food photos from AI recognition
ALTER TABLE food_entries ADD COLUMN photo_url TEXT;

-- Rate limiting table for AI food recognition usage tracking
CREATE TABLE food_recognition_usage (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    photo_url TEXT,
    foods_count INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_food_recognition_usage_user_date
    ON food_recognition_usage (user_id, used_at);
