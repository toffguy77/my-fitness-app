## Why

SEO-аудит, замечание 2 (блокер): в HTML ленты `/content` ноль ссылок на статьи,
только названия рубрик. Лента — главный вход робота в статьи, кроме sitemap, и
без ссылок в ней статьи не получают ни обнаружения, ни внутреннего веса.

Причина: `apps/web/src/app/content/page.tsx:18-25` отдаёт клиентский `FeedList`
(`apps/web/src/features/content/components/FeedList.tsx:12-60`), который
запрашивает ленту в `useEffect` после гидрации. В серверном HTML — заголовок,
фильтр рубрик и спиннер.

## What Changes

- `/content` запрашивает первые 20 публичных карточек на сервере и передаёт их
  в `FeedList` как начальные данные.
- `FeedList` показывает начальные карточки сразу, без спиннера, и сам ходит в
  API только при смене рубрики, догрузке и для вошедшего пользователя (его лента
  шире публичной).
- Карточка ведёт по адресу со slug (см. `article-slugs`).
- Пустой ответ сервера или ошибка API не ломают страницу: лента загружается
  клиентом, как раньше.

## Capabilities

### New Capabilities
- `public-content-feed`: лента статей отдаёт ссылки на статьи в HTML первого ответа.

### Modified Capabilities

## Impact

- `apps/web/src/app/content/page.tsx:18-25` — серверный запрос и проброс данных.
- `apps/web/src/features/content/components/FeedList.tsx:12-60` — начальные данные.
- `apps/web/src/features/content/components/FeedCard.tsx:43-46` — адрес ссылки.
- Тесты: `apps/web/src/app/__tests__/content-page.test.tsx`,
  `apps/web/src/features/content/components/__tests__/FeedList.test.tsx`,
  `e2e/tests/seo-without-javascript.spec.ts`.
