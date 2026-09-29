-- Rollback: 087_food_items_search_vector
--
-- Возвращает индекс по выражению и снимает материализованную колонку.
-- Порядок важен: сначала индекс, иначе поиск останется без индекса вовсе на
-- время между двумя операторами.

CREATE INDEX IF NOT EXISTS idx_food_items_name_brand_fts
  ON food_items USING gin (
    to_tsvector('russian', COALESCE(name, '') || ' ' || COALESCE(brand, ''))
  );

DROP INDEX IF EXISTS idx_food_items_search;

ALTER TABLE food_items DROP COLUMN IF EXISTS search_vector;
