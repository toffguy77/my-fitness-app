## ADDED Requirements

### Requirement: Колбэк OAuth для приложения отдаёт одноразовый код

Если поток начат с `client=ios&app_challenge=<S256>`, колбэк провайдера SHALL
после проверки state и PKCE провайдера:

1. сохранить результат входа;
2. сделать 302 на `https://<AppDomain>/auth/native-complete?code=<код>`.

Код MUST быть случайным (не менее 32 байт), одноразовым и действовать
60 секунд. Колбэк MUST NOT ставить refresh-cookie.

#### Scenario: Успешный вход через Яндекс из приложения

- **WHEN** колбэк Яндекса завершается успешно для потока с `client=ios`
- **THEN** ответ — `302` на `/auth/native-complete` с параметром `code`
- **AND** в ответе нет `Set-Cookie` с `refresh_token`

#### Scenario: Поток без `app_challenge`

- **WHEN** начат поток с `client=ios` без `app_challenge`
- **THEN** ответ `400` с кодом `validation`

### Requirement: Код обменивается только с верным verifier и один раз

`POST /api/v1/auth/native/oauth/exchange {code, code_verifier}` SHALL выдавать
результат входа, только если `BASE64URL(SHA256(code_verifier))` равен
сохранённому `app_challenge`. После первого обращения код MUST становиться
недействительным, даже если verifier не совпал.

#### Scenario: Перехваченный код без verifier

- **WHEN** код предъявлен с неверным `code_verifier`
- **THEN** ответ `401` с кодом `token_invalid`
- **AND** повторное предъявление того же кода с верным verifier тоже отклоняется

#### Scenario: Просроченный код

- **WHEN** код предъявлен через 61 секунду после выпуска
- **THEN** ответ `401` с кодом `token_invalid`

### Requirement: Незавершённый вход продолжается в приложении

Обмен SHALL вместо сессии возвращать `{status, pending_token}`, когда вход не
завершён: `needs_email` — провайдер не отдал адрес, `needs_link_confirmation` —
адрес совпал с существующим аккаунтом, `needs_consents` — вход создал бы новый
аккаунт. Продолжения
`POST /api/v1/auth/native/oauth/email` и `/native/oauth/link` MUST принимать
`pending_token` из тела и при успехе возвращать нативную пару токенов.

#### Scenario: Новый пользователь VK

- **WHEN** обмен выполняется для адреса, которого нет среди аккаунтов
- **THEN** ответ — `needs_consents` с `pending_token`
- **AND** `native/consents` с обязательными согласиями создаёт аккаунт и сохраняет согласия

#### Scenario: Аккаунт уже существует

- **WHEN** адрес из VK совпадает с аккаунтом, у которого есть пароль
- **THEN** обмен возвращает `needs_link_confirmation` и `pending_token`
- **AND** `native/oauth/link {pending_token, password}` с верным паролем возвращает пару токенов и привязывает VK
