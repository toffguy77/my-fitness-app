CREATE TABLE daily_calculated_targets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    calories DECIMAL(7,1) NOT NULL,
    protein DECIMAL(5,1) NOT NULL,
    fat DECIMAL(5,1) NOT NULL,
    carbs DECIMAL(5,1) NOT NULL,
    bmr DECIMAL(7,1) NOT NULL,
    tdee DECIMAL(7,1) NOT NULL,
    workout_bonus DECIMAL(6,1) NOT NULL DEFAULT 0,
    weight_used DECIMAL(5,1) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'calculated'
        CHECK (source IN ('calculated', 'curator_override')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_date UNIQUE (user_id, date)
);

CREATE INDEX idx_dct_user_date ON daily_calculated_targets(user_id, date DESC);

DO $$ BEGIN
    EXECUTE 'GRANT ALL ON TABLE daily_calculated_targets TO PUBLIC';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE daily_calculated_targets_id_seq TO PUBLIC';
END $$;
