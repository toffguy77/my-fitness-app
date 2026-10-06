## Why

SEO-аудит, замечание 7 (высокая): в конце статьи нет призыва к действию.
Читатель из поиска дочитывает статью и уходит: шаблон статьи
(`apps/web/src/features/content/components/ArticleView.tsx:108-170`)
заканчивается телом Markdown, после него только ссылка «Назад» в начале. Статьи
приводят трафик, но не ведут его ни к расчёту, ни к тарифам.

## What Changes

- Под каждой публичной статьёй — постоянный блок: заголовок, одна фраза,
  основная кнопка «Рассчитать мою норму» на `/kalkulyator-kbzhu` и ссылка
  «Тарифы» на `/pricing`.
- Блок — часть серверной разметки статьи и виден без JavaScript.
- Клик по кнопке измеряется событием `article_cta_clicked` с назначением.

## Capabilities

### New Capabilities
- `article-call-to-action`: каждая публичная статья заканчивается переходом к расчёту и тарифам.

### Modified Capabilities
- `product-analytics`: в словарь добавляется `article_cta_clicked`.

## Impact

- Новый `apps/web/src/features/content/components/ArticleCta.tsx`.
- `apps/web/src/features/content/components/ArticleContent.tsx` (из
  `seo-article-server-render`) — блок после тела.
- `apps/web/src/shared/analytics/events.ts`,
  `apps/api/internal/modules/analytics/dictionary.go` — событие.
- Зависит от `seo-calculator-page` (адрес кнопки).
