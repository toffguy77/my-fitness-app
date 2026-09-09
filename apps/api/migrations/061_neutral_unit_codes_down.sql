-- Обратно в русские слова. Значения вне списка так же не трогаются.

UPDATE food_items SET serving_unit = CASE serving_unit
    WHEN 'g' THEN 'г'
    WHEN 'ml' THEN 'мл'
    WHEN 'pcs' THEN 'шт'
    WHEN 'serving' THEN 'порция'
    ELSE serving_unit
END
WHERE serving_unit IN ('g', 'ml', 'pcs', 'serving');

UPDATE user_foods SET serving_unit = CASE serving_unit
    WHEN 'g' THEN 'г'
    WHEN 'ml' THEN 'мл'
    WHEN 'pcs' THEN 'шт'
    WHEN 'serving' THEN 'порция'
    ELSE serving_unit
END
WHERE serving_unit IN ('g', 'ml', 'pcs', 'serving');

ALTER TABLE food_items ALTER COLUMN serving_unit SET DEFAULT 'г';
ALTER TABLE user_foods ALTER COLUMN serving_unit SET DEFAULT 'г';

UPDATE nutrient_recommendations SET unit = CASE unit
    WHEN 'g' THEN 'г'
    WHEN 'mg' THEN 'мг'
    WHEN 'mcg' THEN 'мкг'
    WHEN 'IU' THEN 'МЕ'
    ELSE unit
END
WHERE unit IN ('g', 'mg', 'mcg', 'IU');

ALTER TABLE user_custom_recommendations DROP CONSTRAINT IF EXISTS user_custom_recommendations_unit_check;

UPDATE user_custom_recommendations SET unit = CASE unit
    WHEN 'g' THEN 'г'
    WHEN 'mg' THEN 'мг'
    WHEN 'mcg' THEN 'мкг'
    WHEN 'IU' THEN 'МЕ'
    ELSE unit
END
WHERE unit IN ('g', 'mg', 'mcg', 'IU');

ALTER TABLE user_custom_recommendations
    ADD CONSTRAINT user_custom_recommendations_unit_check
    CHECK (unit IN ('г', 'мг', 'мкг', 'МЕ'));
