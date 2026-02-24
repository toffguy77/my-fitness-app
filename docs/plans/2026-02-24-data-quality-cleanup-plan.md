# Data Quality Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up 2.28M food_items + 105K products: remove garbage, normalize names/categories, extract weight/vendor, deduplicate, and prefill weight in UI.

**Architecture:** SQL migration for schema changes + Go CLI tool (`cmd/cleanup-food-data/`) that runs 7 SQL-based phases. Backend returns new `default_weight` field. Frontend prefills portion amount.

**Tech Stack:** Go 1.24, pgx/v5, PostgreSQL, Next.js/React, Zustand

---

### Task 1: Migration — Add default_weight columns

**Files:**
- Create: `apps/api/migrations/019_add_default_weight_columns_up.sql`
- Create: `apps/api/migrations/019_add_default_weight_columns_down.sql`

**Step 1: Create up migration**

```sql
-- Add default_weight columns to food_items
ALTER TABLE food_items ADD COLUMN IF NOT EXISTS default_weight DECIMAL(10,2);
ALTER TABLE food_items ADD COLUMN IF NOT EXISTS default_weight_unit TEXT DEFAULT 'г';

-- Add default_weight columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_weight DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_weight_unit TEXT DEFAULT 'г';

COMMENT ON COLUMN food_items.default_weight IS 'Package/serving weight extracted from product name, used to prefill portion input';
COMMENT ON COLUMN food_items.default_weight_unit IS 'Weight unit: г (grams) or мл (milliliters)';
COMMENT ON COLUMN products.default_weight IS 'Package/serving weight extracted from product name, used to prefill portion input';
COMMENT ON COLUMN products.default_weight_unit IS 'Weight unit: г (grams) or мл (milliliters)';
```

**Step 2: Create down migration**

```sql
ALTER TABLE food_items DROP COLUMN IF EXISTS default_weight;
ALTER TABLE food_items DROP COLUMN IF EXISTS default_weight_unit;
ALTER TABLE products DROP COLUMN IF EXISTS default_weight;
ALTER TABLE products DROP COLUMN IF EXISTS default_weight_unit;
```

**Step 3: Commit**

```bash
git add apps/api/migrations/019_*
git commit -m "feat: add default_weight columns to food_items and products"
```

---

### Task 2: CLI tool — Scaffolding + Phase 1 (delete garbage) + Phase 2 (clean names)

**Files:**
- Create: `apps/api/cmd/cleanup-food-data/main.go`

**Context:** Follow the same pattern as `cmd/import-openfoodfacts/main.go` — pgx connection, flag parsing, phased execution with logging. Support `--dry-run` and `--phase N` flags.

**Step 1: Write the CLI tool with Phases 1-2**

The tool structure:
- `main()` — parse flags, connect DB, run phases
- Phase 1: Delete garbage (zero КБЖУ, short names, absurd values)
- Phase 2: Clean names and brands (HTML entities, double spaces, trim, asterisks)

Phase 1 SQL statements:

```sql
-- food_items: delete zero КБЖУ
DELETE FROM food_items
WHERE calories_per_100 = 0 AND protein_per_100 = 0 AND fat_per_100 = 0 AND carbs_per_100 = 0
  AND id NOT IN (SELECT DISTINCT food_id FROM food_entries);

-- food_items: delete short names
DELETE FROM food_items
WHERE LENGTH(TRIM(name)) < 3
  AND id NOT IN (SELECT DISTINCT food_id FROM food_entries);

-- food_items: delete absurd nutritional values
DELETE FROM food_items
WHERE (calories_per_100 > 1000 OR protein_per_100 > 100 OR fat_per_100 > 100)
  AND id NOT IN (SELECT DISTINCT food_id FROM food_entries);

-- products: delete zero КБЖУ (check column names: calories, proteins, fats, carbs)
DELETE FROM products
WHERE calories = 0 AND proteins = 0 AND fats = 0 AND carbs = 0
  AND id NOT IN (SELECT DISTINCT food_id FROM food_entries WHERE food_id::text ~ '^[0-9]+$');
```

Note: protect rows referenced by `food_entries` to avoid FK violations.

