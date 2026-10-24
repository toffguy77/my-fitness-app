## Why

iOS-приложению «Взвешено» нужна сессия, которая переживает перезапуск и
хранится в Keychain. Сейчас refresh-токен существует только в HttpOnly-cookie:
- `LoginResult.RefreshToken` с тегом `json:"-"`;
- приём токена из тела запроса снимается 1 ноября 2026 (`bodyRefreshSunset`);
- без «запомнить меня» cookie сессионная.

Вход через Яндекс и VK заканчивается веб-страницей `/auth/complete`, до
приложения он не доходит. Sign in with Apple нет, а App Store требует его,
раз есть сторонние входы (Guideline 4.8). Ссылки из писем открывают сайт, а
не приложение: `apple-app-site-association` не отдаётся.

## What Changes

- Группа эндпоинтов `/api/v1/auth/native/*` для нативных клиентов:
  - вход, регистрация, обновление, выход, запрос и вход по ссылке из письма,
    смена пароля, согласия нового аккаунта;
  - refresh-токен отдаётся и принимается **только в теле**, cookie не читаются
    и не ставятся.
- Нативная сессия живёт 90 дней со скользящим окном. Ротация и обнаружение
  повторного использования — как у веба.
- Sign in with Apple: `POST /api/v1/auth/native/apple` проверяет identity
  token по ключам Apple, создаёт или находит аккаунт, отзывает токен Apple при
  удалении аккаунта.
- Нативный OAuth для Яндекса и VK: старт с `client=ios` и PKCE-вызовом
  приложения. Колбэк уводит на universal link с одноразовым кодом, код
  обменивается на сессию в `POST /api/v1/auth/native/oauth/exchange`.
- `/.well-known/apple-app-site-association`:
  - `applinks` на ссылки входа (`/auth/link/consume`, `/auth/native-complete`,
    `/reset-password`), статьи (`/content/*`) и экраны, на которые ведут письма
    и уведомления (`/dashboard`, `/food-tracker`, `/chat`, `/notifications`, `/curator/*`);
  - `webcredentials` для автозаполнения паролей.
- `GET /api/v1/config` (публичный): включённые возможности, минимальная
  поддерживаемая версия iOS-приложения, адрес поддержки, ссылки на документы.
- Ограничение частоты входа для нативных клиентов — по паре «адрес почты + IP»,
  а не по одному IP: пользователи за одним мобильным NAT не блокируют друг друга.
- Веб-сессия не меняется. Снятие приёма refresh из тела на веб-эндпоинтах
  (задача 9.3 `secure-token-lifecycle`) остаётся в силе.

## Capabilities

### New Capabilities
- `native-client-session`: сессия нативного приложения — выдача, хранение, обновление, отзыв, отказ от cookie.
- `apple-sign-in`: вход и регистрация через Apple, привязка, отзыв при удалении аккаунта.
- `native-oauth-handoff`: передача результата OAuth Яндекса и VK в приложение одноразовым кодом.
- `app-links`: apple-app-site-association и правила, какие адреса открывает приложение.
- `client-config`: публичная конфигурация для клиентов — возможности, минимальная версия, адреса.

### Modified Capabilities
- `external-identity`: добавляется провайдер Apple и нативное завершение потока; общий поток создания аккаунта и выпуска токенов не меняется.

## Impact

**Бэкенд**
- `apps/api/internal/router/auth.go` — новая группа `/auth/native/*`, маршрут `apple`, `oauth/exchange`.
- `apps/api/internal/modules/auth/handler.go`:
  - `:154-159` — новые структуры запросов (рядом с `RefreshRequest`);
  - `:195-209` — `setRefreshCookie`, нативные обработчики его **не** вызывают;
  - `:306` — `ConsumeMagicLink`, нативный двойник;
  - `:395` — `Login`;
  - `:420` — `Refresh`.
- `apps/api/internal/modules/auth/service.go:158-165` — `LoginResult` получает внутреннее поле срока сессии; `createRefreshToken` (`:705`) — параметр вида клиента и TTL.
- `apps/api/internal/modules/auth/oauth_handler.go`:
  - `:143` — `Callback`;
  - `:313` — `redirectToApp`, ветка `client=ios`.
- `apps/api/internal/modules/auth/oauth/` — новый адаптер `apple.go` (проверка JWT по JWKS, отзыв).
- `apps/api/internal/modules/auth/refresh_body_test.go:62` — `bodyRefreshSunset` не трогаем; добавляется тест, что нативный refresh от sunset не зависит.
- `apps/api/internal/shared/middleware/auth_rate_limiter.go` — ключ «email+IP» для нативного входа.
- `apps/api/internal/modules/account/` — удаление аккаунта вызывает отзыв токена Apple.
- `apps/api/internal/router/router.go:221` — флаги `features` переезжают в общий построитель для `/ready` и `/config`.
- `apps/api/internal/router/testdata/routes.golden`, `authorization_matrix_test.go` — новые маршруты.
- Миграция:
  - `refresh_tokens.client_kind`, `refresh_tokens.device_name`;
  - таблица `oauth_handoff_codes`;
  - номер выбирается по `schema_migrations` dev и прода; на ветке последний — `091`.
- Конфигурация (`apps/api/.env.example`): `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `IOS_MIN_SUPPORTED_VERSION`.

**Веб**
- `apps/web/src/app/.well-known/apple-app-site-association/route.ts` — новый обработчик (`application/json`, без редиректа).
- `scripts/check-api-contract.mjs` — проверяет и новые пути.

**Инфраструктура**
- Маршрутизация прода (Traefik в Dokploy; `deploy/nginx/burcev.team.conf:132`, если конфигурация ещё используется) — `/.well-known/apple-app-site-association` проходит в Next без редиректа и кэша.
- Dokploy: секреты Apple.
- Apple Developer → Private Email Relay: регистрация домена и адреса отправителя писем, иначе письма на скрытые адреса Apple не доходят.

**Документация**
- `docs/user-guide/` — вход через Apple; `make sync-knowledge`.
