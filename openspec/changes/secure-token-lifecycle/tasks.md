## 1. Схема данных

- [ ] 1.1 Создать миграцию `045_add_token_version_and_ws_tickets_{up,down}.sql`: колонка `users.token_version INTEGER NOT NULL DEFAULT 0`; таблица `ws_tickets(token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ)` с индексом по `expires_at`. Проверка: `make db-migrate` на локальной БД, `\d users` показывает колонку, down-миграция откатывает чисто.

## 2. Отзыв сессий

- [x] 2.1 Реализовать `revokeAllUserRefreshTokens` как экспортируемый метод и вызвать его из `reset_service.go:ResetPassword` и из `service.go:ChangePassword`. Проверка: тест «после сброса все токены пользователя имеют `revoked_at`».
- [x] 2.2 Заменить заглушку `InvalidateUserSessions` (`reset_service.go:378-392`) реальной реализацией: отзыв refresh-токенов + инкремент `users.token_version` в одной транзакции. Проверка: тест сценария «Проверка реализации отзыва».
- [ ] 2.3 Добавить поле `tv` в `middleware.UserClaims` и заполнять его при выпуске access-токена. Проверка: декодирование выпущенного токена содержит `tv`.
- [ ] 2.4 В `middleware/auth.go` сверять `tv` из claims с текущей версией пользователя; реализовать кэш `user_id → token_version` в памяти с TTL 30 секунд и инвалидацией при инкременте. Проверка: тесты «токен со старой версией → 401», «токен с актуальной версией → 200», «задержка не более 30 секунд».
- [ ] 2.5 Убедиться, что сессия инициатора смены пароля продолжает работать: выдать ей новую пару токенов в ответе. Проверка: e2e-сценарий смены пароля не выкидывает пользователя из приложения.

## 3. Refresh-токен в cookie (бэкенд, совместимый этап)

- [ ] 3.1 Добавить в `auth/handler.go` установку cookie `refresh_token` с `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` в ответах `login`, `register`, `refresh`; `Max-Age` по `remember_me`. На этом этапе продолжать возвращать `refresh_token` и в теле. Проверка: тест проверяет наличие и атрибуты `Set-Cookie`.
- [ ] 3.2 Научить `refresh` и `logout` читать токен из cookie, с падением обратно на тело запроса. Проверка: тесты на оба источника.
- [ ] 3.3 В `logout` очищать cookie. Проверка: тест на `Set-Cookie` с истёкшим `Max-Age`.

## 4. WebSocket ticket

- [ ] 4.1 Реализовать `POST /api/v1/auth/ws-ticket`: 32 байта из `crypto/rand`, хеш в `ws_tickets`, TTL 30 секунд, удаление просроченных строк при каждой выдаче. Проверка: unit-тест на непредсказуемость и срок жизни.
- [ ] 4.2 Переписать `chat/handler.go:353-372` на обмен тикета: атомарно пометить `used_at` и получить `user_id`; отклонять использованный, просроченный и любой запрос с параметром `token`. Проверка: тесты четырёх сценариев спека.
- [ ] 4.3 Обновить `useWebSocket.ts:42-53` и `WebSocketProvider.tsx:39-50`: перед подключением запросить тикет, подключаться с `?ticket=`. Проверка: `npx jest useWebSocket WebSocketProvider` зелёные, URL содержит `ticket=`.
- [ ] 4.4 Добавить ограничение частоты на `ws-ticket` и `resend-verification` в `auth_rate_limiter.go`. Проверка: тест «превышение лимита → 429, письмо не отправлено».

## 5. Маскирование логов

- [ ] 5.1 В `middleware/logger.go` добавить маскирование значений query-параметров `token`, `ticket`, `refresh_token`, `code`, `state`, `password`. Проверка: тесты двух сценариев спека.

## 6. Фронтенд: переход на cookie

