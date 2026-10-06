## 1. JSON-LD

- [ ] 1.1 Тест `JsonLd`: строка с `</script>` экранируется, `JSON.parse` содержимого даёт исходные данные. Проверка: `npx jest JsonLd` падает до реализации.
- [ ] 1.2 Реализовать экранирование. Проверка: тест зелёный, тесты посадочной зелёные.

## 2. Лента

- [ ] 2.1 Тест Go: `GET /api/v1/public/content?limit=100000` передаёт в сервис `limit = 100`. Проверка: `go test ./internal/modules/content/ -run PublicFeed` падает до реализации.
- [ ] 2.2 Реализовать предел. Проверка: тест зелёный.

## 3. Страницы

- [ ] 3.1 Тесты: неизвестный slug → `notFound()`; ошибка API → не `notFound()`; `BreadcrumbList` статьи; `/unsubscribe` с `robots: noindex, nofollow`. Проверка: `npx jest content-article-page unsubscribe` падает до реализации.
- [ ] 3.2 Реализовать. Проверка: тесты зелёные.

## 4. Живая проверка

- [ ] 4.1 После выкатки: `curl -s -o /dev/null -w '%{http_code}' https://new.burcev.team/content/takoy-stati-net` = `404`; `curl -s 'https://new.burcev.team/api/v1/public/content?limit=5000' | jq '.data.articles|length'` ≤ 100. Затем прод.
