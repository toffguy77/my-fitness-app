## Why

SEO-аудит, замечание 1 (блокер): страница статьи без JavaScript не содержит ни
заголовка `h1`, ни абзацев. Робот, который не исполняет скрипты или исполняет
их с задержкой и лимитом, видит пустую страницу со спиннером, и статья не
индексируется по своему тексту.

Причина: `apps/web/src/app/content/[id]/page.tsx` получает статью на сервере
только для `generateMetadata` и JSON-LD, а тело отдаёт клиентскому
`ArticleView` (`apps/web/src/features/content/components/ArticleView.tsx:24-63`),
который заново запрашивает ту же статью в `useEffect` уже в браузере. Данные на
сервере есть, но в HTML не попадают.

## What Changes

- Страница публичной статьи рендерится на сервере целиком: категория,
  заголовок `h1`, автор, дата и тело Markdown попадают в HTML первого ответа.
- Разметка статьи выносится в серверный компонент `ArticleContent`, общий для
  серверного пути и для клиентского `ArticleView`, чтобы вид не расходился.
- Клиентский `ArticleView` остаётся только для статей с ограниченной аудиторией
  (`my_clients`, `selected`): их нет в публичном API, и читать их может только
  вошедший клиент. Такая страница помечается `noindex`.
- Повторный запрос статьи в браузере для публичной статьи исчезает.

## Capabilities

### New Capabilities
- `public-article-page`: публичная статья отдаётся поисковику и посетителю в HTML
  первого ответа, без зависимости от JavaScript.

### Modified Capabilities

## Impact

- `apps/web/src/app/content/[id]/page.tsx:52-82` — тело страницы.
- `apps/web/src/features/content/components/ArticleView.tsx:108-170` — разметка
  статьи переезжает в `ArticleContent`.
- Новый `apps/web/src/features/content/components/ArticleContent.tsx`.
- Тесты: `apps/web/src/app/__tests__/content-article-page.test.tsx` (новый),
  `e2e/tests/seo-without-javascript.spec.ts` (новый, общий для замечаний 1, 2, 4).
- Зависит от `article-slugs` (адрес статьи) и `seo-technical-hygiene` (404).
