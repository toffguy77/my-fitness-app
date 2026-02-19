-- Add composite FTS index on products table covering both name and brand for food search
CREATE INDEX IF NOT EXISTS idx_products_name_brand_fts
ON products USING GIN (to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')));