Phase 2 SQL statements:

```sql
-- Decode HTML entities in food_items.name
UPDATE food_items SET name = REPLACE(name, '&quot;', '"') WHERE name LIKE '%&quot;%';
UPDATE food_items SET name = REPLACE(name, '&amp;', '&') WHERE name LIKE '%&amp;%';
UPDATE food_items SET name = REPLACE(name, '&lt;', '<') WHERE name LIKE '%&lt;%';
UPDATE food_items SET name = REPLACE(name, '&gt;', '>') WHERE name LIKE '%&gt;%';

-- Same for brand
UPDATE food_items SET brand = REPLACE(brand, '&quot;', '"') WHERE brand LIKE '%&quot;%';
UPDATE food_items SET brand = REPLACE(brand, '&amp;', '&') WHERE brand LIKE '%&amp;%';
UPDATE food_items SET brand = REPLACE(brand, '&lt;', '<') WHERE brand LIKE '%&lt;%';
UPDATE food_items SET brand = REPLACE(brand, '&gt;', '>') WHERE brand LIKE '%&gt;%';

-- Collapse multiple spaces
UPDATE food_items SET name = regexp_replace(name, '\s{2,}', ' ', 'g') WHERE name ~ '\s{2,}';
UPDATE food_items SET brand = regexp_replace(brand, '\s{2,}', ' ', 'g') WHERE brand IS NOT NULL AND brand ~ '\s{2,}';

-- Trim whitespace
UPDATE food_items SET name = TRIM(name) WHERE name != TRIM(name);
UPDATE food_items SET brand = TRIM(brand) WHERE brand IS NOT NULL AND brand != TRIM(brand);

-- Remove asterisks
UPDATE food_items SET name = REPLACE(name, '*', '') WHERE name LIKE '%*%';

-- Same cleanup for products table
UPDATE products SET name = REPLACE(name, '&quot;', '"') WHERE name LIKE '%&quot;%';
UPDATE products SET name = REPLACE(name, '&amp;', '&') WHERE name LIKE '%&amp;%';
UPDATE products SET name = regexp_replace(name, '\s{2,}', ' ', 'g') WHERE name ~ '\s{2,}';
UPDATE products SET name = TRIM(name) WHERE name != TRIM(name);
UPDATE products SET brand = TRIM(brand) WHERE brand IS NOT NULL AND brand != TRIM(brand);
```

**Step 2: Verify it compiles**

```bash
cd apps/api && go build ./cmd/cleanup-food-data/
```

**Step 3: Commit**

```bash
git add apps/api/cmd/cleanup-food-data/main.go
git commit -m "feat: add data cleanup tool with Phase 1 (garbage) and Phase 2 (names)"
```

---

### Task 3: CLI tool — Phase 3 (extract vendor) + Phase 4 (extract weight)

**Files:**
- Modify: `apps/api/cmd/cleanup-food-data/main.go`

**Phase 3 — Extract vendor from names:**

Target patterns in `products` table (where vendor markers exist):
- `[Макдоналдс]`, `[Ростик'c - KFC]`, `[Ашан]` — square brackets
- `(Ашан)` — parentheses with known store names

```sql
-- Extract [vendor] from name → brand (products table, where most patterns exist)
-- First, set brand from bracketed vendor if brand is empty
UPDATE products SET
    brand = TRIM(substring(name FROM '\[([^\]]+)\]')),
    name = TRIM(regexp_replace(name, '\s*\[[^\]]+\]\s*', ' ', 'g'))
WHERE name ~ '\[[^\]]+\]'
  AND (brand IS NULL OR brand = '');

-- For products where brand is already set, just remove brackets from name
UPDATE products SET
    name = TRIM(regexp_replace(name, '\s*\[[^\]]+\]\s*', ' ', 'g'))
WHERE name ~ '\[[^\]]+\]';

-- Same for food_items if any
UPDATE food_items SET
    brand = TRIM(substring(name FROM '\[([^\]]+)\]')),
    name = TRIM(regexp_replace(name, '\s*\[[^\]]+\]\s*', ' ', 'g'))
WHERE name ~ '\[[^\]]+\]'
  AND (brand IS NULL OR brand = '');

UPDATE food_items SET
    name = TRIM(regexp_replace(name, '\s*\[[^\]]+\]\s*', ' ', 'g'))
WHERE name ~ '\[[^\]]+\]';
```

