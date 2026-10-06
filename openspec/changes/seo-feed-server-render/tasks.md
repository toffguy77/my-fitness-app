## 1. Клиентская лента с начальными данными

- [x] 1.1 Тест: `FeedList` с `initialArticles` у гостя рендерит карточки без спиннера и не вызывает `publicContentApi.getFeed`. Проверка: `npx jest FeedList` падает до реализации.
- [x] 1.2 Тест: смена рубрики у гостя запрашивает ленту рубрики; вошедший запрашивает `contentApi.getFeed`. Проверка: тот же файл.
- [x] 1.3 Реализовать `initialArticles`/`initialTotal` в `FeedList`. Проверка: `npx jest features/content` зелёный.

## 2. Серверная страница

- [x] 2.1 Тест: `ContentFeedPage` запрашивает публичную ленту (limit 20) и передаёт карточки в `FeedList`; при ошибке передаёт пустой список. Проверка: `npx jest content-page`.
- [x] 2.2 Реализовать запрос в `app/content/page.tsx`. Проверка: тесты 2.1 зелёные, `npm run type-check`.

## 3. Без JavaScript

- [x] 3.1 E2E `seo-without-javascript.spec.ts`: `/content` без JavaScript содержит ссылку на опубликованную статью. Проверка: локальный прогон E2E.
- [ ] 3.2 После выкатки: `curl -s https://new.burcev.team/content | grep -o 'href="/content/[^"]*"' | sort -u | wc -l` = числу публичных статей (≤ 20), затем то же на проде.