- [ ] 6.1 Переписать `shared/utils/token-storage.ts`: access-токен в переменной модуля, функции refresh-токена удалены. Проверка: `npx jest token-storage`.
- [ ] 6.2 Обновить `shared/utils/api-client.ts:110-124,268-282,337-355`: `credentials: 'include'`, refresh без тела, снятие access из ответа. Проверка: `npx jest api-client` зелёные, включая сценарий очереди параллельных запросов при обновлении.
- [ ] 6.3 Добавить одноразовую миграцию: при инициализации, если в `localStorage` есть `refresh_token`, обменять его на cookie и очистить хранилище. Пометить код комментарием со сроком удаления. Проверка: тест «старое хранилище → обмен → хранилище очищено».
- [ ] 6.4 Добавить «тихий» `/auth/refresh` при инициализации приложения для восстановления сессии после перезагрузки. Проверка: e2e — перезагрузка страницы не разлогинивает.
- [ ] 6.5 Заменить 15 прямых обращений `localStorage.getItem('auth_token')` на хук сессии: `app/chat/page.tsx:30`, `app/dashboard/page.tsx:82`, `app/food-tracker/FoodTrackerPageClient.tsx:13`, `app/food-tracker/nutrient/[id]/NutrientDetailPageClient.tsx:77`, `app/profile/page.tsx:29`, `app/notifications/page.tsx:43`, `features/settings/components/SettingsPageLayout.tsx:21`, `features/dashboard/store/dashboardStore.ts:1461` и остальные. Проверка: `grep -rn "localStorage.getItem('auth_token')" apps/web/src --include=*.tsx --include=*.ts | grep -v token-storage` пусто.

## 7. Защита маршрутов

- [ ] 7.1 Создать `apps/web/src/middleware.ts`: проверка наличия refresh-cookie, редирект на `/auth?next=<path>` для защищённых путей, `matcher` со списком `/dashboard`, `/food-tracker`, `/chat`, `/profile`, `/settings/:path*`, `/notifications`, `/curator/:path*`, `/admin/:path*`, `/onboarding`. Проверка: тест middleware — защищённый путь без cookie редиректит, с cookie пропускает.
- [ ] 7.2 Удалить со страниц ручные проверки и редиректы, ставшие избыточными. Проверка: `npx jest` зелёные, e2e-сценарий «неаутентифицированный пользователь → /auth» проходит.

## 8. Ужесточение CSP

- [ ] 8.1 Генерировать nonce в `middleware.ts` и прокидывать через заголовок; передать его инлайновому скрипту в `app/layout.tsx:58`. Проверка: в HTML присутствует `nonce`, консоль браузера без ошибок CSP.
- [ ] 8.2 Обновить `deploy/nginx/burcev.team.conf:55` и `new.burcev.team.conf:55`: убрать `'unsafe-eval'`, заменить `'unsafe-inline'` на nonce, явно добавить домен Яндекс.Метрики. Проверка: на dev — приложение работает, `Content-Security-Policy` в ответе не содержит `unsafe-eval`, консоль без нарушений.
- [ ] 8.3 Проверить работу PWA и service worker при новой CSP. Проверка: установка PWA на dev, офлайн-экран открывается.

## 9. Завершение перехода

- [ ] 9.1 Задеплоить на dev, проверить: вход, перезагрузка, обновление токена, чат, выход, смена пароля с завершением сессий на втором устройстве. Проверка: чек-лист пройден вручную.
- [ ] 9.2 Задеплоить на prod, наблюдать долю `/auth/refresh` с телом запроса. Проверка: доля упала до нуля в течение суток.
- [ ] 9.3 Убрать `refresh_token` из тел ответов и приём refresh из тела запроса. Проверка: тест «тело ответа входа не содержит `refresh_token`», e2e зелёные.
- [ ] 9.4 Завести задачу на удаление кода одноразовой миграции из 6.3 через два релиза. Проверка: задача создана, в коде есть комментарий со ссылкой.
