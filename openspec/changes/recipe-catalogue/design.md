## Context

- Каталог продуктов двухслойный: `products` (BIGSERIAL, импорт) и `food_items` (UUID). Выбор продукта из `products` копирует его в `food_items` под детерминированным UUID (`ensureFoodItemExists`, `apps/api/internal/modules/food-tracker/service.go:820`). Поиск идёт по обоим (`SearchFoods`, там же, `:962`). Смешение двух видов идентификаторов уже приводило к дефекту — половина выдачи не работала.
- Роли: `client`, `coordinator` (куратор), `super_admin`. Кураторская группа маршрутов закрыта `RequireRole("coordinator")` (`apps/api/internal/router/curator.go:19`), административная — `RequireRole("super_admin")` (`:57`). `/curator/clients/:id` закрыт `RequireClientRelationship`.
- Обложки статей уже загружаются в публичное хранилище (`apps/api/internal/router/content.go:31`, `UploadCoverImage`); проверка типа — общая (`upload-safety`).
- LLM в этом изменении не участвует.
- MCP ВкусВилла (`https://mcp.vkusvill.ru/mcp`) отдаёт рецепты без авторизации: ингредиенты с подписью количества и id товаров ВкусВилла, шаги с фото, порции, КБЖУ на 100 г (нам не нужно), без веса готового блюда. Лимит около 60 запросов в минуту. Разрешение на использование получено.

## Goals / Non-Goals

**Goals:**
- Каталог рецептов с версиями и одобрением, КБЖУ только по нашему каталогу.
- Одно правило доступности рецепта клиенту, переиспользуемое планом питания.
- Импорт ВкусВилла как ускоритель наполнения.
- Пункт «Меню» в навигации клиента с каталогом и карточкой рецепта.

**Non-Goals:**
- План на день, запись в дневник, список покупок — следующие изменения.
- Корзины магазинов, упаковки, семьи, генерация рецептов моделью.
- Свои рецепты клиента (у клиента есть `user_foods` для домашних блюд).

## Decisions

### 1. Схема: рецепт, версии, ингредиенты, шаги

```
recipes            id UUID, status ('published'|'unpublished'), source ('manual'|'vkusvill'),
                   source_ref TEXT UNIQUE NULL, created_by → users ON DELETE SET NULL, created_at
recipe_versions    id UUID, recipe_id, version INT (UNIQUE с recipe_id), state ('draft'|'review'|'approved'|'superseded'),
                   name, description, photo_key, cook_minutes, complexity, servings, yield_grams NULL,
                   meal_types TEXT[], tags TEXT[], allergens TEXT[],
                   kcal_100, protein_100, fat_100, carbs_100, total_grams, portion_grams, approximate BOOL,
                   review_comment, edited_by, approved_by → users ON DELETE SET NULL, approved_at, created_at
recipe_steps       version_id, position, text, photo_key NULL
recipe_ingredients version_id, position, food_id UUID → food_items, grams NULL, display_quantity NULL, to_taste BOOL
```

Частичный уникальный индекс: не больше одной версии в `draft`/`review` и не больше одной в `approved` на рецепт. Сохранённые КБЖУ — кэш вычисления, пересчитываемый при каждом сохранении черновика; после одобрения версия неизменна, поэтому кэш не устаревает.

*Отвергнуто:* хранить ингредиенты JSONB внутри версии — теряется внешний ключ на `food_items`, а `shopping-list` должен группировать по продуктам и категориям. *Отвергнуто:* одна таблица без версий с флагом «на проверке» — правка одобренного рецепта сразу меняла бы то, что видят клиенты, и прошлые записи дневника (`plan-diary-logging` ссылается на версию).

### 2. Ингредиент хранит UUID `food_items`

API принимает идентификатор в той форме, которую отдаёт `SearchFoods` (число для `products`, UUID для `food_items`), и нормализует через `ensureFoodItemExists`. Тот же путь, что у записей дневника, — второго способа сопоставления не появляется.

*Отвергнуто:* полиморфная ссылка (`product_id` или `food_item_id`) — два вида идентификаторов в одной таблице и есть известный источник дефектов.

### 3. Расчёт КБЖУ — чистая функция

`recipes/nutrition.go`: вход — ингредиенты с КБЖУ на 100 г и граммами, вес готового блюда, порции; выход — КБЖУ на 100 г, общий вес, вес порции, флаг приблизительности. Ингредиенты «по вкусу» исключены. Покрыта табличными тестами, включая сценарии спеки.

### 4. Права

