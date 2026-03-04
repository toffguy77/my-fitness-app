# User Foods: Manual Entry & Search Integration

## Context

Food tracker currently supports search across 3M+ products (food_items + legacy products tables) and barcode lookup with OpenFoodFacts fallback. Users cannot add custom foods. Types `UserFood` and `CreateUserFoodRequest` exist in `types.go` but have no implementation.

## Goals

- Manual food entry with per-user storage for reuse
- Clone & customize products from the global database
- Integrate user foods into search with priority ordering
- Fallback: show other users' foods when global search returns nothing

## Database

**New table `user_foods`:**

```sql
CREATE TABLE user_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(255),
    calories_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    protein_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    fat_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    carbs_per_100 NUMERIC(8,2) NOT NULL DEFAULT 0,
    serving_size NUMERIC(8,2) NOT NULL DEFAULT 100,
    serving_unit VARCHAR(50) NOT NULL DEFAULT 'г',
    source_food_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_foods_user_id ON user_foods(user_id);
CREATE INDEX idx_user_foods_name_fts ON user_foods
    USING gin(to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(brand, '')));
```

- `brand` — optional, copied from original on clone
- `source_food_id` — optional reference to cloned food_items row (informational, not FK)
- GIN index with Russian morphology — same pattern as food_items
- No barcode, fiber, sugar, sodium — YAGNI, can add later

## API

### New Endpoints

```
POST   /api/v1/food-tracker/user-foods        — create (manual entry)
POST   /api/v1/food-tracker/user-foods/clone   — clone from global DB
GET    /api/v1/food-tracker/user-foods         — list own foods
PUT    /api/v1/food-tracker/user-foods/:id     — update
DELETE /api/v1/food-tracker/user-foods/:id     — delete
```

**Create (manual):**
```json
{
    "name": "Бабушкины блины",
    "calories_per_100": 230,
    "protein_per_100": 8.5,
    "fat_per_100": 10.2,
    "carbs_per_100": 27.0
}
```

**Clone:**
```json
{
    "source_food_id": "uuid-from-food_items",
    "name": "Молоко домашнее",
    "calories_per_100": 64,
    "protein_per_100": 3.2,
    "fat_per_100": 3.6,
    "carbs_per_100": 4.8
}
```
Backend copies `brand` from original, stores `source_food_id`.

### Search Changes

`GET /api/v1/food-tracker/search?q=...` — same interface, updated internals.

**Step 1 — main query (single SQL):**
```
(user_foods WHERE user_id = $current, source_priority = -1)
UNION ALL
(products, source_priority = 1..2)
UNION ALL
(food_items, source_priority = 0..2)
```

Own user foods always on top, then verified, then rest.

**Step 2 — fallback (only if step 1 returned 0 results):**
```sql
SELECT ... FROM user_foods
WHERE user_id != $current
  AND to_tsvector('russian', ...) @@ plainto_tsquery('russian', $query)
ORDER BY rank DESC
LIMIT $limit
```

Separate query (not UNION) because:
- Doesn't slow down main search (99% of cases fallback not needed)
- Marked with `source: 'user'`, `user_id` not exposed

**Signature change:** `SearchFoods(ctx, userID, query, limit, offset)` — userID from JWT middleware.

**Result priority:** own user_foods → verified → database → openfoodfacts → other users' user_foods

## Frontend

### New tab "Ручной ввод" in FoodEntryModal

Tabs: `search | barcode | manual | photo | chat`

**ManualEntryTab** form:
- Name (text, required)
- Calories per 100g (number, required)
- Protein, Fat, Carbs per 100g (numbers, default 0)
- Button "Сохранить и добавить" — creates user_food, then opens portion selector

### "Сохранить как свой" button on product card

In SearchTab, when viewing product details / portion selector — "Сохранить как свой" button:
- `POST /user-foods/clone` with product data
- Toast "Продукт сохранён"
- Product appears in future searches with priority

### Search result badges

- Own user foods — no badge (just higher in results)
- Other users' foods — small gray "от пользователя" label

### Edit/delete own foods

Edit/delete icons on search result card when `source === 'user'` and user owns it. No separate management page.

## Out of Scope

- Separate user foods management page
- Extended nutrients (fiber, sugar, sodium) in user_foods
- Curator moderation / verification
- Barcode for user foods
