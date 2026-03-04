ALTER TABLE user_settings ADD COLUMN height DECIMAL(4,1) CHECK (height > 0 AND height <= 300);
