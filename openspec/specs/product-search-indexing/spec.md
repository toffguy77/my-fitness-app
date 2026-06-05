# product-search-indexing Specification

## Purpose
TBD - created by archiving change add-trigram-indexes-products. Update Purpose after archive.
## Requirements
### Requirement: Trigram extension is enabled
The database SHALL have the `pg_trgm` extension enabled so that GIN trigram operator classes are available.

#### Scenario: Extension present after migration
- **WHEN** migration 044 is applied
- **THEN** `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'` returns one row

### Requirement: Products name column has a trigram index
The `products` table SHALL have a GIN trigram index on the `name` column (`idx_products_name_trgm`) so that `ILIKE '%text%'` queries use an index scan instead of a sequential scan.

#### Scenario: Index exists after migration
- **WHEN** migration 044 is applied
- **THEN** `\d products` (or equivalent catalog query) lists `idx_products_name_trgm` as a GIN index on `name`

#### Scenario: ILIKE query uses index
- **WHEN** `EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM products WHERE name ILIKE '%курица%'` is run after migration
- **THEN** the query plan contains `Bitmap Index Scan on idx_products_name_trgm` and does NOT contain `Seq Scan on products`

### Requirement: Products brand column has a trigram index
The `products` table SHALL have a GIN trigram index on the `brand` column (`idx_products_brand_trgm`) so that brand-filtered ILIKE queries use an index scan.

#### Scenario: Index exists after migration
- **WHEN** migration 044 is applied
- **THEN** `\d products` lists `idx_products_brand_trgm` as a GIN index on `brand`

### Requirement: Migration is idempotent
Applying migration 044 a second time SHALL produce no error and no state change.

#### Scenario: Re-run is safe
- **WHEN** migration 044 is applied twice
- **THEN** the second run completes without error, and the index count on `products` for `idx_products_name_trgm` and `idx_products_brand_trgm` is still exactly 1 each

### Requirement: Migration is reversible
Running the down migration SHALL drop both trigram indexes without affecting the `pg_trgm` extension or any other indexes.

#### Scenario: Down migration removes indexes
- **WHEN** `044_add_trigram_indexes_down.sql` is applied
- **THEN** `idx_products_name_trgm` and `idx_products_brand_trgm` no longer exist in `pg_indexes`
- **THEN** `pg_trgm` extension is still present

