## 1. Данные и конфигурация

- [x] 1.1 Выбрать номер миграции. Посмотреть `SELECT max(version) FROM schema_migrations` на dev и проде; номер должен быть больше обоих. Проверка: номер записан в описании PR и не совпадает ни с одним в базах.
- [x] 1.2 Миграция:
  - `refresh_tokens.client_kind TEXT NOT NULL DEFAULT 'web'` с CHECK `('web','ios')`;
  - `refresh_tokens.device_name TEXT`;
  - таблица `oauth_handoff_codes` (`code_hash`, `app_challenge`, `result jsonb`, `expires_at`, `used_at`);
  - для Apple — `external_identities.provider_refresh_token_enc`.

  Проверка: `go test ./internal/shared/database/...` применяет up и down на чистой базе.
- [x] 1.3 `config.Load()`: переменные `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `IOS_MIN_SUPPORTED_VERSION`, возможность `apple_sign_in` в `config.Features`; описать в `apps/api/.env.example`. Проверка: тест конфигурации — неверный формат версии в проде даёт ошибку с именем переменной.

## 2. Нативная сессия

- [x] 2.1 `createRefreshToken` (`modules/auth/service.go:704`) принимает вид клиента и срок; нативный — 90 дней. Проверка: юнит-тест на срок и `client_kind`.
- [x] 2.2 Обработчики `native/login`, `native/register`, `native/refresh`, `native/logout` (с `device_token`, без access-токена), `native/magic-link/request`, `native/magic-link/consume`, `native/change-password`; `pending_deletion` вместе с парой токенов в `modules/auth/handler.go`: не вызывают `setRefreshCookie`, не читают cookie. Проверка: `native_session_test.go` покрывает сценарии `native-client-session` — нет `Set-Cookie`, cookie без тела даёт `400 validation`, повтор после ротации даёт `session_ended`.
- [x] 2.3 Тест независимости от `bodyRefreshSunset`. Проверка: тест подменяет текущее время на 2026-12-01 и проходит.
- [x] 2.4 Маскирование новых полей в журнале запросов. Проверка: тест журнала для `native/refresh` и `native/apple`.
- [x] 2.5 Лимит по ключу «email+IP» с потолком на IP, 60 обновлений за 15 минут на refresh-токен, `Retry-After` (`middleware/auth_rate_limiter.go`). Проверка: тест «два адреса за одним IP» и тест заголовка.
- [x] 2.6 Маршруты в `internal/router/auth.go`; `UPDATE_GOLDEN=1 go test ./internal/router/`, просмотреть diff `routes.golden`. Проверка: `go test ./internal/router/` зелёный, `node scripts/check-api-contract.mjs` зелёный.

## 3. Sign in with Apple

- [x] 3.1 Адаптер `oauth/apple.go`: JWKS с кэшем на час и перечитыванием по неизвестному `kid` не чаще раза в минуту; проверка `iss`, `aud`, `exp`, `nonce`, `email_verified`. Проверка: `apple_test.go` на подписанных тестовым ключом токенах — каждый сценарий `apple-sign-in`.
- [x] 3.2 Обмен `authorization_code` на refresh Apple (client secret — ES256 JWT из `APPLE_PRIVATE_KEY`), хранение в зашифрованном виде. Проверка: тест со заглушкой `appleid.apple.com/auth/token`.
- [x] 3.3 `POST /auth/native/apple` и общий `POST /auth/native/consents`: новый аккаунт создаётся только после согласий, куратор — через общий поток (живому нет, служебному — служебный); то же для Яндекса и VK (`needs_consents`). Новый код ошибки `consents_required` в `apperrors/codes.go` и его текст в словарях веба. Проверка: `TestEveryAccountPathAssignsCuratorOnlyToServiceAccounts` расширен путём Apple; тест «нет согласий» (`TestNativeConsentsWithoutMandatoryConsents`).
- [x] 3.4 Отзыв при удалении: шаг в `modules/account` и фоновая задача повтора. Проверка: тест со заглушкой — ошибка сети ставит задачу, аккаунт удалён.
- [x] 3.5 Привязка и отвязка Apple в `providers/linked`. Проверка: тест «последний способ входа» → `409 provider_only_way_in`.

## 4. Нативный OAuth

- [x] 4.1 Старт `GET /auth/oauth/:provider?client=ios&app_challenge=` сохраняет признак и challenge рядом со state. Проверка: тест «без `app_challenge` → 400».
- [x] 4.2 Ветка колбэка (`oauth_handler.go:143`, `:325`) создаёт одноразовый код на 60 с и уводит на `/auth/native-complete?code=`. Проверка: тест — 302, нет refresh-cookie.
- [x] 4.3 `POST /auth/native/oauth/exchange`, `native/oauth/email`, `native/oauth/link`. Проверка: тесты «неверный verifier сжигает код», «просрочка», `needs_link_confirmation`.
- [x] 4.4 Регресс веба. Проверка: существующие `oauth_test.go` проходят без изменений; e2e входа через провайдера (заглушка) зелёный.

## 5. Ссылки и конфигурация клиентов

- [x] 5.1 `apps/web/src/app/.well-known/apple-app-site-association/route.ts`: JSON из переменных, 404 без них. Проверка: юнит-тест обработчика; `curl -sI https://new.burcev.team/.well-known/apple-app-site-association` — `200`, `application/json`, без `Location`.
- [x] 5.2 Маршрутизация прода (Traefik в Dokploy; nginx-конфигурация, если используется): путь проходит в Next без редиректа и кэша. Проверка: тот же `curl` на dev после выката.
- [x] 5.3 Страница `/auth/native-complete` в вебе для случая, когда приложения нет: «Откройте приложение Взвешено» и ссылка на вход в вебе. Проверка: e2e открывает страницу и видит текст.
- [x] 5.4 `GET /api/v1/config` с общим построителем `features` (`router/router.go:221`). Проверка: тест «база недоступна → `/ready` 503, `/config` 200»; тест совпадения `features`.

## 6. Документация и выкат

- [x] 6.1 `docs/user-guide/` — вход через Apple и в приложении; `make sync-knowledge`. Проверка: `TestKnowledgeMatchesUserGuide` зелёный.
- [x] 6.2 Apple Developer → Private Email Relay: зарегистрировать домен и адрес отправителя писем. Проверка: письмо со ссылкой для входа доходит на тестовый адрес `@privaterelay.appleid.com`.
- [x] 6.3 Секреты Apple в Dokploy для dev, выкат на dev. Проверка: `https://app-site-association.cdn-apple.com/a/v1/new.burcev.team` отдаёт наш JSON; вход через Apple из сборки TestFlight создаёт аккаунт.