**Phase 4 — Extract weight from names:**

Target patterns: `150 г`, `150г`, `200 гр`, `400 мл`, `0,5 л`, `1.5 кг`, `порция 100 гр`, `, 150 г,`

```sql
-- Extract weight from products (where Russian patterns exist)
-- Pattern: number + unit (г/гр/g/мл/ml/л/l/кг/kg)
UPDATE products SET
    default_weight = CASE
        WHEN name ~* '(\d+[.,]?\d*)\s*(кг|kg)' THEN
            CAST(REPLACE(substring(name FROM '(\d+[.,]?\d*)\s*(кг|kg)' FOR '#'), ',', '.') AS DECIMAL) * 1000
        WHEN name ~* '(\d+[.,]?\d*)\s*(л|l)\b' THEN
            CAST(REPLACE(substring(name FROM '(\d+[.,]?\d*)\s*(л|l)' FOR '#'), ',', '.') AS DECIMAL) * 1000
        ELSE
            CAST(REPLACE(
                substring(name FROM '(\d+[.,]?\d*)\s*(г|гр|g|мл|ml)\b' FOR '#'),
                ',', '.'
            ) AS DECIMAL)
    END,
    default_weight_unit = CASE
        WHEN name ~* '\d+[.,]?\d*\s*(мл|ml|л|l)\b' THEN 'мл'
        ELSE 'г'
    END
WHERE name ~* '\d+[.,]?\d*\s*(г|гр|g|мл|ml|л|l|кг|kg)\b'
  AND default_weight IS NULL;

-- Remove weight substring from name after extraction
UPDATE products SET
    name = TRIM(regexp_replace(name, ',?\s*\d+[.,]?\d*\s*(г|гр|g|мл|ml|л|l|кг|kg)\b', '', 'gi'))
WHERE default_weight IS NOT NULL;

-- Same for food_items
UPDATE food_items SET
    default_weight = CASE
        WHEN name ~* '(\d+[.,]?\d*)\s*(кг|kg)' THEN
            CAST(REPLACE(substring(name FROM '(\d+[.,]?\d*)\s*(кг|kg)' FOR '#'), ',', '.') AS DECIMAL) * 1000
        WHEN name ~* '(\d+[.,]?\d*)\s*(л|l)\b' THEN
            CAST(REPLACE(substring(name FROM '(\d+[.,]?\d*)\s*(л|l)' FOR '#'), ',', '.') AS DECIMAL) * 1000
        ELSE
            CAST(REPLACE(
                substring(name FROM '(\d+[.,]?\d*)\s*(г|гр|g|мл|ml)\b' FOR '#'),
                ',', '.'
            ) AS DECIMAL)
    END,
    default_weight_unit = CASE
        WHEN name ~* '\d+[.,]?\d*\s*(мл|ml|л|l)\b' THEN 'мл'
        ELSE 'г'
    END
WHERE name ~* '\d+[.,]?\d*\s*(г|гр|g|мл|ml|л|l|кг|kg)\b'
  AND default_weight IS NULL;

UPDATE food_items SET
    name = TRIM(regexp_replace(name, ',?\s*\d+[.,]?\d*\s*(г|гр|g|мл|ml|л|l|кг|kg)\b', '', 'gi'))
WHERE default_weight IS NOT NULL;
```

Note: The regex for weight extraction is complex. The implementer should test with sample data first and iterate. PostgreSQL `substring` with capture groups can be tricky — use Go code with `regexp` if SQL regex is too limiting.

**Step 2: Verify it compiles**

```bash
cd apps/api && go build ./cmd/cleanup-food-data/
```

**Step 3: Commit**

```bash
git add apps/api/cmd/cleanup-food-data/main.go
git commit -m "feat: add Phase 3 (vendor extraction) and Phase 4 (weight extraction)"
```

---

### Task 4: CLI tool — Phase 5 (normalize categories)

