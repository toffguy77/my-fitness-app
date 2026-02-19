-- Add composite FTS index covering both name and brand for food search
CREATE INDEX IF NOT EXISTS idx_food_items_name_brand_fts
ON food_items USING GIN (to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')));
