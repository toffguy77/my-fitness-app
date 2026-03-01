ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS target_weight DECIMAL(5,1);
COMMENT ON COLUMN user_settings.target_weight IS 'Target weight goal in kg (0.1-500), nullable';
