## Why

SEO-аудит, замечание 3 (блокер): в `sitemap.xml` одна статья из десяти. На
момент проверки 2026-10-06 на проде в карте **ноль** статей, у всех шести
страниц одинаковый `lastmod` — время сборки, а публичный API отдаёт десять.

Причина: `apps/web/src/app/sitemap.ts` — статический маршрут. Next собирает его
один раз при `next build`, где API по адресу `INTERNAL_API_URL` недоступен:
запрос обрывается по таймауту (`sitemap.ts:56-61`), ошибка проглатывается
(`sitemap.ts:76-79`), и в образ уходит карта без статей. До следующей сборки
статьи в ней не появятся. Существующие тесты (`app/__tests__/sitemap.test.ts`)
подменяют `fetch` и этого не видят.

Кроме того, в карте лежит `/auth`: страница входа поиску не нужна.

## What Changes

- `sitemap.xml` собирается при запросе, а не при сборке.
- Статьи берутся из публичного API постранично, сколько бы их ни было.
- `lastmod` статьи — дата её последнего изменения; у статических страниц
  `lastmod` не указывается вместо «сейчас» на каждый запрос.
- `/auth` убирается из карты; добавляются `/kalkulyator-kbzhu` (см.
  `seo-calculator-page`) и страница автора (см. `article-expert-author`).
- Адрес статьи в карте — канонический, со slug (см. `article-slugs`).
- Публичная карточка статьи отдаёт `updated_at`.

## Capabilities

### New Capabilities
- `search-sitemap`: карта сайта отражает опубликованное содержимое в момент запроса.

### Modified Capabilities

## Impact

- `apps/web/src/app/sitemap.ts` — весь файл.
- `apps/web/src/app/__tests__/sitemap.test.ts` — ожидания по составу.
- `apps/api/internal/modules/content/types.go:55-63` (`ArticleCard`) и
  `service.go:1029-1056` (`GetPublicFeed`) — поле `updated_at`.
- `apps/web/src/features/content/types/index.ts:28-36` — тип карточки.
