## ADDED Requirements

### Requirement: Apple — провайдер общего потока

Провайдер `apple` SHALL отдавать тот же нормализованный профиль, что Яндекс
и VK, но получает его не переходом браузера и колбэком, а identity token'ом в
теле `POST /api/v1/auth/native/apple` (адаптер `oauth.Apple`: `Name` и
`Authenticate` вместо `AuthorizationURL` и `Exchange`, — вход через Apple в
вебе в это изменение не входит). Регистрация через согласия, привязка,
отвязка, правило подтверждения владения адресом и выпуск токенов MUST
проходить через общий поток без отдельных веток для Apple. Привязка к
аккаунту, в который уже вошли, — `POST /api/v1/auth/native/apple/link` с
access-токеном; отвязка — общий `DELETE /api/v1/auth/providers/apple`.
Провайдер без `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`, `APPLE_KEY_ID`,
`APPLE_PRIVATE_KEY` и `APPLE_TOKEN_ENCRYPTION_KEY` MUST считаться выключенным;
настроенный провайдер `GET /api/v1/auth/providers` SHALL перечислять, а
веб-кнопки входа и привязки для него MUST NOT показываться.

#### Scenario: Привязка Apple к существующему аккаунту

- **WHEN** пользователь с паролем привязывает Apple в «Способах входа»
- **THEN** `GET /api/v1/auth/providers/linked` перечисляет `apple`

#### Scenario: Отвязка последнего способа входа

- **WHEN** пользователь без пароля, у которого привязан только Apple, отвязывает Apple
- **THEN** ответ `409` с кодом `provider_only_way_in`, привязка сохраняется

#### Scenario: Провайдер не настроен

- **WHEN** ключи Apple не заданы
- **THEN** `GET /api/v1/auth/providers` не перечисляет `apple`
- **AND** `POST /api/v1/auth/native/apple` отвечает `503` с кодом `feature_unavailable`

### Requirement: Нативное завершение не меняет веб-поток

Поток OAuth без `client=ios` SHALL завершаться как прежде: refresh-cookie и
302 на `/auth/complete`.

#### Scenario: Вход через Яндекс в браузере

- **WHEN** колбэк Яндекса завершается для потока без `client`
- **THEN** ответ ставит refresh-cookie и уводит на `/auth/complete`
