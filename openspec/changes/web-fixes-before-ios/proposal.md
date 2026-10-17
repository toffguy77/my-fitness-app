## Why

При разборе веба на экраны для iOS (`docs/ios/README.md`, «Не переносим»)
нашлись ошибки. Одни теряют или портят данные:
- текущий вес из онбординга записывается как цель;
- аккаунт через Яндекс или VK создаётся без согласий;
- выход не завершает сессию.

Другие делают функции мёртвыми:
- отзыв куратора на отчёт никогда не показывается, а ссылка из уведомления ведёт на несуществующую страницу;
- вкладка «Чат» в окне еды — заглушка;
- дневник игнорирует дату из быстрой записи.

iOS-изменения опираются на правильное поведение сервера: согласия до создания
аккаунта, переписку по клиенту, повтор недоставленного ответа. Поэтому это
изменение выполняется первым.

## What Changes

- Онбординг: «Текущий вес» сохраняется замером веса, а не `target_weight`.
- Дневник:
  - учитывает `?date=`;
  - в окне добавления нет вкладки «Чат», `ChatTab` удалён;
  - поиск ищет со второго символа.
- Отзыв на недельный отчёт:
  - уведомление ведёт на `/dashboard?report=<id>`;
  - дашборд показывает блок отзыва по этому параметру;
  - пустой блок без `reportId` убран.
- «Выйти» в профиле вызывает `POST /auth/logout`.
- Колокольчик при открытии больше не помечает «Контент» прочитанным.
- Регистрация через Яндекс или VK — только после согласий:
  - колбэк уводит на `/auth/consents`;
  - аккаунт создаётся после `POST /auth/oauth/consents`;
  - **BREAKING** для потока регистрации через провайдера: новый экран между колбэком и дашбордом.
- Куратор:
  - `GET /conversations/by-participant/:userId`;
  - веб-страница переписки показывает «Переписка с клиентом не найдена» вместо вечной загрузки.
- Обращения:
  - веб показывает недоставленный ответ и «Повторить»;
  - `POST /curator/support/conversations/:id/messages/:messageId/retry` повторяет отправку без второй записи в треде;
  - подпись поля ответа зависит от канала.
- Документация:
  - спека `config-validation` и `CLAUDE.md` говорят, что `features` отдаёт `/ready`, а не `/health`, — так устроен код.

## Capabilities

### New Capabilities
- `onboarding-body-step`: текущий вес в онбординге — замер.
- `food-diary-entry`: дата из ссылки, окно добавления без заглушки, поиск со второго символа.
- `weekly-report-feedback`: ссылка уведомления и показ отзыва на дашборде.
- `web-logout`: выход завершает сессию на сервере.
- `notification-dropdown`: открытие колокольчика ничего не помечает.
- `curator-conversation-lookup`: бэкенд — переписка по id участника.
- `curator-chat-states`: веб-страница переписки куратора открывается по клиенту и показывает «не найдено».
- `support-reply-retry`: бэкенд — повтор недоставленного ответа.
- `support-delivery-indicator`: веб показывает недоставку, повтор и подпись канала.

### Modified Capabilities
- `external-identity`: аккаунт через провайдера создаётся только после согласий.
- `config-validation`: возможности перечисляет `/ready`, а не `/health`.

## Impact

**Веб**
- `apps/web/src/features/onboarding/components/OnboardingWizard.tsx:142` — `payload.target_weight = parseFloat(currentWeight)` → отдельный `POST /dashboard/daily`.
- `apps/web/src/features/food-tracker/components/FoodTrackerPage.tsx:58` — `useState<Date>(new Date())` без учёта `?date=`; `:63-64` — разбор `searchParams`.
- `apps/web/src/features/food-tracker/components/FoodEntryModal.tsx`:
  - `:23` — импорт `ChatTab`;
  - `:75` — вкладка `chat`;
  - `:491-492` — её рендер;
  - `ChatTab.tsx` удаляется;
  - `index.ts:84` — закомментированный экспорт удаляется;
  - ключ `foodTracker.tabs.chat` уходит из словарей.
- `apps/web/src/features/food-tracker/hooks/useFoodSearch.ts:93` — `DEFAULT_MIN_QUERY_LENGTH = 3` → 2.
- `apps/web/src/app/dashboard/page.tsx:313` — `<CuratorFeedbackSection>` без `reportId`; `CuratorFeedbackSection.tsx:26-29` — пропс.
- `apps/web/src/app/profile/page.tsx:40-46` — `handleLogout` без вызова API.
- `apps/web/src/features/notifications/components/NotificationDropdown.tsx:28-32` — `markAllAsRead('content')` при открытии.
- `apps/web/src/app/curator/chat/[clientId]/page.tsx:34` — поиск по списку; `:93` — вечное `t('common.loading')`.
- `apps/web/src/features/curator/components/SupportQueue.tsx` — показ `delivered`, «Повторить», подпись канала.
- `apps/web/src/app/auth/consents/page.tsx` — новая страница.

**Бэкенд**
- `apps/api/internal/modules/curator/service.go:2468` — `actionURL` отзыва.
- `apps/api/internal/modules/auth/oauth_service.go:117-130` — `createUserFromProvider` создаёт пользователя без согласий.
- `apps/api/internal/modules/auth/service.go:295` — запись `user_consents`, переиспользуется.
- `apps/api/internal/modules/auth/oauth_handler.go:143` — `Callback`, ветка «новый аккаунт».
- `apps/api/internal/router/chat.go:20-27` — `by-participant`.
- `apps/api/internal/router/support.go` — `retry`.
- `apps/api/internal/modules/support/service.go:395-430` — отправка и `markDelivered`.
- `authorization_matrix_test.go`, `routes.golden`, `scripts/check-api-contract.mjs`.

**Спеки и документация**
- `openspec/specs/config-validation/spec.md:70-78`.
- `CLAUDE.md:198`.
- `docs/user-guide/` — онбординг, отзыв куратора, регистрация через провайдера; `make sync-knowledge`.
