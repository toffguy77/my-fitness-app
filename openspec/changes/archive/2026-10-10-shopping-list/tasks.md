## 1. Сборка списка

- [x] 1.1 Чтение планов, блюд, ингредиентов и продуктов за диапазон без сборки планов. Проверка: интеграционный тест «День без плана» на настоящей базе.
  *Сделано:* `mealplan/shopping.go` — один запрос по `meal_plans`/`meal_plan_items`/`recipe_ingredients`/`food_items` (+ `categories` для номера категории), планы только читаются. `TestShoppingListAddsUpPlansWithoutBuildingThem` (13 октября без плана остаётся без плана), `TestShoppingListIsTheCallersOwn` — на настоящей базе (`-tags=integration`).
- [x] 1.2 Пересчёт под вес порции и сложение. Проверка: тесты «Пересчёт под вес порции», «Сложение из разных блюд», «Изменение плана».
  *Сделано:* множитель = вес блюда в плане ÷ `total_grams` версии (у приблизительной это сумма ингредиентов — `recipes.ComputeNutrition`). `TestShoppingScalesToPlannedWeight`, `TestShoppingAddsUpTheSameProduct`, `TestShoppingListFollowsThePlan` (замена через `UpdateItem`) и сумма 200 + 300 = 500 г в интеграционном.
- [x] 1.3 Количества и штуки. Проверка: тесты «Округление», «Крупное округление», «Штуки».
  *Сделано:* `TestShoppingRoundsUp` (123 → 130, 612 → 650, 340/1020 × 600 → 200), `TestShoppingPieces` («4 шт. (≈220 г)»), `TestCountedInPieces`; штуки и в интеграционном.
- [x] 1.4 Отделы. Проверка: тесты «Известная категория», «Неизвестная категория»; доля «Прочего» на выборке категорий каталога ниже 30%.
  *Сделано:* `mealplan/departments.go`. `TestDepartmentOf` (известная/неизвестная), `TestDepartmentsCoverTheCatalogue` на снимке 338 категорий `categories` с dev: «Прочее» 27,1%. Номер категории → название — интеграционный тест.
- [x] 1.5 «По вкусу». Проверка: тест «Соль в нескольких блюдах».
  *Сделано:* `TestShoppingToTaste` (соль трижды → одна строка, «по вкусу» поглощается весом), соль в трёх блюдах — и в интеграционном.

## 2. Маршрут

- [x] 2.1 `GET /api/v1/shopping-list` под `RequireRole("client")`, проверка диапазона, значение по умолчанию, `has_plans`; `routes.golden`. Проверка: тесты «Слишком длинный диапазон», «Конец раньше начала», «Куратор», «Пустой диапазон»; `go test ./internal/router/`.
  *Сделано:* `router/mealplan.go`, `routes.golden` (+1 строка `GET /api/v1/shopping-list`, без id — в `protectedRoutes` не нужен). `TestShoppingListRangeValidation` (20, 15 дней, конец раньше, один параметр, формат → 422; ровно 14 — 200), `TestShoppingListDefaultRange`, `TestOnlyClientHasMealPlan` (куратор и команда → 403, без входа → 401), `TestHandlerShoppingList`.

## 3. Фронтенд

- [x] 3.1 `/menu/shopping`, `ShoppingList`: выбор дат, отделы, отметки в `localStorage`, вход из плана. Проверка: Jest + RTL, тест «Отметка переживает перезагрузку».
  *Сделано:* `app/menu/shopping/page.tsx`, `ShoppingList.tsx`, ссылка «Список покупок» в `DayPlanView`. Jest: «Отметка переживает перезагрузку», снятие/замена отметки, чужой диапазон, пустой диапазон, смена дат, `adjustRange`; сторож полей `goFields.test.ts` (+3 типа).
- [x] 3.2 `formatShoppingList`, «Скопировать» и «Поделиться» без отмеченных строк, запасное копирование. Проверка: Jest — тест «Текст списка»; RTL с подменой `navigator.share` и `navigator.clipboard`.
  *Сделано:* `utils/shoppingText.ts` — «Текст списка», исключение отмеченных, форматы диапазона; RTL с подменой `navigator.clipboard`/`navigator.share`: копирование, отказ буфера, «Поделиться», запасное копирование, отмена, сбой.
- [x] 3.3 События `shopping_list_opened`, `shopping_list_shared`. Проверка: Jest на отправку; события на dev в `analytics_events`.
  *Сделано:* события в `dictionary.go` (с перечнями значений) и `events.ts`; Jest проверяет отправку `{days}` и `{method}`; `check-codebase-integrity` сверяет вызовы со словарём. На dev — вместе с 4.3.
- [x] 3.4 Lint, type-check, все статические проверки из корня. Проверка: зелёные.
  *Сделано:* `npm run lint`, `type-check` — чисто; Jest целиком 424 набора / 5326 тестов, пороги покрытия пройдены; восемь статических проверок из корня — OK.

## 4. E2E и документация

- [x] 4.1 Playwright `e2e/tests/shopping-list.spec.ts`: планы на два дня с общим продуктом → список за оба дня → одна строка с суммой → отметка «купил» переживает перезагрузку → «Скопировать» кладёт текст в буфер. Проверка: локально через `:3070` и в CI.
  *Сделано:* `e2e/tests/shopping-list.spec.ts`, в проекте `auth-tests`. Локально (своя база, seed-e2e, production-сборка, прокси 3070, `--workers=1`) — прошёл вместе с `meal-day-plan.spec.ts`: 2 из 2. В CI — после слияния.
- [x] 4.2 `docs/user-guide/` — список покупок; `make sync-knowledge`. Проверка: `TestKnowledgeMatchesUserGuide`.
  *Сделано:* раздел «Список покупок» в `10-меню-и-рецепты.md`, `make sync-knowledge`, `go test ./internal/modules/support/` — зелёный.
- [x] 4.3 Слить в `dev` и пройти сценарий на new.burcev.team. Проверка: ручной проход, логи API без ошибок. **Пройдено на dev 2026-10-10: граммы сходятся с ручным расчётом, «Скопировать» кладёт текст, события shopping_list_opened/shared пришли. Найдено и исправлено: продукты уходили в «Прочее» из-за категорий-магазинов — отдел по названию (PR #244).**
