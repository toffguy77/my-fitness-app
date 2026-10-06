## Why

SEO-аудит, замечание 9 (низкая): в `robots.txt` директивы `Host` и
`Crawl-delay`. Яндекс перестал учитывать обе в 2018 году: главное зеркало
определяется 301-редиректом, скорость обхода задаётся в Вебмастере. Google не
учитывал их никогда. Мёртвые директивы вводят в заблуждение того, кто читает
файл.

Источник: `apps/web/src/app/robots.ts:45` (`crawlDelay: 2`) и `:49`
(`host`). Из-за `crawlDelay` в файле есть отдельный блок `User-Agent: Yandex`
(`robots.ts:24-46`), который в остальном повторяет общий блок. Это два списка,
которые придётся править синхронно.

## What Changes

- Удаляются `Host` и `Crawl-delay`.
- Блок `User-Agent: Yandex` удаляется: без `Crawl-delay` он совпадает с общим.
- Список `Allow` перестаёт перечислять отдельные пути: `Allow: /` и так их
  покрывает. Закрытые разделы остаются в `Disallow`.

## Capabilities

### New Capabilities
- `robots-directives`: `robots.txt` содержит только действующие директивы.

### Modified Capabilities

## Impact

- `apps/web/src/app/robots.ts` — весь файл.
- `apps/web/src/app/__tests__/robots.test.ts` (новый).
