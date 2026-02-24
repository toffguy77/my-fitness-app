# OpenFoodFacts CSV Import Design

## Problem

Barcode lookups go to the OpenFoodFacts API (overseas, 10s timeout), causing slow/failed scans. The API is unreliable from Russia.

## Solution

Import ~3M qualifying products from the OpenFoodFacts CSV dump directly into the existing `food_items` table, then change barcode lookup to query locally first with API as fallback.

## Data Analysis

- CSV dump: 4.37M rows, 12GB, 215 columns (tab-separated)
- Qualifying products (barcode >=8 chars + name + КБЖУ): **3,003,220 (69%)**
- Additional coverage: sugar 94%, sodium 87%, brand 69%, fiber 50%, category 47%

## Components

### 1. Go CLI Import Tool (`cmd/import-openfoodfacts/main.go`)

Streaming CSV parser that reads line-by-line (12GB won't fit in memory).

**Pipeline:** CSV row -> filter (barcode >=8, name, КБЖУ required) -> column mapping -> batch (1000 rows) -> upsert to DB

**Column mapping:**

| CSV column | food_items column | Notes |
|---|---|---|
| `code` | `barcode` | Only >=8 chars |
| `product_name` | `name` | Required |
| `brands` | `brand` | First brand from comma list |
| `categories_en` | `category` | First category |
| `serving_size` | `serving_size` | Parse number, default 100 |
| `energy-kcal_100g` | `calories` | Required |
| `proteins_100g` | `protein` | Required |
| `fat_100g` | `fat` | Required |
| `carbohydrates_100g` | `carbs` | Required |
| `fiber_100g`, `sugars_100g`, `sodium_100g`, vitamins, minerals | `additional_nutrients` | JSONB |

**Fixed values:** `source='openfoodfacts'`, `verified=false`, `serving_unit='г'`

**CLI flags:**
- `--database-url` — PostgreSQL connection string
- `--csv-path` — path to CSV file
- `--batch-size` — batch size (default 1000)
- `--dry-run` — count without writing

### 2. Deduplication & Enrichment Strategy

Per batch of 1000 CSV rows:

**Step 1 — Match by barcode:**
```sql
SELECT id, barcode, name, brand FROM food_items WHERE barcode IN ($1, $2, ... $1000)
```
If found: UPDATE — fill empty fields only, never overwrite existing data.

**Step 2 — Match by name+brand (remaining rows):**
```sql
SELECT id, name, brand FROM food_items
WHERE (LOWER(name), LOWER(COALESCE(brand, ''))) IN (($1,$2), ($3,$4), ...)
AND (barcode IS NULL OR barcode = '')
```
If found: UPDATE — add barcode + enrich empty nutrient fields.

**Step 3 — INSERT remaining:**
```sql
INSERT INTO food_items (id, name, brand, ..., source, verified)
VALUES ...
ON CONFLICT (barcode) DO NOTHING  -- race condition guard
```

**Enrichment principle:** Fill empty fields, never overwrite non-empty. Existing data (possibly manual/verified) takes priority over dump data.

### 3. Barcode Lookup Changes

**Current flow:**
```
barcode_cache -> (miss) -> OpenFoodFacts API -> cache + create food_item
```

**New flow:**
```
food_items WHERE barcode = ? -> (miss) -> OpenFoodFacts API -> create food_item
```

Changes:
- `barcode_cache` no longer needed for main flow — 3M products already in `food_items`
- Barcode lookup queries `food_items` by barcode index (~1ms)
- On miss: API fallback, result saved to `food_items` (as currently)
- `barcode_cache` table left as-is, just no longer queried in main path

**Files to modify:**
- `apps/api/internal/modules/food-tracker/search_handler.go` — `LookupBarcode()`
- `apps/api/internal/modules/food-tracker/service.go` — lookup logic

### 4. Search Improvements

- FTS index on `food_items.name` (Russian) automatically covers new rows — no changes needed
- Add result ranking: `verified=true` / `source='database'` ranked higher than `source='openfoodfacts'` / `verified=false`
- Optional future: `pg_trgm` index for fuzzy/typo search

## Out of Scope

- Periodic re-import / sync with new CSV dumps
- Image import from OpenFoodFacts
- `barcode_cache` table cleanup/migration
- `pg_trgm` fuzzy search (future iteration)