| Действие | Роль | Маршрут |
|---|---|---|
| Создание, правка черновика, отправка, снятие с публикации, загрузка фото, импорт | `super_admin` | `/api/v1/admin/recipes...` |
| Очередь на проверку, одобрение, правка-и-одобрение, возврат | `coordinator` | `/api/v1/curator/recipes...` |
| Ограничения и скрытия клиента | `coordinator` + связь | `/api/v1/curator/clients/:id/food-restrictions`, `/api/v1/curator/clients/:id/hidden-recipes/:recipeId` |
| Каталог, карточка, отклонение, свои ограничения | `client` | `/api/v1/recipes...`, `/api/v1/food-restrictions` |

`super_admin` не одобряет: по решению пользователя рецепт добавляет команда, а проверяет куратор. *Отвергнуто:* одобрение любой из двух ролей — проверка превращается в формальность.

### 5. Правило доступности — одна SQL-функция фильтра в сервисе

`recipes.Service.AvailableFilter(userID)` строит условие `WHERE` (опубликован, есть `approved`, нет в `client_hidden_recipes`, нет в `user_rejected_recipes`, `NOT allergens && user_allergens`, нет ингредиента из `user_excluded_foods`). Каталог, карточка и сборка плана (`meal-day-plan`) зовут его, а не повторяют условие.

Таблицы: `user_food_restrictions(user_id PK, allergens TEXT[])`, `user_excluded_foods(user_id, food_id)`, `user_rejected_recipes(user_id, recipe_id)`, `client_hidden_recipes(client_id, recipe_id, hidden_by ON DELETE SET NULL)`.

### 6. Импорт ВкусВилла

Клиент MCP — минимальный JSON-RPC по HTTP (`initialize` → `tools/call` `vkusvill_recipes`), таймаут 10 с, ограничитель 30 запросов в минуту на процесс. Импорт:
1. Создаёт рецепт с `source='vkusvill'`, `source_ref` = id рецепта ВкусВилла; уникальность `source_ref` даёт идемпотентность.
2. Копирует фото блюда и шагов в хранилище под префиксом `recipes/`.
3. Для ингредиента: подпись количества сохраняется как `display_quantity`; граммы выводятся для «N г», «N кг», «N мл»; для «N шт.» — `N × default_weight`, если он есть у первого кандидата; иначе пусто.
4. Кандидаты — первые 5 результатов `SearchFoods` по названию ингредиента. Выбор подтверждает человек; до подтверждения у ингредиента нет `food_id`, и отправка на проверку отвечает `422`. Для этого черновой ингредиент хранит `food_id NULL` и `source_name`.

Способность включена, если задан `VKUSVILL_MCP_URL` (значение по умолчанию задано), и попадает в список `config.Features` как `recipe_import`.

*Отвергнуто:* показывать клиенту рецепты ВкусВилла напрямую — чужая бета без SLA, КБЖУ не по нашему каталогу, нет одобрения.

### 7. Фото

Загрузка как у обложек статей: публичное чтение, ключ `recipes/{uuid}.{ext}`. Фото рецептов не персональные — подпись URL не нужна и мешала бы кэшированию.

### 8. Фронтенд

- `features/recipes/`: API-клиент, типы, `RecipeCard`, `RecipeDetail`, `RecipeEditor` (общий для команды и правки куратором), `IngredientPicker` (поверх существующего поиска продуктов), `ReviewQueue`, `VkusvillImport`, `FoodRestrictionsForm`.
- Страницы: `/menu` (каталог; в `meal-day-plan` станет вкладкой рядом с планом), `/menu/recipes/[id]`, `/admin/recipes`, `/admin/recipes/[id]`, `/curator/recipes`, `/curator/recipes/[id]`, раздел «Ограничения в питании» в `/settings`.
- Навигация: `workout` → `menu` (иконка `ChefHat`).

## Risks / Trade-offs

- **Сопоставление ингредиентов вручную** — узкое место наполнения. Смягчение: кандидаты и граммовка подставляются, человек только подтверждает.
- **Пустой каталог на старте** — пока команда не наполнила и куратор не одобрил, клиентам нечего показать. Пустое состояние «Меню» объясняет это; E2E создаёт рецепт сам.
- **Вес готового блюда часто неизвестен** — КБЖУ будет приблизительным; пометка видна клиенту, редактор подсказывает его заполнить.
- **Условия ВкусВилла могут измениться** — импорт отключается, каталог остаётся: все данные уже у нас.
- **Номер миграции** — сверять с `schema_migrations` dev и прод перед добавлением.
