## Why

SEO-аудит, замечание 5 (высокая): адреса статей состоят из UUID —
`/content/f914ec19-c67f-...`. Адрес не содержит ни одного слова запроса, его
нельзя прочитать в выдаче и в ссылке, и он ничего не сообщает о странице.

У статьи нет человекочитаемого идентификатора: таблица `articles` хранит только
`id UUID` (миграция `apps/api/migrations/` с таблицей `articles`), публичная
ручка принимает только UUID (`apps/api/internal/modules/content/handler.go:50-62`,
`parseArticleID`), а фронтенд строит ссылки из `article.id`
(`apps/web/src/features/content/components/FeedCard.tsx:45`,
`apps/web/src/app/content/[id]/page.tsx:39,47,74`).

## What Changes

- У статьи появляется поле `slug`: уникальное, латиница, цифры и дефисы.
  Миграция `090_article_slugs` добавляет столбец, заполняет его для
  существующих статей транслитерацией заголовка и создаёт уникальный индекс.
- Slug присваивается при создании статьи и не меняется при правке заголовка.
  Его можно задать или изменить вручную, пока статья не опубликована.
- Публичная ручка `GET /api/v1/public/content/:id` принимает UUID или slug и
  отдаёт `slug` в ответе. Карточки лент несут `slug`, если у статьи публичный
  адрес.
- Публичный адрес статьи — `/content/<slug>`. Запрос `/content/<uuid>`
  публичной статьи получает **301** на адрес со slug. Канонический адрес,
  Open Graph и JSON-LD строятся из slug.
- В форме статьи видно поле «Адрес статьи».

## Capabilities

### New Capabilities
- `article-addressing`: человекочитаемый постоянный адрес статьи и перенаправление со старого.

### Modified Capabilities

## Impact

- Новые: `apps/api/migrations/090_article_slugs_{up,down}.sql` (номер сверен с
  `schema_migrations` dev и прода 2026-10-06: максимум 089),
  `apps/api/internal/modules/content/slug.go`.
- `apps/api/internal/modules/content/{types.go,service.go,handler.go}` —
  поле, создание, правка, выборки, поиск по slug.
- `apps/web/src/middleware.ts` — 301 со старого адреса.
- `apps/web/src/app/content/[id]/page.tsx`,
  `apps/web/src/features/content/components/{FeedCard,ArticleForm}.tsx`,
  `apps/web/src/features/content/types/index.ts`.
- `apps/api/internal/router/testdata/schema.golden` — новый столбец.