**Files:**
- Modify: `apps/api/cmd/cleanup-food-data/main.go`

**Phase 5 — Normalize categories:**

This is the biggest phase. Implement as a Go function that runs multiple SQL updates.

**5a: Map generic categories to "Прочее":**

```sql
UPDATE food_items SET category = 'Прочее'
WHERE category IN ('imported', 'Null', 'Undefined');
```

**5b: Map English categories to Russian (food_items):**

Define a Go map with the mappings from the design doc:

```go
var categoryMapEN = map[string]string{
    "Plant-based foods and beverages":      "Растительные продукты",
    "Snacks":                               "Снеки",
    "Dairies":                              "Молочные продукты",
    "Meats and their products":             "Мясо и мясные продукты",
    "Condiments":                           "Приправы и соусы",
    "Meals":                                "Готовые блюда",
    "Beverages and beverages preparations": "Напитки",
    "Seafood":                              "Морепродукты",
    "Beverages":                            "Напитки",
    "Desserts":                             "Десерты",
    "Dietary supplements":                  "БАД и спортпит",
    "Frozen foods":                         "Замороженные продукты",
    "Breakfasts":                           "Завтраки",
    "Sandwiches":                           "Сэндвичи",
    "Farming products":                     "Фермерские продукты",
    "Sweeteners":                           "Подсластители",
    "Canned foods":                         "Консервы",
    "Baby foods":                           "Детское питание",
    "Spreads":                              "Спреды и пасты",
    "Fats":                                 "Жиры и масла",
    "Cocoa and its products":               "Какао и шоколад",
    "Dried products":                       "Сушёные продукты",
    "Fish and meat and eggs":               "Рыба, мясо и яйца",
    "Meat alternatives":                    "Заменители мяса",
    "Entrees":                              "Основные блюда",
    "Cooking helpers":                      "Кулинарные добавки",
    "Salted-snacks":                        "Солёные снеки",
    "Toppings-ingredients":                 "Топпинги и ингредиенты",
    "Baking-decorations":                   "Для выпечки",
    "Appetizers-sides":                     "Закуски и гарниры",
    "Crêpes and galettes":                  "Блины и галеты",
    "Sweet pies":                           "Пироги",
    "Chips and fries":                      "Чипсы и картофель фри",
    "Food additives":                       "Пищевые добавки",
    "Baked-goods":                          "Выпечка",
    "Salads":                               "Салаты",
    "Festive foods":                        "Праздничная еда",
    "Syrups":                               "Сиропы",
    "Broths":                               "Бульоны",
    "Terrines":                             "Террины",
    "Pies":                                 "Пироги",
    "Specific products":                    "Специфические продукты",
    "Groceries":                            "Бакалея",
    "Meal kits":                            "Наборы для готовки",
}
```

Execute as parameterized updates in a loop:

```go
for en, ru := range categoryMapEN {
    tag, _ := conn.Exec(ctx, "UPDATE food_items SET category = $1 WHERE category = $2", ru, en)
    log.Printf("  %s → %s: %d rows", en, ru, tag.RowsAffected())
}
```

**5c: Clean language-prefixed categories:**

```sql
-- Strip ru: prefix, replace hyphens with spaces, capitalize
UPDATE food_items SET
    category = INITCAP(REPLACE(substring(category FROM 4), '-', ' '))
WHERE category ~ '^ru:';

-- Strip other language prefixes (fr:, es:, de:, it:, pt:, nl:, pl:, bg:, uk:)
UPDATE food_items SET
    category = REPLACE(substring(category FROM 4), '-', ' ')
WHERE category ~ '^(fr|es|de|it|pt|nl|pl|bg|uk):';
```

**5d: Normalize products table categories:**

```go
var categoryMapProducts = map[string]string{
    "supermarket":              "Прочее",
    "alcohol":                  "Алкоголь",
    "sladkoe-torty":            "Сладкое и торты",
    "bakaleya":                 "Бакалея",
    "molochnaya-produktsiya":   "Молочная продукция",
    "gotovaya-eda":             "Готовая еда",
    "zozh-fermerstvo":          "ЗОЖ и фермерство",
    "dlya-detey":               "Для детей",
    "voda-napitki":             "Вода и напитки",
    "myaso-ptitsa-kolbasy":     "Мясо, птица, колбасы",
    "tea-coffee-cocoa":         "Чай, кофе, какао",
    "ovoschi-frukty-griby":     "Овощи, фрукты, грибы",
    "fish-seafood-caviar":      "Рыба, морепродукты, икра",
    "freezing":                 "Заморозка",
    "sneki":                    "Снеки",
}
```

