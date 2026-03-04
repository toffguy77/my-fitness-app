CREATE TABLE user_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(255),
    calories_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    protein_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    fat_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    carbs_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    serving_size NUMERIC(8,2) NOT NULL DEFAULT 100,
    serving_unit VARCHAR(50) NOT NULL DEFAULT 'г',
    source_food_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_foods_user_id ON user_foods(user_id);
CREATE INDEX idx_user_foods_name_fts ON user_foods
    USING gin(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')));
