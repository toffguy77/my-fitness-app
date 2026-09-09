-- Единицы измерения перестают быть русскими словами.
--
-- Эти колонки хранят значения, а не подписи: интерфейс показывал их как есть,
-- поэтому второй язык увидел бы «г» и «мкг» посреди английского текста.
-- Перевести их на месте нельзя — переведённая копия не совпала бы с уже
-- записанными строками. Поэтому здесь они переводятся один раз в нейтральные
-- коды, а подпись подбирается при отображении.
--
-- Человек видит ровно то же самое: 'g' по-русски по-прежнему «г».
--
-- Значения вне списка не трогаются: serving_unit у импортированных продуктов
-- может содержать что угодно, и придумывать для него код — значит потерять то,
-- что там было.

-- Порции.
UPDATE food_items SET serving_unit = CASE serving_unit
    WHEN 'г' THEN 'g'
    WHEN 'мл' THEN 'ml'
    WHEN 'шт' THEN 'pcs'
    WHEN 'порция' THEN 'serving'
    ELSE serving_unit
END
WHERE serving_unit IN ('г', 'мл', 'шт', 'порция');

UPDATE user_foods SET serving_unit = CASE serving_unit
    WHEN 'г' THEN 'g'
    WHEN 'мл' THEN 'ml'
    WHEN 'шт' THEN 'pcs'
    WHEN 'порция' THEN 'serving'
    ELSE serving_unit
END
WHERE serving_unit IN ('г', 'мл', 'шт', 'порция');

ALTER TABLE food_items ALTER COLUMN serving_unit SET DEFAULT 'g';
ALTER TABLE user_foods ALTER COLUMN serving_unit SET DEFAULT 'g';

-- Нутриенты в справочнике: ограничения на значения нет, только замена.
UPDATE nutrient_recommendations SET unit = CASE unit
    WHEN 'г' THEN 'g'
    WHEN 'мг' THEN 'mg'
    WHEN 'мкг' THEN 'mcg'
    WHEN 'МЕ' THEN 'IU'
    ELSE unit
END
WHERE unit IN ('г', 'мг', 'мкг', 'МЕ');

-- Пользовательские рекомендации: здесь значения ограничены списком, поэтому
-- сначала снимается старое ограничение, потом меняются значения, потом
-- ставится новое. В обратном порядке UPDATE не прошёл бы.
ALTER TABLE user_custom_recommendations DROP CONSTRAINT IF EXISTS user_custom_recommendations_unit_check;

UPDATE user_custom_recommendations SET unit = CASE unit
    WHEN 'г' THEN 'g'
    WHEN 'мг' THEN 'mg'
    WHEN 'мкг' THEN 'mcg'
    WHEN 'МЕ' THEN 'IU'
    ELSE unit
END
WHERE unit IN ('г', 'мг', 'мкг', 'МЕ');

ALTER TABLE user_custom_recommendations
    ADD CONSTRAINT user_custom_recommendations_unit_check
    CHECK (unit IN ('g', 'mg', 'mcg', 'IU'));
