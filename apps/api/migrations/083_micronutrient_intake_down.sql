-- Откат миграции 083: потребление микронутриентов снова не считается.

UPDATE nutrient_recommendations SET intake_source = NULL;

ALTER TABLE nutrient_recommendations
    DROP CONSTRAINT IF EXISTS nutrient_recommendations_intake_source_check;

ALTER TABLE nutrient_recommendations
    ADD CONSTRAINT nutrient_recommendations_intake_source_check
    CHECK (intake_source IS NULL OR intake_source IN ('calories', 'protein', 'fat', 'carbs', 'fiber', 'sodium'));
