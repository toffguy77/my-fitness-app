## 1. Схема

- [x] 1.1 Сверить свободный номер миграции. Проверка: номер записан в PR.
  — 094: свободен в `apps/api/migrations` и во всех локальных и удалённых ветках (`git ls-tree` по всем refs). `schema_migrations` dev/прода не сверялась — сверить перед слиянием.
- [x] 1.2 Миграция: `food_items.source` допускает `recipe`; `meal_plan_items.food_entry_id` с `ON DELETE SET NULL`; продукты для уже одобренных версий. Проверка: up/down на `burcev-itest`, повторный up идемпотентен.
  — `TestMigration094UpIsRepeatableAndDownReverts`, `TestMigration094DownKeepsEatenProducts` (`mealplan/diary_integration_test.go`); ограничение снимается по определению, не по имени; `schema.golden` обновлён.

## 2. Продукт версии

- [x] 2.1 Создание продукта при одобрении в той же транзакции, детерминированный UUID. Проверка: тесты «Одобрение создаёт продукт», «Новая версия не меняет старые записи».
  — `TestApprovalCreatesProduct`, `TestNewVersionKeepsOldEntries`; id — `recipe_product_id(version)` (api.md, отклонение 1).

## 3. Запись из плана

- [x] 3.1 `POST .../items/:mealType/eat` с блокировкой строки и возвратом существующей записи. Проверка: интеграционные тесты на настоящей базе «Запись с весом плана», «Запись с поправленным весом», «Двойное нажатие» (включая два параллельных запроса), «Пустой приём пищи».
  — `TestEatWithPlanWeight` (КБЖУ сверены с ручной записью того же продукта), `TestEatWithCorrectedWeight`, `TestEatTwice`, `TestConcurrentEats` (8 параллельных → 1 запись), `TestEatEmptyMeal`; блокируется строка плана (отклонение 6).
- [x] 3.2 Чтение плана без сборки, съеденный вес из записи, связь только при совпадении даты и приёма пищи. Проверка: тесты «Плана нет», «Правка веса в дневнике», «Удаление из дневника», «Запись перенесена в другой приём пищи».
  — `TestFindDoesNotAssemble`, `TestHandlerReadWithoutGenerating` (204), `TestEditedWeightReflected` (КБЖУ и проценты блюда по весу записи), `TestDeletedEntryUneats`, `TestMovedEntryUneats` (приём и дата).
- [x] 3.3 Подгонка остатка и запрет замены съеденного. Проверка: тесты «Подгонка после переедания», «Запись не двигает план», «Замена съеденного».
  — `TestRefitAfterOvereating` (вкл. «не двигает»), `TestEatenDishIsAFact` (409; связь переживает правку другого блюда), `TestRegenerateKeepsEaten`.
- [x] 3.4 Маршруты, `protectedRoutes`, `routes.golden`. Проверка: `go test ./internal/router/`.
  — оба POST — `owner`; diff `routes.golden` — две строки; `go test ./internal/router/` (и с `-tags=integration`) зелёный.

## 4. Поиск

- [x] 4.1 `SearchFoods`: исключить продукты рецептов из общей ветки, добавить ветку доступных рецептов. Проверка: интеграционные тесты «Доступный рецепт», «Скрытый рецепт», «Устаревшая версия»; существующие тесты поиска зелёные.
  — `TestSearchFindsAvailableRecipe`, `TestSearchHidesUnavailableRecipes` (скрыт куратором, аллерген, снят с публикации), `TestSearchShowsOnlyCurrentVersion`, `TestRecipeProductIsNotAnIngredient`; мутация (убрать исключение из общей ветки) роняет три теста. Существующие тесты food-tracker зелёные; в sqlmock-тестах `SearchFoods` добавлен столбец `recipe_id` в форму строки.

## 5. Фронтенд

