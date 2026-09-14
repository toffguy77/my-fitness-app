-- Откат снимает только то, что миграция добавила поверх живой схемы. Таблицы
-- categories и nutrients не удаляются: на живых средах в них лежат настоящие
-- данные импорта, и «откат» не повод их стереть.
ALTER TABLE products ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE products ALTER COLUMN source DROP NOT NULL;
DROP INDEX IF EXISTS idx_products_name;
ALTER TABLE food_items DROP COLUMN IF EXISTS default_weight;
ALTER TABLE food_items DROP COLUMN IF EXISTS default_weight_unit;