For products, categories are in a separate `categories` table referenced by `category_id`. Update the `categories.name` column directly:

```go
for translit, ru := range categoryMapProducts {
    tag, _ := conn.Exec(ctx, "UPDATE categories SET name = $1 WHERE name = $2", ru, translit)
    // ...
}
```

**5e: Handle "Ашан" as category in products:**

```sql
-- Set brand = 'Ашан' for products with Ашан category where brand is empty
UPDATE products p SET brand = 'Ашан'
FROM categories c
WHERE p.category_id = c.id AND c.name = 'Ашан' AND (p.brand IS NULL OR p.brand = '');

-- Rename category
UPDATE categories SET name = 'Прочее' WHERE name = 'Ашан';
```

**Step 2: Verify it compiles**

```bash
cd apps/api && go build ./cmd/cleanup-food-data/
```

**Step 3: Commit**

```bash
git add apps/api/cmd/cleanup-food-data/main.go
git commit -m "feat: add Phase 5 (category normalization) with EN→RU mapping"
```

---

### Task 5: CLI tool — Phase 6 (casing) + Phase 7 (dedup)

**Files:**
- Modify: `apps/api/cmd/cleanup-food-data/main.go`

**Phase 6 — Normalize ALL CAPS names:**

```sql
-- Title Case for ALL CAPS Latin names (food_items)
UPDATE food_items SET name = INITCAP(LOWER(name))
WHERE name = UPPER(name) AND name ~ '^[A-Z]' AND LENGTH(name) > 3;

-- Same for products
UPDATE products SET name = INITCAP(LOWER(name))
WHERE name = UPPER(name) AND name ~ '^[A-Z]' AND LENGTH(name) > 3;
```

**Phase 7 — Deduplicate:**

This is the most complex phase. Must handle FK constraints from `food_entries`.

```sql
-- Step 1: Find duplicates, rank by quality
-- Priority: has barcode > verified > more filled fields > newer
WITH ranked AS (
    SELECT id,
        LOWER(TRIM(name)) as norm_name,
        LOWER(TRIM(COALESCE(brand, ''))) as norm_brand,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(name)), LOWER(TRIM(COALESCE(brand, '')))
            ORDER BY
                (barcode IS NOT NULL)::int DESC,
                verified DESC,
                (calories_per_100 > 0)::int + (protein_per_100 > 0)::int +
                    (fat_per_100 > 0)::int + (carbs_per_100 > 0)::int DESC,
                created_at DESC
        ) as rn
    FROM food_items
)
-- Step 2: Reassign food_entries references from duplicates to the "winner"
-- This requires a temp mapping table

-- Create mapping: duplicate_id → winner_id
CREATE TEMP TABLE _dedup_map AS
WITH ranked AS (
    SELECT id,
        LOWER(TRIM(name)) as norm_name,
        LOWER(TRIM(COALESCE(brand, ''))) as norm_brand,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(name)), LOWER(TRIM(COALESCE(brand, '')))
            ORDER BY
                (barcode IS NOT NULL)::int DESC,
                verified DESC,
                (calories_per_100 > 0)::int + (protein_per_100 > 0)::int +
                    (fat_per_100 > 0)::int + (carbs_per_100 > 0)::int DESC,
                created_at DESC
        ) as rn
    FROM food_items
),
winners AS (
    SELECT id as winner_id, norm_name, norm_brand
    FROM ranked WHERE rn = 1
)
SELECT r.id as dup_id, w.winner_id
FROM ranked r
JOIN winners w ON r.norm_name = w.norm_name AND r.norm_brand = w.norm_brand
WHERE r.rn > 1;

-- Reassign food_entries
UPDATE food_entries fe SET food_id = dm.winner_id
FROM _dedup_map dm
WHERE fe.food_id = dm.dup_id;

-- Delete duplicates
DELETE FROM food_items WHERE id IN (SELECT dup_id FROM _dedup_map);

DROP TABLE _dedup_map;
```