- [x] 5.1 «Съел», правка веса, состояние «съедено», «Подогнать остаток» в плане. Проверка: Jest + RTL.
  *Сделано:* `MealSlotCard` — «Съел» (вес плана) и «Другой вес» (поле, 1–2000 г); съеденное — «Съедено», вес из записи, без веса/замены/закрепления; «Подогнать остаток» в `DayTotals`, только при съеденном. Время записи шлётся только для сегодняшней даты. Тесты: `meal-plan/components/__tests__/PlanEaten.test.tsx` (9).
- [x] 5.2 Блок «По плану» в приёмах пищи дневника. Проверка: Jest + RTL, тесты «Есть план», «Съеденное не дублируется».
  *Сделано:* `useDiaryPlan` (только `?generate=false`, вне окна ±30 дней — без запроса, ошибки молча), план перечитывается при смене записей дневника (удаление возвращает блюдо); «+» → `eat`, затем `fetchDayData`. Тесты: `food-tracker/components/__tests__/DietTab.planned.test.tsx` (8: «Есть план», «Плана нет» без собирающего GET, «Съеденное не дублируется», «+», удаление).
- [x] 5.3 Пометка «рецепт» в поиске дневника. Проверка: Jest + RTL.
  *Сделано:* `FoodSource` += `recipe`, `FoodItem.recipeId`; пометка и ссылка на `/menu/recipes/[id]` (щелчок и Enter по ссылке блюдо не выбирают). Тесты: `SearchTab.recipe.test.tsx` (4), сторож имён против Go — `food-tracker/types/__tests__/recipeFields.test.ts`.
- [x] 5.4 События `plan_item_eaten`, `plan_refit`, `recipe_logged_from_search`. Проверка: Jest на отправку; события на dev в `analytics_events`. **События на dev 2026-10-10: plan_item_eaten {source: plan} и {source: diary}, plan_refit, recipe_logged_from_search.**
  — бэкенд: объявлены в `analytics/dictionary.go` (`plan_item_eaten.source` обязательное, `plan|diary`). Фронтенд и dev — открыто.
  *Сделано на клиенте:* события в `events.ts`, отправка проверена Jest (`PlanEaten`, `DietTab.planned`, `FoodEntryModal.branches`, `planEvents`); словарь сверен (`shared/analytics/__tests__/planEvents.test.ts`, check-codebase-integrity). Остаётся: проверка на dev в `analytics_events` после выкатки.
- [x] 5.5 Lint, type-check, все статические проверки из корня. Проверка: зелёные.
  *Сделано:* `npm run lint`, `type-check`, полный Jest (5323 зелёных, пороги покрытия держатся), восемь проверок из `scripts/` — зелёные.

## 6. E2E и документация

- [x] 6.1 Playwright `e2e/tests/plan-diary-logging.spec.ts`: план с блюдами → «Съел» обед → запись в дневнике в обеде с весом плана → в дневнике под ужином «По плану» → «+» → запись → удаление обеда из дневника → обед в плане снова несъеденный → поиск находит рецепт с пометкой. Проверка: локально через `:3070` и в CI. **Спек в CI (вручную запущенный e2e.yml) зелёный на PR #238.**
  *Локально пройдено* (своя база в `burcev-itest`, прод-сборка web, прокси 3070, `--workers=1`): вместе с `meal-day-plan` и пятью спеками дневника — 19 из 19. Остаётся CI.
- [x] 6.2 `docs/user-guide/02-ведение-дневника-питания.md` — запись из плана; `make sync-knowledge`. Проверка: `TestKnowledgeMatchesUserGuide`.
- [x] 6.3 Слить в `dev` и пройти сценарий на new.burcev.team. Проверка: ручной проход, логи API без ошибок. **Пройдено на dev 2026-10-10: «Съел» (201, повтор — та же запись), замена съеденного — 409, «По плану» в дневнике, «+», удаление записи возвращает блюдо, подгонка остатка, рецепт из поиска дневника; ошибок API нет.**
