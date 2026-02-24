-- Add composite FTS index on food_items covering name and brand for food search
-- Mirrors idx_products_name_brand_fts from migration 012
CREATE INDEX IF NOT EXISTS idx_food_items_name_brand_fts
ON food_items USING GIN (to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')));
