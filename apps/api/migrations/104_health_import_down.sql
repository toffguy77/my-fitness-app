DROP TABLE IF EXISTS health_workouts;

ALTER TABLE daily_metrics
    DROP COLUMN IF EXISTS steps_source,
    DROP COLUMN IF EXISTS weight_source,
    DROP COLUMN IF EXISTS workout_source;
