## 1. Транслитерация

- [x] 1.1 Табличный тест `Slugify`: кириллица, ё/й/ъ/ь, знаки препинания, повторные дефисы, обрезка до 80 по слову, пустой результат. Проверка: `go test ./internal/modules/content/ -run Slugify` падает до реализации.
- [x] 1.2 Реализовать `slug.go` (`Slugify`, `ValidSlug`). Проверка: тест зелёный.

## 2. Миграция

- [x] 2.1 Сверить номер: `SELECT max(version) FROM schema_migrations` на dev и проде и ветки соседей. Проверка: максимум 089, `090` свободен.
- [x] 2.2 Интеграционный тест: после миграции у статей с заголовками из таблицы 1.1 slug равен `Slugify(title)`, повтор получает `-2`, индекс уникален. Проверка: `TEST_DATABASE_URL=… go test ./internal/modules/content/ -run Migration` падает до реализации.
- [x] 2.3 Написать `090_article_slugs_{up,down}.sql`, обновить `schema.golden` и стратегию удаления, если требуется. Проверка: тест 2.2 зелёный, `go test ./internal/router/ ./internal/modules/account/` зелёный.

## 3. Сервис и ручки

- [x] 3.1 Тесты: создание присваивает slug и разводит повторы; правка заголовка не меняет slug; смена slug опубликованной → `409`, черновика → меняется; неверный формат → `400`; публичная статья по slug и по UUID; slug статьи `my_clients` → `404`; карточка персональной ленты с аудиторией `selected` без slug. Проверка: `go test ./internal/modules/content/` падает до реализации.
- [x] 3.2 Реализовать. Проверка: `go test ./...` в `apps/api` зелёный.

## 4. Фронтенд

- [x] 4.1 Тесты: `FeedCard` ведёт на slug, без slug — на UUID; страница статьи строит canonical/OG/JSON-LD из slug; `middleware` отвечает `301` для UUID публичной статьи и пропускает при `404` и ошибке API. Проверка: `npx jest FeedCard middleware content-article-page` падает до реализации.
- [x] 4.2 Реализовать, добавить поле «Адрес статьи» в `ArticleForm` (с тестом: поле заблокировано у опубликованной статьи). Проверка: тесты зелёные, `npm run type-check`, `npm run lint`.

## 5. Живая проверка

- [ ] 5.1 После выкатки на dev: `curl -sI https://new.burcev.team/content/<uuid>` → `301`, `location: /content/<slug>`; `curl -s …/content/<slug>` → `200`. Затем прод для всех 10 статей.
