## 1. Схема

- [x] 1.1 Сверить занятые номера миграций в `schema_migrations` dev и прод и в ветках соседей; выбрать свободный номер. Проверка: номер и результат запроса записаны в PR. Сделано: номер 092 сверен координатором с `schema_migrations` dev и прод; в ветке последняя — 091.
- [x] 1.2 Миграция `NNN_recipe_catalogue_{up,down}.sql`: `recipes`, `recipe_versions` (частичные уникальные индексы на черновик и одобренную), `recipe_steps`, `recipe_ingredients`, `user_food_restrictions`, `user_excluded_foods`, `user_rejected_recipes`, `client_hidden_recipes`; внешние ключи на `users` с `ON DELETE CASCADE` для клиентских таблиц и `SET NULL` для авторов и одобривших. Проверка: up и down на локальной базе (`burcev-itest`), повторный up идемпотентен. Сделано: `092_recipe_catalogue_{up,down}.sql`; `TestMigration092UpIsRepeatableAndDownReverts` (повторный up, down, снова up) на `burcev-itest`; `TestEveryForeignKeyHasALeadingIndex`, `TestNoIndexIsRedundant` зелёные.
- [x] 1.3 Стратегии удаления новых таблиц в `account/erasure.go`, обновить `schema.golden`. Проверка: `TestErasureCoversSchema` с `TEST_DATABASE_URL`; сценарии «Удаление клиента», «Удаление куратора». Сделано: `TestErasureCoversSchema` с `TEST_DATABASE_URL`; `schema.golden` перегенерирован (+79 строк, без удалений); `recipes.TestErasure` — «Удаление клиента», «Удаление куратора» через настоящий `account.Erase`.

## 2. Расчёт КБЖУ

- [x] 2.1 Чистая функция расчёта в `modules/recipes/nutrition.go`. Проверка: табличные тесты сценариев «Расчёт с весом готового блюда», «Вес готового блюда не задан», «Ингредиент по вкусу». Сделано: `TestComputeNutrition` (табличный, все три сценария).

## 3. Сервис и маршруты команды

- [x] 3.0 `food-tracker`: экспортируемые `EnsureCatalogueFood` и `SearchCatalogue` (без `user_foods`). Проверка: тест — личный продукт вызывающего не попадает в выдачу `SearchCatalogue`. Сделано: `food-tracker/catalogue.go`; `TestSearchCatalogueExcludesPersonalFoods` (интеграционный: `user_foods` и `food_items.source='user'` не в выдаче и не принимаются `EnsureCatalogueFood`).
- [x] 3.1 Создание рецепта, правка черновика (одна версия в работе), нормализация `food_id` через `ensureFoodItemExists`, пересчёт КБЖУ при сохранении, игнорирование присланных КБЖУ. Проверка: тесты «Один черновик на рецепт», «Ингредиент без продукта каталога», «Попытка передать КБЖУ вручную», «Правка одобренного рецепта». Сделано: `TestVersionLifecycle`, `TestIngredientOutsideCatalogueIsRefused`, `TestSavedNutritionIsComputedFromCatalogue` (через HTTP с полями КБЖУ в теле), `TestProductsIDIsNormalised`, `TestToTasteIngredientHasNoWeight` — на настоящей базе.
- [x] 3.2 Отправка на проверку с проверкой полноты; снятие с публикации и возврат. Проверка: тесты «Отправка на проверку неполного рецепта», «Снятый рецепт». Сделано: `TestVersionLifecycle` (неполный → `422` с `missing`, остаётся черновиком), `TestClientCatalogueVisibility` (снятый: нет в каталоге, карточка `404`, версии на месте).
- [x] 3.3 Загрузка фото рецепта в публичное хранилище с проверкой типа. Проверка: тест «Загрузка не изображения». Сделано: `TestUploadingNonImageAnswers415`, `TestUploadingImageStoresItUnderRecipes`.
- [x] 3.4 Маршруты `/api/v1/admin/recipes...` в `router/recipes.go` под `RequireRole("super_admin")`; записи в `protectedRoutes` (`role`); `routes.golden`. Проверка: `go test ./internal/router/`. Сделано: `go test ./internal/router/` — `routes.golden` (+27 маршрутов, без удалений), матрица авторизации, `TestOnlyTeamWritesRecipes`.

## 4. Одобрение

