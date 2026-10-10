# Контракт API `recipe-catalogue`

## Отклонения

Записаны бэкендом при реализации; всё ниже имеет приоритет над таблицами.

1. **Пагинация списков.** Параметры запроса — `page` (с 1) и `page_size`
   (по умолчанию 20, максимум 100), как в таблицах. Но ответ — обычная
   `response.Collection`: `{items, total, limit, offset}` (без `page`);
   `limit = page_size`, `offset = (page-1)*page_size`.
2. **Формат ошибок.** Все ошибки — `{status: "error", code, message, params?}`.
   - `422` неполного рецепта при отправке: `code: "validation"`,
     `params: {missing: string[]}`. Значения `missing`: `name`, `ingredients`,
     `steps`, `meal_types`, `ingredients.food_id` (есть ингредиент без
     подтверждённого продукта — импорт), `ingredients.grams` (у подтверждённого
     ингредиента не «по вкусу» нет веса — сохранять черновик так можно,
     отправлять нельзя). То же `422` возможно у одобрения с правкой.
   - Прочие `422` (несуществующий продукт, неизвестный аллерген, возврат без
     комментария, неверные поля версии): `code: "validation"`.
   - `502` (ВкусВилл недоступен или ответил ошибкой): `code: "internal"` —
     отдельного кода нет, отличать по HTTP-статусу `502`.
   - `409` (версия не в том состоянии): `code: "conflict"`.
   - `415` (фото не изображение): `code: "unsupported_media"`. HEIC — `400`.
   - `503` (способность выключена): `code: "feature_unavailable"`.
3. **Импорт по `sourceRef`.** У ВкусВилла нет получения рецепта по id, только
   поиск. Поэтому `GET .../import/vkusvill` кладёт найденные рецепты в кэш
   процесса на 30 минут, а `POST .../import/vkusvill/:sourceRef` берёт рецепт
   оттуда. Если в кэше его нет (рестарт, прошло время), сервер ищет заново по
   **`?q=`** — фронтенд всегда передаёт `?q=<название рецепта из выдачи>`.
   Не нашёлся ни там, ни там — `404`.
4. **Способность `recipe_import`** включена, когда задан `VKUSVILL_MCP_URL`
   (по умолчанию задан) **и** настроено хранилище контента (фото копируются к
   нам). Иначе поиск и импорт отвечают `503`. Загрузка фото
   (`POST /admin/recipes/photos`) без хранилища — тоже `503`.
5. **Правка версии на проверке.** `PUT /admin/recipes/:id/draft`, если рабочая
   версия в `review`, правит её и возвращает в `draft` — отправлять на проверку
   заново. Одобренная/заменённая версия напрямую не правится никогда: правка
   создаёт новую версию (`version + 1`).
6. **`food_id` во входе** — строка или число (`"123"`, `123` или UUID); в ответах
   всегда UUID `food_items`. Продукт из `user_foods` или `food_items` с
   `source = 'user'` ингредиентом/исключением быть не может — `422`.
7. **`candidates`** у ингредиента без `food_id` сохраняются при импорте и
   переживают `PUT .../draft`, пока ингредиент с тем же `source_name` не
   подтверждён.
8. **Клиентские маршруты** (`/recipes...`, `/food-restrictions`) требуют только
   входа, роль не проверяют: данные всегда — свои, выдача — доступное этому
   пользователю.
9. **`catalogue-search`** — `q` короче 2 символов даёт пустой `items`; не больше
   20 результатов.
10. **`PUT .../food-restrictions`** — `excluded_food_ids` в той же форме, что
    `food_id` (п. 6), в ответе — UUID. Отсутствующее поле = пустой список.
11. **`GET .../import/vkusvill`** — элемент выдачи дополнительно несёт
    `cook_minutes`, `complexity` и `ingredients_count` (для предпросмотра);
    `page` по умолчанию 1.
