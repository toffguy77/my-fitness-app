## 1. Онбординг и дневник

- [x] 1.1 `OnboardingWizard.tsx:142`: текущий вес — `POST /dashboard/daily` (тип `weight`), без `target_weight`. Проверка: тест мастера проверяет оба запроса; сценарий «вес не введён».
- [x] 1.2 `FoodTrackerPage.tsx`: начальная дата из `?date=` с проверкой формата. Проверка: тесты на корректную и мусорную дату; e2e «быстрая запись со вчерашнего дня открывает вчера».
- [x] 1.3 Убрать вкладку «Чат» и `ChatTab.tsx`, ключ словаря, экспорт. Проверка: тест окна — четыре вкладки; `npm run lint:web`, проверка переводов.
- [x] 1.4 `useFoodSearch.ts:93` — порог 2. Проверка: тест хука на «гр».

## 2. Отзыв куратора

- [x] 2.1 `curator/service.go:2468` — `actionURL` `/dashboard?report=<id>`; миграция старых `action_url`. Проверка: тест сервиса; тест миграции на строке со старым путём.
- [x] 2.2 Дашборд: блок отзыва только при `?report=`, прокрутка к нему. Проверка: тесты страницы с параметром и без (нет запроса `…/feedback` без параметра); e2e из уведомления.

## 3. Выход и колокольчик

- [x] 3.1 `profile/page.tsx` — `POST /auth/logout`, затем локальная очистка; локальный выход при ошибке сети. Проверка: тесты обоих сценариев; e2e «после выхода `/auth/refresh` не даёт сессию».
- [x] 3.2 `NotificationDropdown.tsx` — убрать `markAllAsRead('content')` при открытии. Проверка: тест «открыть и закрыть — счётчик не меняется».

## 4. Согласия при регистрации через провайдера

- [x] 4.1 Колбэк: новый аккаунт → ожидающий вход и редирект на `/auth/consents`; `POST /auth/oauth/consents` создаёт аккаунт, пишет `user_consents`, назначает куратора. Проверка: `oauth_service_test.go` — сценарии `external-identity`; `TestEveryAccountPathAssignsCurator` проходит.
- [x] 4.2 Аккаунт без обязательных согласий при входе через провайдера проходит экран. Проверка: интеграционный тест на пользователе без строк в `user_consents`.
- [x] 4.3 Страница `/auth/consents` с `ConsentSection`. Проверка: тест страницы; e2e регистрации через заглушку провайдера.

## 5. Куратор

- [x] 5.1 `GET /conversations/by-participant/:userId`, `protectedRoutes` (`participant`), `routes.golden`. Проверка: тесты сценариев `curator-conversation-lookup`; `go test ./internal/router/`.
- [x] 5.2 `curator/chat/[clientId]/page.tsx` на `by-participant`, состояние «не найдена». Проверка: тест страницы на `404`; `node scripts/check-api-contract.mjs`.
- [x] 5.3 `POST …/support/conversations/:id/messages/:messageId/retry`. Проверка: тесты сценариев `support-reply-retry`.
- [x] 5.4 `SupportQueue.tsx`: «Не доставлено в Telegram», «Повторить», подпись канала. Проверка: тесты компонента, включая сообщение без `delivered`.

## 6. Спека и документация

- [x] 6.1 `config-validation`: `features` в `/ready`. Проверка: `openspec validate --strict`; тест обработчика `/ready` уже покрывает `features`.
- [x] 6.2 `docs/user-guide/` — онбординг, отзыв куратора, регистрация через провайдера; `make sync-knowledge`. Проверка: `TestKnowledgeMatchesUserGuide`.
- [x] 6.3 Весь набор Playwright на стенде. Проверка: 0 failed.
