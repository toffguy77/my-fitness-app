## Why

SEO-аудит, замечание 6 (высокая): автор статей в API — «Красный Кот», в
разметке JSON-LD — `Organization` «BURCEV». Для темы здоровья (YMYL) Яндекс и
Google оценивают экспертность автора: аноним или организация вместо человека с
квалификацией понижают доверие ко всем статьям.

Откуда это берётся:
- `author_name` — имя учётной записи, которой статьи заведены
  (`apps/api/internal/modules/content/service.go:1083-1088`, `JOIN users`). На
  проде все 10 статей принадлежат учётной записи с именем «Красный Кот».
- JSON-LD страницы статьи жёстко задаёт `author: { '@type': 'Organization' }`
  (`apps/web/src/app/content/[id]/page.tsx:68`).
- Страницы автора нет.

## What Changes

- Автор публичных статей — Сергей Бурцев: «Спортивный практикующий тренер,
  мастер спорта по тяжёлой атлетике». Данные автора объявлены один раз в
  `apps/web/src/shared/constants/author.ts`.
- Под заголовком статьи — блок автора: фото (если есть), имя-ссылка на
  страницу автора, строка квалификации.
- JSON-LD статьи: `author` типа `Person` с `name`, `jobTitle`, `url` и `image`
  (если фото есть).
- Новая страница `/avtor/sergey-burcev`: `h1` с именем, квалификация, список
  статей автора, JSON-LD `ProfilePage` с `Person`.
- Фото подключается файлом `apps/web/public/authors/sergey-burcev.jpg`. До его
  появления блок и разметка обходятся без изображения.

## Capabilities

### New Capabilities
- `article-authorship`: у публичных статей назван эксперт-автор с квалификацией и страницей.

### Modified Capabilities

## Impact

- Новые: `apps/web/src/shared/constants/author.ts`,
  `apps/web/src/features/content/components/ArticleAuthor.tsx`,
  `apps/web/src/app/avtor/sergey-burcev/page.tsx`.
- `apps/web/src/app/content/[id]/page.tsx:59-76` — JSON-LD.
- `apps/web/src/features/content/components/ArticleContent.tsx` (из
  `seo-article-server-render`) — блок автора.
- `apps/web/src/app/sitemap.ts` — адрес страницы автора (см. `seo-sitemap-at-request`).
