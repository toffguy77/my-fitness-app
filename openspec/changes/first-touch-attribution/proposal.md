## Why

SEO-аудит, замечание 10 (блокер для аналитики): источник перехода не
сохраняется у заявок, «открыт с прошлой проверки». Без него вклад Дзена и
поиска в заявки и регистрации остаётся невидимым.

Что сделано и чего не хватает (по коду на 2026-10-06):
- Метки UTM и `yclid` считываются на входе (`apps/web/src/shared/analytics/attribution.ts:56-79`)
  и уходят в заявку (`GuestOnboarding.tsx:449,576`, `PricingRequestForm.tsx:84`).
- **Реферер не сохраняется вовсе.** Дзен и поиск метки UTM не ставят:
  переход из них приходит с пустой строкой запроса, и `captureAttribution`
  ничего не запоминает (`attribution.ts:66-69`). Именно этот трафик аудит и
  хочет видеть.
- **Метки живут один приход** (`sessionStorage`). Человек, прочитавший статью
  из Дзена и вернувшийся на следующий день напрямую, регистрируется «ниоткуда».
- **Регистрация без заявки источника не получает.** `user_attribution`
  пишется только при переносе заявки (`apps/api/internal/modules/leads/service.go:240-254`).
  Пароль (`auth/handler.go:223`), ссылка из письма (`auth/handler.go:331-341`)
  и внешний провайдер (`auth/oauth_handler.go:211-219`) без `lead_token`
  оставляют пользователя без источника.

## What Changes

- **Первое касание.** При первом заходе браузера на сайт фиксируются метки
  UTM, `yclid`, внешний реферер (источник и путь, без строки запроса) и
  страница входа. Запись хранится 30 дней в cookie первой стороны
  `first_touch` и не перезаписывается последующими заходами.
- Заявка получает реферер и страницу входа вместе с метками; куратор видит
  источник, даже если меток не было.
- Каждый путь создания учётной записи (пароль, ссылка из письма, внешний
  провайдер) записывает `user_attribution` из cookie, если перенос заявки её не
  записал.
- Миграция `091_first_touch_referrer` добавляет `referrer` и `landing_page` в
  `leads` и `user_attribution`.
- Требование «Метки кампании переживают переходы внутри мастера» (не дольше
  одного прихода) удаляется из незаархивированной дельты
  `openspec/changes/metrika-ads-bridge/specs/lead-capture/spec.md`. Его
  заменяет требование «Заявка получает источник первого касания» с окном в 30
  дней.

## Capabilities

### New Capabilities
- `arrival-attribution`: источник первого касания доходит до заявки и до учётной записи.

### Modified Capabilities
- `lead-capture`: срок жизни меток кампании и состав источника в заявке
  (требования добавляются: заменяемое ещё не заархивировано).

## Impact

- `apps/web/src/shared/analytics/attribution.ts` — хранение и состав.
- `apps/web/src/shared/analytics/AttributionCapture.tsx` — без изменений по смыслу.
- `apps/web/src/features/curator/components/LeadList.tsx:57` — показ реферера.
- Новые: `apps/api/migrations/091_first_touch_referrer_{up,down}.sql`,
  `apps/api/internal/modules/leads/first_touch.go` (разбор cookie).
- `apps/api/internal/modules/leads/{types.go:50-59,service.go:86-112,240-254}`.
- `apps/api/internal/modules/auth/handler.go:223-225,331-341`,
  `apps/api/internal/modules/auth/oauth_handler.go:211-219`.
- `apps/api/internal/router/testdata/schema.golden`.
