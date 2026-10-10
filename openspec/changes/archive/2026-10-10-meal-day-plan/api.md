# Контракт API `meal-day-plan`

## Отклонения

Записаны бэкендом при реализации; всё ниже имеет приоритет над таблицами.

1. **Код `target_missing` объявлен в `apperrors/codes.go`.** Значит, тест
   `i18n.test.ts` («covers every code the API declares») требует перевода
   `target_missing` в `apps/web/src/shared/i18n/dictionaries/ru.ts`. Ответ:
   `409 {status: "error", code: "target_missing", message, params: {missing: ("profile"|"weight")[]}}`,
   `missing` — в порядке `profile`, `weight`.
2. **Все `422` — `code: "validation"`**, различаются только `message` (дата,
   граммы, рецепт недоступен, рецепт не подходит к приёму, неизвестный приём,
   приём не входит в план, у пустого приёма нечего менять). Отдельных кодов нет.
3. **`422` и у неизвестного `:mealType`** (не `404`), и у приёма, которого нет в
   `meal_types` этого плана. `PUT` пустого приёма (`empty`) без `recipe_id` —
   тоже `422`; с `recipe_id` — заполняет приём.
4. **Ручной вес** не округляется до 10 г: хранится как прислан, округлённым до
   целого грамма (`155` → `155`, `154.6` → `155`). Границы 0,5–2 порции к нему
   не применяются — только `1..2000`. Поэтому комментарий «кратно 10» у
   `PlanItem.grams` верен для подобранных блюд, не для `manual_grams: true`.
5. **`PUT` с `recipe_id`** сбрасывает ручной вес заменённого блюда (если в том же
   теле нет `grams`), а `locked` сохраняет. Порядок применения полей:
   `recipe_id` → `grams` → `reset_grams` → `locked`; затем веса незафиксированных
   блюд подгоняются под цель, сохранённую в плане (не под текущую — её
   применяет только пересборка).
6. **Пересборка** берёт текущие настройки приёмов, текущую цель (после неё
   `target_changed = false`) и новое зерно; закреплённые и ручные блюда остаются
   (ручные — с весом), если рецепт всё ещё доступен и подходит к приёму, иначе
   вытесняются. Ровно тот же набор блюд, что был до пересборки, проигрывает
   любому другому — «пересобрать» всегда даёт другой день, если другой есть.
   При отсутствии цели пересборка отвечает тем же `409 target_missing`.
7. **`GET`, `regenerate`, `alternatives`, `PUT` на дату без плана** сначала
   собирают план (как первое открытие), поэтому любой из них может ответить
   `409 target_missing`. `404` не бывает.
8. **`target_changed`** сравнивает цели, округлённые до целых (`target` в ответе
   тоже целые). Если текущую цель сейчас посчитать нельзя (например, удалён вес),
   `target_changed = false`, план показывается как есть.
9. **Числа.** `nutrition`, `totals`, `remaining`, `day_totals`, `delta` —
   округлены до 0,1; `percent_of_target` — целые; `calorie_split` — целые с
   суммой ровно 100 (метод наибольшего остатка), у пустого дня — `{0,0,0}`.
   `remaining` и `deviations` считаются от сохранённой цели плана.
10. **Окно дат** — ±30 дней от «сегодня» в часовом поясе клиента
    (`user_settings.timezone`, по умолчанию Москва) — так же, как дневник
    определяет дату. Неверный формат (`2026-10-1`, `2026-02-30`) — `422`.
11. **Альтернативы** — до 5 лучших среди **всех** доступных рецептов приёма
    (не только 12 отобранных для сборки), без текущего; меньше 5 — все, что
    есть (может быть 0, 1, 2). Порядок — от лучшей.
12. **`PUT /meal-plan-settings`** дубликаты убирает, порядок приводит к
    `breakfast, lunch, dinner, snack`. Сохранённые планы не трогает.

Обёртка ответов, коды ошибок и `snake_case` — как в `recipe-catalogue/api.md`.
Миграция — `093_meal_plans`. Все маршруты — `RequireRole("client")`, владелец из
сессии; в `protectedRoutes` — `owner`.

## Типы

```ts
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
interface Nutrition { kcal: number; protein: number; fat: number; carbs: number }

interface PlanItem {
  meal_type: MealType
  recipe_id: string
  recipe_version_id: string
  name: string
  photo_url: string | null
  grams: number                    // кратно 10
  portion_grams: number            // вес порции рецепта
  nutrition: Nutrition             // на вес grams
  percent_of_target: Nutrition     // целые проценты от цели дня
  locked: boolean
  manual_grams: boolean
  unavailable: boolean             // рецепт снят, скрыт или стал недоступен
}

interface EmptySlot { meal_type: MealType; reason: 'no_recipes' }

interface Deviation {              // только показатели вне допуска
  nutrient: 'kcal' | 'protein' | 'fat' | 'carbs'
  delta: number                    // >0 перебор, <0 недобор, в единицах показателя
}

interface MealPlan {
  date: string                     // YYYY-MM-DD
  meal_types: MealType[]           // выбранные приёмы на момент сборки
  target: Nutrition                // цель, под которую собран
  target_changed: boolean
  items: PlanItem[]                // в порядке breakfast, lunch, dinner, snack
  empty: EmptySlot[]
  totals: Nutrition
  percent_of_target: Nutrition     // итоги в процентах от цели
  remaining: Nutrition             // цель − итоги (может быть отрицательным)
  calorie_split: { protein: number; fat: number; carbs: number }  // % калорий, сумма 100
  deviations: Deviation[]
}

interface Alternative {
  recipe_id: string; name: string; photo_url: string | null
  grams: number; nutrition: Nutrition
  day_totals: Nutrition            // итоги дня, если выбрать эту альтернативу
}
```

## Маршруты

| Метод | Путь | Тело / параметры | Ответ |
|---|---|---|---|
| GET | `/api/v1/meal-plans/:date` | — | `MealPlan` (собирает при первом открытии); `409 {code: "target_missing", params: {missing: ["profile"\|"weight"]}}`; `422` дата вне окна ±30 дней или формат |
| POST | `/api/v1/meal-plans/:date/regenerate` | — | `MealPlan` |
| GET | `/api/v1/meal-plans/:date/items/:mealType/alternatives` | — | `{items: Alternative[]}` (3–5) |
| PUT | `/api/v1/meal-plans/:date/items/:mealType` | `{recipe_id?: string, grams?: number, locked?: boolean, reset_grams?: boolean}` | `MealPlan`; `422` grams ≤ 0 или > 2000, недоступный рецепт, рецепт не подходит к приёму |
| GET | `/api/v1/meal-plan-settings` | — | `{meal_types: MealType[]}` (по умолчанию все четыре) |
| PUT | `/api/v1/meal-plan-settings` | `{meal_types}` | то же; `422` пусто или неизвестное значение |

Смена настроек не трогает уже собранные планы; новые настройки применяются при
следующей сборке или пересборке.

## События аналитики (браузер)

`plan_generated`, `plan_regenerated`, `plan_item_replaced`, `plan_item_locked`,
`plan_grams_set`, `plan_off_target` — без свойств. Добавить в
`apps/api/internal/modules/analytics/dictionary.go`.
