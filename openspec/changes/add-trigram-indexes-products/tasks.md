## 1. Migration files

- [x] 1.1 Create `apps/api/migrations/044_add_trigram_indexes_up.sql` with `CREATE EXTENSION IF NOT EXISTS pg_trgm`, `CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING GIN (name gin_trgm_ops)`, and `CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON products USING GIN (brand gin_trgm_ops)`
- [x] 1.2 Create `apps/api/migrations/044_add_trigram_indexes_down.sql` with `DROP INDEX IF EXISTS idx_products_name_trgm` and `DROP INDEX IF EXISTS idx_products_brand_trgm`

## 2. Verification

- [ ] 2.1 Apply migration to dev database and confirm via `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'` that the extension is present
- [ ] 2.2 Run `EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM products WHERE name ILIKE '%курица%'` and confirm the plan shows `Bitmap Index Scan on idx_products_name_trgm` with no `Seq Scan on products`
- [x] 2.3 Run full backend test suite (`cd apps/api && go test ./...`) and confirm no regressions
