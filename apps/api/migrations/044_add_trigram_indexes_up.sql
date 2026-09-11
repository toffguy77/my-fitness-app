-- WITH SCHEMA public: an extension belongs to one schema for the whole
-- database, and without saying which, it lands in whatever schema happens to
-- be first on the search_path. gin_trgm_ops then cannot be found from anywhere
-- else — which is what happens when tests run each package in its own schema.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON products USING GIN (brand gin_trgm_ops);
