-- ============================================================================
-- Миграция 083: справочник говорит, откуда брать потребление
-- ============================================================================
--
-- `intake_source` появился миграцией 082 и остался пустым у всех 33 строк: продукт
-- не считал потребление микронутриентов вовсе. Считать по чему есть — решение
-- владельца продукта; данные для этого лежали в `food_items.additional_nutrients`
-- (заполнено у 1 735 984 продуктов из 1 777 854) и не читались ни одной строкой
-- Go.
--
-- Значение колонки — `механизм:ключ`, чтобы служебное знание «железо лежит в
-- jsonb, а клетчатка в колонке» жило в справочнике, а не расползалось по коду:
--
--   kbzhu:<поле>            — из дневных итогов КБЖУ
--   column:<колонка>        — из своей колонки food_items
--   json:<ключ>             — из food_items.additional_nutrients, граммы на 100 г
--
-- Колонки предпочтительнее jsonb там, где есть обе: `fiber_per_100` заполнена у
-- 668 000 продуктов, `sodium_per_100` — у 1 290 000, против ~250 000 у самого
-- заполненного ключа jsonb.

ALTER TABLE nutrient_recommendations
    DROP CONSTRAINT IF EXISTS nutrient_recommendations_intake_source_check;

ALTER TABLE nutrient_recommendations
    ADD CONSTRAINT nutrient_recommendations_intake_source_check
    CHECK (
        intake_source IS NULL
        OR intake_source IN (
            'kbzhu:calories', 'kbzhu:protein', 'kbzhu:fat', 'kbzhu:carbs',
            'column:fiber_per_100', 'column:sodium_per_100',
            'json:iron', 'json:calcium', 'json:potassium', 'json:magnesium',
            'json:zinc', 'json:vitamin_a', 'json:vitamin_c', 'json:vitamin_d',
            'json:vitamin_e', 'json:vitamin_b1', 'json:vitamin_b2',
            'json:vitamin_b6', 'json:vitamin_b9', 'json:vitamin_b12'
        )
    );

COMMENT ON COLUMN nutrient_recommendations.intake_source IS
    'Откуда брать потребление: kbzhu:<поле> | column:<колонка> | json:<ключ jsonb>. Пусто — не считается, и тогда ноль показывать нельзя';

-- Шестнадцать нутриентов, для которых содержание в продуктах есть.
-- Остальные семнадцать остаются пустыми: данных нет, и ноль был бы ложью.
UPDATE nutrient_recommendations SET intake_source = 'column:fiber_per_100' WHERE name = 'Пищевые волокна';
UPDATE nutrient_recommendations SET intake_source = 'column:sodium_per_100' WHERE name = 'Натрий';

UPDATE nutrient_recommendations SET intake_source = 'json:iron'        WHERE name = 'Железо';
UPDATE nutrient_recommendations SET intake_source = 'json:calcium'     WHERE name = 'Кальций';
UPDATE nutrient_recommendations SET intake_source = 'json:potassium'   WHERE name = 'Калий';
UPDATE nutrient_recommendations SET intake_source = 'json:magnesium'   WHERE name = 'Магний';
UPDATE nutrient_recommendations SET intake_source = 'json:zinc'        WHERE name = 'Цинк';
UPDATE nutrient_recommendations SET intake_source = 'json:vitamin_a'   WHERE name = 'Витамин A';
UPDATE nutrient_recommendations SET intake_source = 'json:vitamin_c'   WHERE name = 'Витамин C';
UPDATE nutrient_recommendations SET intake_source = 'json:vitamin_d'   WHERE name = 'Витамин D';
UPDATE nutrient_recommendations SET intake_source = 'json:vitamin_e'   WHERE name = 'Витамин E';
UPDATE nutrient_recommendations SET intake_source = 'json:vitamin_b1'  WHERE name = 'Витамин B1 (тиамин)';
UPDATE nutrient_recommendations SET intake_source = 'json:vitamin_b2'  WHERE name = 'Витамин B2 (рибофлавин)';
UPDATE nutrient_recommendations SET intake_source = 'json:vitamin_b6'  WHERE name = 'Витамин B6';
UPDATE nutrient_recommendations SET intake_source = 'json:vitamin_b12' WHERE name = 'Витамин B12';

-- Фолаты: в OpenFoodFacts этот показатель называется vitamin_b9.
UPDATE nutrient_recommendations SET intake_source = 'json:vitamin_b9'  WHERE name = 'Фолаты';
