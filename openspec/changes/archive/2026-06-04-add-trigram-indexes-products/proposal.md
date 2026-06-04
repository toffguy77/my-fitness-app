## Why

`SearchFoods` in `apps/api/internal/modules/food-tracker/service.go` runs a 3-table UNION ALL. The `products` branch uses `ILIKE '%' || $1 || '%'` on both `name` and `brand` columns. A leading `%` wildcard prevents PostgreSQL from using any standard B-tree index, resulting in a full sequential scan on every search request. Under the 1-second `LogDatabaseQuery` warning threshold this is the highest-risk query in the food-tracker module.

The `food_items` branch of the same query already uses `@@ plainto_tsquery('russian', $1)` backed by a GIN full-text index and is unaffected.

## What Changes

A new migration (`044`) enables the `pg_trgm` PostgreSQL extension and creates GIN trigram indexes on `products(name)` and `products(brand)`. No Go source code changes are required — PostgreSQL's query planner picks up the indexes transparently for any `ILIKE` pattern on those columns.

## Capabilities

### New Capabilities

- `product-search-indexing`: trigram-indexed product name and brand search — `ILIKE '%text%'` queries on the `products` table are now index-supported via GIN trigram indexes, eliminating full sequential scans.

### Modified Capabilities

None. The `SearchFoods` query text, API contract, and all Go code remain unchanged.

## Impact

- **Performance**: product search queries drop from O(table size) sequential scan to O(log n + result set) index scan.
- **Risk**: additive-only migration with `CREATE EXTENSION IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` — safe to re-run. No CONCURRENTLY (migrations run inside transactions). No rollback risk to application logic.
- **Deployment**: migration can be deployed independently before or alongside any code change.
