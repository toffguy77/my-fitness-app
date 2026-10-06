## 1. API

- [x] 1.1 Тест Go: `GetPublicFeed` возвращает `updated_at` каждой карточки. Проверка: `go test ./internal/modules/content/` падает до реализации.
- [x] 1.2 Добавить `UpdatedAt` в `ArticleCard` и в выборку публичной и персональной лент. Проверка: тесты зелёные.

## 2. Карта

- [x] 2.1 Переписать `sitemap.test.ts` под требования: динамический сегмент, постраничный обход (150 статей), отсутствие `/auth`, наличие калькулятора и автора, `lastmod` = `updated_at`, нет `lastModified` у статических, slug в адресе. Проверка: `npx jest sitemap` падает до реализации.
- [x] 2.2 Реализовать. Проверка: `npx jest sitemap` зелёный, `npm run type-check`.
- [x] 2.3 Проверить, что сборка не пререндерит карту: `npm run build` в `apps/web` показывает `ƒ /sitemap.xml` (dynamic), а не `○`.

## 3. Живая проверка

- [ ] 3.1 После выкатки на dev: число `<loc>…/content/` в `curl -s https://new.burcev.team/sitemap.xml` равно `total` из `GET /api/v1/public/content`. Затем то же на проде (ожидается 10).
