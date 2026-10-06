## 1. Разметка статьи

- [ ] 1.1 Тест: `ArticleContent` с данными статьи рендерит категорию, `h1`, автора, дату и тело. Проверка: `npx jest ArticleContent` падает до реализации.
- [ ] 1.2 Вынести разметку из `ArticleView` в `ArticleContent` (без `'use client'`), `ArticleView` использует его. Проверка: `npx jest features/content` зелёный, включая существующие тесты `ArticleView`.

## 2. Серверная страница

- [ ] 2.1 Тест: `ArticlePage` для публичной статьи возвращает разметку с `h1` и текстом тела без вызова клиентского API. Проверка: `npx jest content-article-page` падает до реализации.
- [ ] 2.2 Тест: для UUID, которого нет в публичном API, страница отдаёт `ArticleView`, а `generateMetadata` — `robots.index = false`. Проверка: тот же файл.
- [ ] 2.3 Реализовать серверный рендер в `app/content/[id]/page.tsx`. Проверка: тесты 2.1–2.2 зелёные, `npm run type-check`.

## 3. Без JavaScript

- [ ] 3.1 E2E `seo-without-javascript.spec.ts`: опубликовать статью через API куратора, открыть её с `javaScriptEnabled: false`, проверить `h1` и анонс. Тело в E2E не проверяется: в прогоне нет S3 (`e2e.yml` не передаёт хранилище), а тело статьи живёт там; тело проверяет задача 3.2. Проверка: `npm run test:e2e -- seo-without-javascript` локально по `reference_run_e2e_locally`.
- [ ] 3.2 После выкатки на dev: `curl -s https://new.burcev.team/content/<slug> | grep -c '<h1'` ≥ 1 и в ответе есть первая фраза статьи. Затем то же на проде.
