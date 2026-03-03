ALTER TABLE user_settings ADD COLUMN water_goal INTEGER CHECK (water_goal > 0 AND water_goal <= 30);
