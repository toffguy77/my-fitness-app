-- Откуда пришли шаги, вес и тренировка дня: введены руками или пришли из
-- Apple Здоровья (healthkit-sync).
--
-- Источник нужен ради одного правила: импорт никогда не затирает введённое
-- вручную. NULL — значения нет, и импорт вправе его записать.
--
-- Всё, что сохранено до этой миграции, ввёл человек: импорта ещё не было.
-- Поэтому непустые значения получают 'manual'. Пустые (0 шагов, вес не
-- задан, тренировка не отмечена) остаются без источника.
ALTER TABLE daily_metrics
    ADD COLUMN IF NOT EXISTS steps_source TEXT
        CONSTRAINT daily_metrics_steps_source_check CHECK (steps_source IN ('manual', 'healthkit')),
    ADD COLUMN IF NOT EXISTS weight_source TEXT
        CONSTRAINT daily_metrics_weight_source_check CHECK (weight_source IN ('manual', 'healthkit')),
    ADD COLUMN IF NOT EXISTS workout_source TEXT
        CONSTRAINT daily_metrics_workout_source_check CHECK (workout_source IN ('manual', 'healthkit'));

UPDATE daily_metrics SET steps_source = 'manual'
WHERE steps_source IS NULL AND COALESCE(steps, 0) > 0;

UPDATE daily_metrics SET weight_source = 'manual'
WHERE weight_source IS NULL AND weight IS NOT NULL;

UPDATE daily_metrics SET workout_source = 'manual'
WHERE workout_source IS NULL
  AND (workout_completed = true OR NULLIF(btrim(workout_type), '') IS NOT NULL);

-- Тренировки из Здоровья — по строке на HKWorkout, ключ — её UUID.
-- Тренировка дня в daily_metrics (workout_*) — производная от этих строк:
-- без UUID повторная пачка удвоила бы минуты, а удаление в Здоровье нечем
-- было бы отразить.
--
-- type — наш код вида тренировки (strength, running, …, other), в который
-- сервер переводит HKWorkoutActivityType.
CREATE TABLE IF NOT EXISTS health_workouts (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_id  TEXT        NOT NULL CHECK (length(external_id) BETWEEN 1 AND 255),
    date         DATE        NOT NULL,
    type         TEXT        NOT NULL,
    duration_min INTEGER     NOT NULL CHECK (duration_min BETWEEN 1 AND 600),
    started_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT health_workouts_user_external_key UNIQUE (user_id, external_id)
);

-- Пересчёт тренировки дня читает все тренировки пользователя за дату.
CREATE INDEX IF NOT EXISTS idx_health_workouts_user_date ON health_workouts (user_id, date);