12. **`photo_key` рядом с каждым `photo_url`** — в `RecipeVersion`, в каждом
    `Step` и в `RecipeSummary`, чтобы редактор пересохранял без разбора URL.
    `photo_key` во входе принимается только с префиксом `recipes/` (иначе `422`).
    `photo_url` — `null`, если хранилище не настроено.
13. **Новый маршрут `GET /api/v1/curator/recipes?q=&page=&page_size=`**
    (`coordinator`) — `Collection<RecipeSummary>` опубликованных рецептов с
    одобренной версией, по одобренной версии; для выбора рецепта, который
    куратор скрывает от клиента.
14. **`GET /admin/recipes?state=`** — ровно `draft` | `review` (состояние рабочей
    версии) | `published` | `unpublished` (статус рецепта); пусто — все; иное —
    `422`. Элементы списка команды показывают новейшую версию (рабочую, если
    есть, иначе одобренную).
15. **`POST /curator/recipes/:id/approve`** — тело можно не слать или слать `{}`;
    `{version}` — правка-и-одобрение. `return` без `comment` или с пустым — `422`.

Все ответы — в обычной обёртке `response.Success` (`{status: "success", data}`);
ошибки — через принятый в проекте код ошибки. Поля JSON — `snake_case`.
Миграция — `092_recipe_catalogue`.

## Типы

```ts
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
type Complexity = 'easy' | 'medium' | 'hard'
type Allergen = 'nuts'|'peanuts'|'gluten'|'lactose'|'eggs'|'fish'|'seafood'|'soy'|'sesame'|'mustard'|'celery'
type VersionState = 'draft' | 'review' | 'approved' | 'superseded'

interface Nutrition { kcal: number; protein: number; fat: number; carbs: number }   // округление до 0.1

interface Ingredient {
  position: number
  food_id: string | null        // UUID food_items; null только в черновике импорта
  food_name: string | null      // название продукта каталога
  source_name: string | null    // исходное название (импорт)
  grams: number | null          // null у «по вкусу» и у неподтверждённых
  display_quantity: string | null
  to_taste: boolean
  candidates?: { food_id: string; name: string; default_weight: number | null }[]  // только в черновике импорта
}

interface Step { position: number; text: string; photo_url: string | null }

interface RecipeVersion {
  id: string; recipe_id: string; version: number; state: VersionState
  name: string; description: string; photo_url: string | null
  cook_minutes: number; complexity: Complexity; servings: number
  yield_grams: number | null; total_grams: number; portion_grams: number; approximate: boolean
  meal_types: MealType[]; tags: string[]; allergens: Allergen[]
  per_100g: Nutrition; per_portion: Nutrition
  ingredients: Ingredient[]; steps: Step[]
  review_comment: string | null; approved_at: string | null; created_at: string
}

interface RecipeSummary {          // элемент списков
  id: string; status: 'published' | 'unpublished'; source: 'manual' | 'vkusvill'
  name: string; photo_url: string | null; cook_minutes: number; complexity: Complexity
  meal_types: MealType[]; portion_grams: number; per_portion: Nutrition; approximate: boolean
  approved_version: number | null; working_state: 'draft' | 'review' | null   // для команды и куратора
}
```

Запрос на сохранение версии (`VersionInput`) — поля `RecipeVersion` без вычисляемых
(`id`, `state`, `total_grams`, `portion_grams`, `approximate`, `per_100g`,
`per_portion`, `approved_at`, `created_at`, `review_comment`); ингредиенты —
`{food_id (число products или UUID food_items) | null, source_name?, grams, display_quantity, to_taste}`,
шаги — `{text, photo_key | null}`, фото блюда — `photo_key`. Присланные поля КБЖУ игнорируются.

## Команда — `super_admin`