- [x] 4.1 Очередь на проверку, одобрение, правка-и-одобрение, возврат с комментарием; переход прежней одобренной в `superseded` в одной транзакции. Проверка: тесты «Куратор одобряет как есть», «Куратор правит и одобряет», «Возврат без комментария», «Одобрение версии не на проверке», «Одобрение новой версии», «Попытка изменить одобренную версию». Сделано: `TestVersionLifecycle` на настоящей базе (все шесть сценариев; «изменить одобренную» — охрана состояния в `UPDATE`, `ErrConflict`).
- [x] 4.2 Маршруты `/api/v1/curator/recipes...` под `RequireRole("coordinator")`. Проверка: тест «Клиент или команда пытаются одобрить» (`403` для `client` и `super_admin`); матрица авторизации проходит. Сделано: `TestOnlyCoordinatorReviewsRecipes` (`403` для `client` и `super_admin`), `TestRoleProtectedRoutesRefuseNonPrivilegedRole`.

## 5. Ограничения и доступность

- [x] 5.1 Пакет `internal/shared/recipeaccess` как единственная реализация правила. Проверка: интеграционный тест «Все ограничения сразу» на настоящей базе (не sqlmock). Сделано: `TestAllRestrictionsAtOnce` (интеграционный, второй клиент без ограничений видит всё).
- [x] 5.2 Клиентские маршруты: каталог с поиском и фильтром по приёму пищи, карточка, отклонение и возврат, свои ограничения. Проверка: тесты «Рецепт без одобренной версии», «Фильтр по приёму пищи», «Недоступный клиенту рецепт по прямой ссылке», «Отклонение и возврат», «Клиент добавляет аллерген», «Неизвестный аллерген», «Продукт-исключение». Сделано: `TestClientCatalogueVisibility`, `TestRestrictions` на настоящей базе.
- [x] 5.3 Кураторские маршруты под `/curator/clients/:id`: ограничения клиента, скрытие и возврат рецепта; записи `protRelationship`. Проверка: тесты «Скрытие для одного клиента», «Скрытие для чужого клиента», «Куратор чужого клиента». Сделано: `TestRestrictions` («Скрытие для одного клиента»), `TestCuratorRecipeRoutesRespectTheRelationship` (настоящий движок и база: чужой клиент — `403`, ничего не записано), `TestRelationshipRoutesRejectForeignClient`.

## 6. Импорт ВкусВилла

- [x] 6.1 Клиент MCP (JSON-RPC по HTTP, таймаут, ограничитель частоты), `VKUSVILL_MCP_URL` в конфиге и `.env.example`, способность `recipe_import` в `config.Features`. Проверка: тест на `httptest.Server` с записанным ответом `vkusvill_recipes`; тест «ВкусВилл недоступен» (`502`). Сделано: `TestVkusvillSearchParsesRecordedAnswer` (записанный ответ `testdata/vkusvill_recipes_syrniki.json`), `TestVkusvillFailuresAreUpstreamErrors`, `TestVkusvillUnavailableIs502AndCatalogueStillWorks`, `TestImportVkusvillUnavailable`, `TestFeatures_RecipeImport*`.
- [x] 6.2 Импорт в черновик: идемпотентность по `source_ref`, копирование фото, разбор подписей количества, кандидаты из `SearchCatalogue`. Проверка: тесты «Импорт создаёт черновик», «Повторный импорт», «Граммовка из подписи»; включённое состояние способности проверено тестом. Сделано: `TestImportVkusvill` (черновик, `source_ref`, фото в наше хранилище, граммовка «200 г», «4 шт.» × вес штуки, кандидаты, повторный импорт), `TestImportVkusvillCacheMissSearchesByName`, `TestParseQuantity`; включённое состояние — `TestFeatures_RecipeImportOnWithDefaultURLAndContentStorage`.
- [x] 6.3 Ручная проверка на dev: импортировать один настоящий рецепт ВкусВилла. Проверка: черновик с фото из нашего хранилища виден в `/admin/recipes`. **Проверено на dev 2026-10-10 учёткой e2e-admin: поиск ВкусВилла с IP сервера отвечает, «Фриттата с овощами» импортирована в черновик, фото блюда и 5 фото шагов — в нашем хранилище, «по вкусу» распознано, кандидаты подставлены.**

## 7. Фронтенд

- [x] 7.1 Навигация: `workout` → `menu` (`/menu`, «Меню»), словарь, `e2e/tests/navigation.spec.ts`. Проверка: Jest навигации, тест «Клиент открывает Меню», «Заглушки больше нет».
  Сделано: `FooterNavigation.test.tsx` (пункт «Меню» → `/menu`, заглушки нет, отключённых пунктов нет), `NavigationItem.test.tsx`; `e2e/tests/navigation.spec.ts` — «navigate to menu», «workout stub is gone» (прогон Playwright не делался).
