## Context

`SearchFoods` (`apps/api/internal/modules/food-tracker/service.go`) runs a 3-branch UNION ALL. The `products` branch filters with `name ILIKE '%' || $1 || '%'` and `brand ILIKE '%' || $1 || '%'`. PostgreSQL cannot use a B-tree index when the pattern starts with `%`, so every search does a full sequential scan on the `products` table.

The `food_items` branch already uses Russian GIN full-text search (`plainto_tsquery`) and is not affected.

Current highest migration: `043_articles_scheduled_idx_up.sql`. Next migration slot: **044**.

Constraint from migration 043 incident: migrations run inside transactions — `CREATE INDEX CONCURRENTLY` is forbidden.

`pg_trgm` is pre-installed on Yandex Cloud PostgreSQL clusters; `CREATE EXTENSION IF NOT EXISTS` is safe and idempotent.

## Goals / Non-Goals

**Goals:**
- Eliminate full sequential scan on `products` for ILIKE substring searches
- Keep the fix purely additive (no Go code changes, no API contract changes)
- Make the migration safe to re-run and independently deployable

**Non-Goals:**
- Changing the `SearchFoods` query text or its result set
- Indexing `food_items` (already uses FTS, no issue)
- Rewriting search to use FTS instead of ILIKE

## Decisions

**GIN trigram indexes over B-tree or FTS rewrite**

`gin_trgm_ops` indexes are the only PostgreSQL index type that supports `ILIKE '%text%'` with a leading wildcard. B-tree cannot help here. A full-text search rewrite would change query semantics (stemming, tokenization) and the API contract — out of scope. Two separate indexes (one per column) let the planner use each independently or combine via bitmap AND/OR.

**No CONCURRENTLY**

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction. All project migrations run inside transactions (lesson from migration 043). Standard `CREATE INDEX IF NOT EXISTS` is used instead; the table will be briefly locked during index build, acceptable for a migration deployment window.

**`IF NOT EXISTS` on both EXTENSION and INDEX**

Ensures idempotent re-runs with no error output. Safe for CI and manual re-runs.

## Risks / Trade-offs

- **Index build time** → Mitigation: deploy during low-traffic window; index build on `products` is a one-time cost.
- **Write overhead** → Mitigation: GIN trigram indexes add marginal write cost per INSERT/UPDATE on `products`; product catalog is write-infrequent relative to reads.
- **Lock during build** → Mitigation: `products` table is populated by admin/import flows, not user writes; brief lock during migration is acceptable.

## Migration Plan

1. Apply `044_add_trigram_indexes_up.sql` to dev, verify with `EXPLAIN ANALYZE` that ILIKE queries use `Bitmap Index Scan on idx_products_name_trgm`.
2. Apply to prod during next deployment window.

Rollback: `044_add_trigram_indexes_down.sql` drops both indexes. Extension is left in place (removing `pg_trgm` could affect other queries; the extension itself is harmless).