| Метод | Путь | Тело / параметры | Ответ |
|---|---|---|---|
| GET | `/api/v1/admin/recipes` | `?q=&state=&page=&page_size=` | `Collection<RecipeSummary>` |
| POST | `/api/v1/admin/recipes` | `VersionInput` | `201 {recipe: RecipeSummary, version: RecipeVersion}` |
| GET | `/api/v1/admin/recipes/:id` | — | `{recipe, approved: RecipeVersion \| null, working: RecipeVersion \| null}` |
| PUT | `/api/v1/admin/recipes/:id/draft` | `VersionInput` | `RecipeVersion` (правит рабочую версию или создаёт черновик от одобренной) |
| POST | `/api/v1/admin/recipes/:id/submit` | — | `RecipeVersion` (`review`); `422 {missing: string[]}` |
| POST | `/api/v1/admin/recipes/:id/unpublish` | — | `RecipeSummary` |
| POST | `/api/v1/admin/recipes/:id/publish` | — | `RecipeSummary` |
| POST | `/api/v1/admin/recipes/photos` | multipart `file` | `201 {photo_key, photo_url}`; `415` |
| GET | `/api/v1/admin/recipes/catalogue-search` | `?q=` | `{items: {food_id, name, kcal_100, protein_100, fat_100, carbs_100, default_weight}[]}` — без `user_foods` |
| GET | `/api/v1/admin/recipes/import/vkusvill` | `?q=&page=` | `{items: {source_ref, name, photo_url, portions, imported_recipe_id \| null}[], has_more}`; `502` |
| POST | `/api/v1/admin/recipes/import/vkusvill/:sourceRef` | — | `201 {recipe_id}` или `200 {recipe_id, existing: true}`; `502` |

## Куратор — `coordinator`

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/api/v1/curator/recipes/review` | `?page=` | `Collection<RecipeSummary>` (рабочая версия в `review`) |
| GET | `/api/v1/curator/recipes/:id` | — | `{recipe, approved, working}` |
| POST | `/api/v1/curator/recipes/:id/approve` | `{version: VersionInput}` необязательно | `RecipeVersion` (`approved`); `409`, если рабочая не в `review` |
| POST | `/api/v1/curator/recipes/:id/return` | `{comment}` | `RecipeVersion` (`draft`); `422` без комментария |
| GET | `/api/v1/curator/clients/:id/food-restrictions` | — | `FoodRestrictions` |
| PUT | `/api/v1/curator/clients/:id/food-restrictions` | `{allergens, excluded_food_ids}` | `FoodRestrictions` |
| GET | `/api/v1/curator/clients/:id/hidden-recipes` | — | `{items: RecipeSummary[]}` |
| PUT | `/api/v1/curator/clients/:id/hidden-recipes/:recipeId` | — | `204` |
| DELETE | `/api/v1/curator/clients/:id/hidden-recipes/:recipeId` | — | `204` |

## Клиент — `client`

| Метод | Путь | Тело / параметры | Ответ |
|---|---|---|---|
| GET | `/api/v1/recipes` | `?q=&meal_type=&page=&page_size=` | `Collection<RecipeSummary>` (только доступные) |
| GET | `/api/v1/recipes/:id` | — | `RecipeVersion` одобренная; `404`, если недоступен |
| POST | `/api/v1/recipes/:id/reject` | — | `204` |
| DELETE | `/api/v1/recipes/:id/reject` | — | `204` |
| GET | `/api/v1/food-restrictions` | — | `FoodRestrictions` |
| PUT | `/api/v1/food-restrictions` | `{allergens, excluded_food_ids}` | `FoodRestrictions`; `422` при неизвестном аллергене |

```ts
interface FoodRestrictions {
  allergens: Allergen[]
  excluded_foods: { food_id: string; name: string }[]
  rejected_recipes: { id: string; name: string }[]   // для клиента; у куратора пусто
  hidden_recipes?: { id: string; name: string }[]    // только в ответе куратору
}
```

## Защита в `protectedRoutes`

- `/admin/recipes/:id...`, `/curator/recipes/:id...` — `role` (каталог общий, не чей-то ресурс).
- `/curator/clients/:id/...` — `relationship`.
- `/recipes/:id`, `/recipes/:id/reject` — `owner` (данные клиента — только его отклонения; рецепт фильтруется доступностью).
