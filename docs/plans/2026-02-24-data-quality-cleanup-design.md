# Data Quality Cleanup Design

## Goal

Improve quality of food product data across `food_items` (2.28M records) and `products` (105K records) tables: remove garbage, normalize names/categories, extract structured data from free-text fields, deduplicate.

## Architecture

Go CLI tool (`cmd/cleanup-food-data/`) executes 7 phases of SQL-based cleanup against the production database. Each phase logs affected row counts. Schema changes delivered as numbered SQL migrations.

## Schema Changes

Add to both `food_items` and `products`:

- `default_weight DECIMAL(10,2)` -- extracted package/serving weight from product name
- `default_weight_unit TEXT DEFAULT 'г'` -- unit (г, мл)

Frontend change: when user selects a product in food tracker, prefill weight with `default_weight` if non-null (instead of always defaulting to 100г).

## Cleanup Phases

### Phase 1: Delete garbage rows

- `food_items` with zero КБЖУ (~33,693 rows)
- `products` with zero КБЖУ (~13,789 rows)
- `food_items` with name < 3 characters (~560 rows)
- `food_items` with absurd values: calories > 1000/100g, protein > 100g, fat > 100g (~estimate TBD)

### Phase 2: Clean names and brands

- Decode HTML entities: `&quot;` → `"`, `&gt;` → `>`, `&amp;` → `&`, `&lt;` → `<`, `&#NNN;` → char
- Collapse multiple spaces to single space
- Trim leading/trailing whitespace
- Remove `*` characters
- Apply to both `name` and `brand` columns in both tables

### Phase 3: Extract vendor from names

Patterns: `[Ашан]`, `[Макдоналдс]`, `(Ашан)` in product names.

- Extract bracketed text → set as `brand` (if brand is empty)
- Remove bracketed text from `name`
- Known store/vendor list: Ашан, Магнит, Перекрёсток, Лента, Пятёрочка, ВкусВилл, Глобус, Дикси, Окей, СПАР, Макдоналдс, KFC, Ростик's

### Phase 4: Extract weight from names

Patterns: `150 г`, `150г`, `200 гр`, `400 мл`, `0,5 л`, `1.5 кг`, `порция 100 гр`.

- Extract numeric value → `default_weight` (normalize: кг×1000→г, л×1000→мл)
- Extract unit → `default_weight_unit` (г or мл)
- Remove weight substring from `name`
- Apply to both tables

### Phase 5: Normalize categories

**food_items:**

1. `"imported"`, `"Null"`, `"Undefined"` → `"Прочее"` (1.2M rows)
2. Top ~30 English categories → Russian mapping:
   - Plant-based foods and beverages → Растительные продукты
   - Snacks → Снеки
   - Dairies → Молочные продукты
   - Meats and their products → Мясо и мясные продукты
   - Condiments → Приправы и соусы
   - Meals → Готовые блюда
   - Beverages and beverages preparations → Напитки
   - Seafood → Морепродукты
   - Desserts → Десерты
   - Dietary supplements → БАД и спортпит
   - Frozen foods → Замороженные продукты
   - Breakfasts → Завтраки
   - Sandwiches → Сэндвичи
   - Farming products → Фермерские продукты
   - Sweeteners → Подсластители
   - Canned foods → Консервы
   - Baby foods → Детское питание
   - Spreads → Спреды и пасты
   - Fats → Жиры и масла
   - Cocoa and its products → Какао и шоколад
   - Dried products → Сушёные продукты
   - Beverages → Напитки
   - Fish and meat and eggs → Рыба, мясо и яйца
   - Meat alternatives → Заменители мяса
   - Entrees → Основные блюда
   - Cooking helpers → Кулинарные добавки
   - Salted-snacks → Солёные снеки
   - Toppings-ingredients → Топпинги и ингредиенты
   - Baking-decorations → Для выпечки
   - Appetizers-sides → Закуски и гарниры
3. `ru:` prefix → strip, replace hyphens with spaces, capitalize first letter
4. Other language prefixes (`fr:`, `es:`, `de:`, etc.) → strip prefix, replace hyphens with spaces
5. `"Null"` category → `"Прочее"`

**products:**

1. Transliterated categories → Russian:
   - supermarket → Прочее
   - alcohol → Алкоголь
   - sladkoe-torty → Сладкое и торты
   - bakaleya → Бакалея
   - molochnaya-produktsiya → Молочная продукция
   - gotovaya-eda → Готовая еда
   - zozh-fermerstvo → ЗОЖ и фермерство
   - dlya-detey → Для детей
   - voda-napitki → Вода и напитки
   - myaso-ptitsa-kolbasy → Мясо, птица, колбасы
   - tea-coffee-cocoa → Чай, кофе, какао
   - ovoschi-frukty-griby → Овощи, фрукты, грибы
   - fish-seafood-caviar → Рыба, морепродукты, икра
   - freezing → Заморозка
   - sneki → Снеки
2. "Ашан" as category → `"Прочее"`, set brand = "Ашан" where brand is empty

### Phase 6: Normalize casing

- ALL CAPS Latin names → Title Case (only if entire name is uppercase)
- Apply to both tables

### Phase 7: Deduplicate

- Group by `LOWER(TRIM(name)) + LOWER(TRIM(COALESCE(brand, '')))` within each table
- Keep the "best" record: has barcode > verified > most filled fields
- Update `food_entries.food_id` references before deleting duplicates
- Apply to both tables separately

## Additional Quality Flags

- Mark `products` records as `verified = true` (legacy curated data) — requires adding `verified` column to products table

## Implementation

Single Go CLI tool: `apps/api/cmd/cleanup-food-data/main.go`

- Connects to DB via pgx
- Runs phases sequentially with logging
- Reports affected row counts per phase
- `--dry-run` flag for safe preview
- `--phase N` flag to run specific phase only (for re-runs)

Frontend: modify food tracker entry form to use `default_weight` as initial value.
