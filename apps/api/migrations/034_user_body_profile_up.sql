-- Add body profile fields to user_settings for KBJU calculation
ALTER TABLE user_settings ADD COLUMN birth_date DATE;
ALTER TABLE user_settings ADD COLUMN biological_sex VARCHAR(10)
    CHECK (biological_sex IN ('male', 'female'));
ALTER TABLE user_settings ADD COLUMN activity_level VARCHAR(20) DEFAULT 'moderate'
    CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active'));
ALTER TABLE user_settings ADD COLUMN fitness_goal VARCHAR(20) DEFAULT 'maintain'
    CHECK (fitness_goal IN ('loss', 'maintain', 'gain'));
