## Why

Приложение хранит и access-, и refresh-токен в `localStorage` (`apps/web/src/shared/utils/token-storage.ts:6,37`). При этом CSP в `deploy/nginx/burcev.team.conf:55` разрешает `script-src 'unsafe-inline' 'unsafe-eval'`, то есть XSS не блокируется на уровне политики. В такой конфигурации любая инъекция скрипта даёт злоумышленнику бессрочный доступ: refresh-токен читается из JS и ротируется сколько угодно долго. Для приложения с данными о здоровье, весе и фотографиями тела это неприемлемый профиль риска.

Три сопутствующие дыры того же контура:

1. **Токен в URL.** WebSocket подключается как `/ws?token=<jwt>` (`apps/web/src/features/chat/hooks/useWebSocket.ts:53`), а `apps/api/internal/shared/middleware/logger.go` пишет `fields["query"] = query` для всех запросов. Access-токены оседают в логах приложения и nginx в открытом виде.
2. **Сброс пароля не завершает чужие сессии.** `apps/api/internal/modules/auth/reset_service.go:378-392` — `InvalidateUserSessions` пустая заглушка, которая при этом логирует `"User sessions invalidated"`. Рабочий `revokeAllUserRefreshTokens` (`auth/service.go:476`) вызывается только при детекции переиспользования токена. Угнанный refresh-токен переживает смену пароля жертвой.
3. **Защита роутов на клиенте пофайлово.** `middleware.ts` отсутствует; 15 страниц самостоятельно читают `localStorage.getItem('auth_token')` мимо `token-storage`. Каждый новый экран нужно вручную не забыть закрыть.

## What Changes

- **BREAKING (клиент-сервер):** refresh-токен переезжает из `localStorage` в cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. Ответы `/auth/login`, `/auth/register`, `/auth/refresh` перестают возвращать `refresh_token` в теле; `/auth/logout` очищает cookie.
- Access-токен перестаёт попадать в `localStorage` и хранится только в памяти модуля `token-storage`. После перезагрузки страницы он восстанавливается «тихим» вызовом `/auth/refresh` по cookie.
- WebSocket авторизуется одноразовым ticket: новый `POST /api/v1/auth/ws-ticket` выдаёт непредсказуемый токен со сроком жизни 30 секунд и однократным использованием; `/ws` принимает `?ticket=`, а не `?token=`.
- Логгер запросов маскирует чувствительные параметры query (`token`, `ticket`, `code`, `state`) перед записью.
- `InvalidateUserSessions` перестаёт быть заглушкой: сброс пароля и смена пароля отзывают все refresh-токены пользователя. Введён `token_version` в `users` — активные access-токены пользователя тоже становятся недействительными, не дожидаясь истечения.
- Добавлен `apps/web/src/middleware.ts` — единая точка проверки признака сессии для защищённых путей; ручные проверки `localStorage` на страницах удаляются.
- Прямые обращения к `localStorage` за токеном вне `token-storage.ts` удаляются (15 мест).
- CSP ужесточается: `script-src` без `'unsafe-eval'`, `'unsafe-inline'` заменяется на nonce.
- `POST /auth/resend-verification` получает ограничение частоты (сейчас его нет, а эндпоинт шлёт письма с боевого SMTP).

## Capabilities

### New Capabilities

- `token-lifecycle`: где живут access- и refresh-токен, как они выдаются, обновляются и передаются в WebSocket; что запрещено писать в логи.
- `session-revocation`: при каких событиях сессии пользователя становятся недействительными и как это проверяется на каждом запросе.

### Modified Capabilities

<!-- Существующих спеков на аутентификацию нет -->

## Impact

**Бэкенд:**
- `apps/api/internal/modules/auth/handler.go` — выдача и очистка cookie, новый `WSTicket`, ответы без `refresh_token` в теле.
- `apps/api/internal/modules/auth/service.go:436-484` — чтение refresh-токена из cookie, отзыв всех токенов пользователя.
- `apps/api/internal/modules/auth/reset_service.go:378-392` — реальная реализация `InvalidateUserSessions`.
- `apps/api/internal/shared/middleware/auth.go` — сверка `token_version` из claims с БД.
- `apps/api/internal/shared/middleware/logger.go:26` — маскирование query.
- `apps/api/internal/modules/chat/handler.go:353-372` — приём `ticket` вместо `token`.
- `apps/api/internal/shared/middleware/auth_rate_limiter.go` — ограничение для `resend-verification` и `ws-ticket`.
- Новая миграция `045_add_token_version_and_ws_tickets` — колонка `users.token_version`, таблица `ws_tickets`.

**Фронтенд:**
- `apps/web/src/shared/utils/token-storage.ts` — access в памяти, refresh не хранится.
- `apps/web/src/shared/utils/api-client.ts:110-124,268-282,337-355` — `credentials: 'include'`, refresh без тела.
- `apps/web/src/middleware.ts` — новый файл.
- `apps/web/src/features/chat/hooks/useWebSocket.ts:53` и `components/WebSocketProvider.tsx:50` — получение ticket перед подключением.
- 15 страниц с прямым чтением `localStorage` — переход на хук сессии.

**Инфраструктура:**
- `deploy/nginx/*.conf:55` — ужесточение CSP, проброс cookie.

**Зависимости:** новых нет.

**Порядок:** мержить после `fix-authorization-gaps` (общие правки в регистрации роутов) и вместе с `enforce-password-policy` (смена пароля должна отзывать сессии).
