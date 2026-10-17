## ADDED Requirements

### Requirement: Apple — провайдер общего потока

Провайдер `apple` SHALL реализовывать тот же интерфейс адаптера, что Яндекс и
VK. Регистрация, привязка, отвязка, правило подтверждения владения адресом и
выпуск токенов MUST проходить через общий поток без отдельных веток для Apple.
Провайдер без `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`, `APPLE_KEY_ID` и
`APPLE_PRIVATE_KEY` MUST считаться выключенным.

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
