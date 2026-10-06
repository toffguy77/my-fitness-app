## Why

Пока я разбирал замечания аудита, нашлись дефекты, которых в аудите нет, но
которые бьют по тому же: что робот получает от публичных страниц.

1. **JSON-LD не экранирует `<`.** `apps/web/src/shared/components/JsonLd.tsx:7-10`
   вставляет `JSON.stringify(data)` в `<script>` как есть. Заголовок или
   описание статьи с `</script>` закрывает блок и вставляет в страницу
   произвольную разметку: это XSS через редактор статей. Даже без злого умысла
   такая строка ломает разметку для поисковика.
2. **Несуществующая статья отвечает `200`.** `app/content/[id]/page.tsx`
   рендерит «Статья не найдена» с кодом 200 (soft-404): робот индексирует
   страницы-ошибки, а Вебмастер помечает их как дубли.
3. **Публичная лента не ограничивает `limit`.**
   `apps/api/internal/modules/content/handler.go:511-516` принимает любое
   положительное число: `?limit=100000000` заставляет базу и S3-прокси отдать
   всё за раз, без авторизации.
4. **`/unsubscribe` открыт для индексации.** Страница отписки по токену из
   письма (`app/unsubscribe/page.tsx`) не помечена `noindex`. Её адрес с
   токеном попадает в индекс, если ссылку кто-то опубликует.
5. **У статьи нет хлебных крошек в разметке.** `BreadcrumbList` показывает в
   выдаче путь «Статьи → заголовок» вместо голого адреса.

## What Changes

- `JsonLd` экранирует `<`, `>`, `&`, U+2028 и U+2029 в выводе.
- Статья, которую нельзя найти ни по slug, ни как ограниченную по UUID,
  отвечает `404` через `notFound()`.
- Публичная лента ограничивает `limit` сотней.
- `/unsubscribe` помечается `noindex, nofollow`.
- Страница статьи получает JSON-LD `BreadcrumbList`.

## Capabilities

### New Capabilities
- `seo-hygiene`: технические условия корректной индексации публичных страниц.

### Modified Capabilities

## Impact

- `apps/web/src/shared/components/JsonLd.tsx`.
- `apps/web/src/app/content/[id]/page.tsx`.
- `apps/web/src/app/unsubscribe/page.tsx`.
- `apps/web/src/app/content/loading.tsx` — удаляется (иначе 404 уходит кодом 200).
- `apps/api/internal/modules/content/handler.go:507-532`.
- Тесты: `apps/web/src/shared/components/__tests__/JsonLd.test.tsx`,
  `apps/web/src/app/__tests__/content-article-page.test.tsx`,
  `apps/web/src/app/unsubscribe/__tests__/`,
  `apps/api/internal/modules/content/handler_test.go`.