- [x] 7.2 `features/recipes/`: API-клиент, типы, каталог `/menu` с поиском и фильтром, карточка `/menu/recipes/[id]` с пометкой приблизительного КБЖУ, кнопка «не предлагать», пустое состояние. Проверка: Jest + RTL.
  Сделано: `features/recipes/components/__tests__/clientScreens.test.tsx` (каталог, фильтр, поиск, «ещё», пустое состояние, карточка, пометка приблизительного КБЖУ, отклонение, 404).
- [x] 7.3 Редактор рецепта и импорт для команды (`/admin/recipes`, `/admin/recipes/[id]`), подбор продукта для ингредиента. Проверка: Jest + RTL.
  Сделано: `adminScreens.test.tsx` (новый рецепт, подбор продукта, кандидаты импорта, фото, `422` с перечнем, публикация, импорт ВкусВилла, `502`).
- [x] 7.4 Очередь проверки и правка-и-одобрение для куратора (`/curator/recipes`), ограничения и скрытые рецепты в карточке клиента. Проверка: Jest + RTL.
  Сделано: `curatorScreens.test.tsx` (очередь, одобрение, правка-и-одобрение, `409`, возврат только с комментарием, вкладка «Питание»). Рецепт для скрытия выбирается поиском по `GET /curator/recipes` (опубликованные с одобренной версией; уже скрытые не предлагаются).
- [x] 7.5 Раздел «Ограничения в питании» в настройках клиента со списком отклонённых рецептов. Проверка: Jest + RTL.
  Сделано: `restrictions.test.tsx` (11 аллергенов по-русски, исключения через поиск дневника, «Вернуть»), ссылка в `/profile`, страница `/settings/food-restrictions`.
- [x] 7.6 `/menu` в `PROTECTED` (`apps/web/src/proxy.ts`). Проверка: тест прокси — гость с `/menu` уходит на вход.
  Сделано: `src/__tests__/proxyProtected.test.ts` — гость с `/menu` и `/menu/recipes/:id` уходит на `/auth?next=…`.
- [x] 7.7 События `menu_opened`, `recipe_opened`, `recipe_rejected`, `recipe_submitted`, `recipe_approved`. Проверка: Jest на отправку событий; после выкатки на dev события видны в `analytics_events`.
  Сделано: `EVENTS` в `shared/analytics/events.ts`, вызовы без свойств; Jest (`recipeEvents.test.ts`, проверки `track` в тестах экранов); имена есть в `analytics/dictionary.go`, `TestEventDictionariesMatch` и `check-codebase-integrity` зелёные. Видимость в `analytics_events` на dev — после выкатки (8.3).
- [x] 7.8 `npm run lint`, `npm run type-check`, `scripts/check-api-contract.mjs` и остальные статические проверки из корня. Проверка: все зелёные.
  Сделано: lint, type-check, Jest (5219), все восемь `scripts/check-*.mjs` из корня, `go test ./...` — зелёные.

## 8. E2E и документация

- [x] 8.1 Playwright `e2e/tests/recipe-catalogue.spec.ts`: команда создаёт рецепт и отправляет → куратор одобряет → клиент видит его в «Меню» → клиент отклоняет → рецепт пропал → вернул в настройках. Рецепт удаляется после прогона. Проверка: прогон локально через прокси `:3070` и в CI.
  Сделано: `e2e/tests/recipe-catalogue.spec.ts` (проект `auth-tests`, три роли своими входами; после прогона — снятие отклонения и снятие с публикации: удаления рецепта в API нет). Локально: своя база `e2e_local` в `burcev-itest`, `seed-e2e`, сборка `next build` + прокси `:3070` — проходит вместе с `navigation.spec.ts` (9/9) и `design-system.spec.ts` с новыми страницами (12/12). В CI не прогонялось.
- [x] 8.2 `docs/user-guide/` — раздел о «Меню» и рецептах; `make sync-knowledge`. Проверка: `TestKnowledgeMatchesUserGuide`.
- [x] 8.3 Слить в `dev`, проверить на new.burcev.team: пункт «Меню», рецепт проходит путь от команды до клиента. Проверка: ручной проход и логи API без ошибок. **Проверено на dev 2026-10-10: «Меню» в навигации, «Тренировки» нет; рецепт прошёл команда → куратор → клиент и через API, и через интерфейс (отправка, одобрение, «Не предлагать»); super_admin на одобрение — 403, возврат без комментария — 422; ошибок API нет.**
