-- Откат миграции 082.
--
-- Справочник возвращается к состоянию «пустая таблица с числовыми колонками»:
-- именно таким он и был с миграции 009 до этой.

DROP TABLE IF EXISTS nutrient_norms CASCADE;

DELETE FROM nutrient_recommendations WHERE source = 'МР 2.3.1.0253-21';

ALTER TABLE nutrient_recommendations
    DROP CONSTRAINT IF EXISTS nutrient_recommendations_intake_source_check;

ALTER TABLE nutrient_recommendations
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS source_version,
    DROP COLUMN IF EXISTS intake_source,
    ADD COLUMN IF NOT EXISTS daily_target NUMERIC(10, 4),
    ADD COLUMN IF NOT EXISTS min_recommendation NUMERIC(10, 4),
    ADD COLUMN IF NOT EXISTS optimal_recommendation NUMERIC(10, 4);
