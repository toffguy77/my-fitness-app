## 1. JSON-LD

- [x] 1.1 Тест `JsonLd`: строка с `</script>` экранируется, `JSON.parse` содержимого даёт исходные данные. Проверка: `npx jest JsonLd` падает до реализации.
- [x] 1.2 Реализовать экранирование. Проверка: тест зелёный, тесты посадочной зелёные.

## 2. Лента

- [x] 2.1 Тест Go: `GET /api/v1/public/content?limit=100000` передаёт в сервис `limit = 100`. Проверка: `go test ./internal/modules/content/ -run PublicFeed` падает до реализации.
- [x] 2.2 Реализовать предел. Проверка: тест зелёный.

## 3. Страницы

- [x] 3.1 Тесты: неизвестный slug → `notFound()`; ошибка API → не `notFound()`; `BreadcrumbList` статьи; `/unsubscribe` с `robots: noindex, nofollow`. Проверка: `npx jest content-article-page unsubscribe` падает до реализации.
- [x] 3.2 Реализовать, удалить `app/content/loading.tsx`. Проверка: тесты зелёные.
- [x] 3.3 Код ответа на сборке: `npm run build && PORT=3099 npm start`, затем `curl -s -o /dev/null -w '%{http_code}' localhost:3099/content/takoy-stati-net` = `404`. Проверка: наблюдаемый код.

## 4. Живая проверка

- [x] 4.1 После выкатки: `curl -s -o /dev/null -w '%{http_code}' https://new.burcev.team/content/takoy-stati-net` = `404`; `curl -s 'https://new.burcev.team/api/v1/public/content?limit=5000' | jq '.data.articles|length'` ≤ 100. Затем прод. *Проверено 2026-10-06 на dev и на проде (`v2026.10.06+31a71d72`).*