Note: For `products` table, check if `food_entries` references products by integer ID. The FK relationship may be different — investigate before running.

**Step 2: Verify it compiles**

```bash
cd apps/api && go build ./cmd/cleanup-food-data/
```

**Step 3: Commit**

```bash
git add apps/api/cmd/cleanup-food-data/main.go
git commit -m "feat: add Phase 6 (casing) and Phase 7 (dedup)"
```

---

### Task 6: Backend — Return default_weight in API responses

**Files:**
- Modify: `apps/api/internal/modules/food-tracker/service.go` — SearchFoods and LookupBarcode to include default_weight
- Modify: `apps/api/internal/modules/food-tracker/types.go` — add fields to response types

**Step 1: Add fields to response types**

Check `types.go` for the food item response struct. Add:

```go
DefaultWeight     *float64 `json:"defaultWeight,omitempty"`
DefaultWeightUnit *string  `json:"defaultWeightUnit,omitempty"`
```

**Step 2: Update SearchFoods SQL**

In `service.go`, the `SearchFoods` UNION ALL query needs to include `default_weight` and `default_weight_unit` from both `food_items` and `products`.

**Step 3: Update LookupBarcode**

`LookupBarcode` and `getFoodByBarcode` should also return the new fields.

**Step 4: Run tests**

```bash
cd apps/api && go test ./internal/modules/food-tracker/ -v
```

Update test mocks to include the new columns in expected query results.

**Step 5: Commit**

```bash
git add apps/api/internal/modules/food-tracker/
git commit -m "feat: return default_weight in food search and barcode lookup API"
```

---

### Task 7: Frontend — Prefill portion amount from default_weight

**Files:**
- Modify: `apps/web/src/features/food-tracker/components/FoodEntryModal.tsx` — use defaultWeight for initial portion amount
- Modify: `apps/web/src/features/food-tracker/types/index.ts` — add defaultWeight to FoodItem type

**Step 1: Add type**

In the food item type definition, add:

```typescript
defaultWeight?: number;
defaultWeightUnit?: string;
```

**Step 2: Use defaultWeight in FoodEntryModal**

In `FoodEntryModal.tsx`, where food is selected (line ~219):

```typescript
// Current: setPortionAmount(food.servingSize || 100);
// New: prefer defaultWeight (package weight) over servingSize
setPortionAmount(food.defaultWeight || food.servingSize || 100);
```

And set portion type based on unit:

```typescript
if (food.defaultWeightUnit === 'мл') {
    setPortionType('milliliters');
} else {
    setPortionType('grams');
}
```

**Step 3: Verify lint and type-check pass**

```bash
cd apps/web && npm run lint && npm run type-check
```

**Step 4: Commit**

```bash
git add apps/web/src/features/food-tracker/
git commit -m "feat: prefill portion amount from product default_weight"
```

---

### Task 8: Run cleanup + migration against production DB

**Step 1: Run migration 019**

Use the same approach as previous migrations (via `run-openfoodfacts-migrations.go` pattern or direct psql).

**Step 2: Run cleanup tool**

```bash
cd apps/api && go run ./cmd/cleanup-food-data/ \
    --database-url "$DATABASE_URL"
```

Monitor output, verify phase counts are reasonable.

**Step 3: Verify data quality**

Run spot-check queries:
- `SELECT COUNT(*) FROM food_items WHERE calories_per_100 = 0 AND protein_per_100 = 0` — should be 0
- `SELECT category, COUNT(*) FROM food_items GROUP BY category ORDER BY cnt DESC LIMIT 20` — should show Russian categories
- `SELECT * FROM food_items WHERE default_weight IS NOT NULL LIMIT 10` — should have extracted weights
- `SELECT name FROM food_items WHERE name ~ '&quot;' LIMIT 1` — should return 0 rows

**Step 4: Commit any fixes**

If issues found during execution, fix and re-run affected phases using `--phase N`.
