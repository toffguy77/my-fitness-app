## ADDED Requirements

### Requirement: Identity token Apple проверяется полностью

`POST /api/v1/auth/native/apple` SHALL принимать `identity_token` только при
выполнении всех условий:

- подпись проверена ключом из `https://appleid.apple.com/auth/keys` по `kid`;
- `iss` равен `https://appleid.apple.com`;
- `aud` равен настроенному `APPLE_BUNDLE_ID`;
- срок `exp` не истёк;
- `nonce` равен SHA-256 от переданного `nonce`: приложение генерирует случайный
  исходный nonce, кладёт в `ASAuthorizationAppleIDRequest.nonce` его SHA-256
  в виде шестнадцатеричной строки строчными буквами и передаёт серверу
  исходное значение; Apple копирует nonce запроса в токен без изменений;
- `authorization_code` принят `https://appleid.apple.com/auth/token`
  (client secret — ES256 JWT с `kid = APPLE_KEY_ID`, `iss = APPLE_TEAM_ID`,
  `sub = APPLE_BUNDLE_ID`, `aud = https://appleid.apple.com`); полученный
  refresh-токен Apple хранится зашифрованным AES-256-GCM ключом
  `APPLE_TOKEN_ENCRYPTION_KEY`.

При нарушении любого условия запрос MUST отклоняться с `401` и кодом
`token_invalid`. Адрес из токена используется, только если
`email_verified` истинно (Apple отдаёт его и логическим значением, и строкой
`"true"`); адрес Private Relay (`@privaterelay.appleid.com`) Apple
подтверждает сама. Без подтверждённого адреса ответ — `needs_email`.
Совпадение адреса с существующим аккаунтом SHALL отвечать
`{status: "needs_link_confirmation", pending_token, email}`, и вход
продолжается `POST /api/v1/auth/native/oauth/link` с паролем этого аккаунта.

#### Scenario: Чужая аудитория

- **WHEN** передан правильно подписанный токен с `aud` другого приложения
- **THEN** ответ `401` с кодом `token_invalid`
- **AND** аккаунт не создан

#### Scenario: Подменённый nonce

- **WHEN** `nonce` в запросе не соответствует хэшу в токене
- **THEN** ответ `401` с кодом `token_invalid`

#### Scenario: Неизвестный ключ подписи

- **WHEN** `kid` токена отсутствует в кэше ключей
- **THEN** набор ключей перечитывается не чаще раза в минуту и проверка повторяется по свежему набору

### Requirement: Первый вход через Apple ждёт согласий

Сервер SHALL, если `sub` Apple не привязан ни к одному аккаунту, а адрес из
токена не совпадает с существующим, не создавать аккаунт, а отвечать
`{status: "needs_consents", pending_token}`. `POST /api/v1/auth/native/consents
{pending_token, consents}` с обязательными согласиями MUST создавать аккаунт с
подтверждённым адресом, именем из `full_name` (если передано), сохранёнными
согласиями и назначенным куратором; без обязательных согласий — `400` с кодом
`consents_required`.

#### Scenario: Новый пользователь со скрытым адресом

- **WHEN** приходит токен с адресом `…@privaterelay.appleid.com` и `email_verified=true` от неизвестного `sub`
- **THEN** ответ — `needs_consents` с `pending_token`, аккаунт не создан
- **AND** `native/consents` с обязательными согласиями создаёт аккаунт с этим адресом, помеченным подтверждённым, и возвращает пару токенов с `created: true`

#### Scenario: Нет согласий

- **WHEN** `native/consents` вызван без согласия на обработку персональных данных
- **THEN** ответ `400` с кодом `consents_required`, аккаунт не создан

### Requirement: Повторный вход находит аккаунт по `sub`

При совпадении `sub` с привязкой провайдера `apple` сервер SHALL выдавать
сессию этого аккаунта, даже если адрес в токене изменился.

#### Scenario: Пользователь сменил адрес пересылки

- **WHEN** привязанный пользователь входит с новым скрытым адресом
- **THEN** выдаётся сессия того же аккаунта

### Requirement: Удаление аккаунта отзывает токен Apple

При необратимом удалении аккаунта с привязкой `apple` сервер SHALL вызывать
`https://appleid.apple.com/auth/revoke` с сохранённым refresh-токеном Apple.
Неудачный отзыв MUST повторяться фоновой задачей и MUST NOT отменять удаление.
Токен MUST попадать в очередь отзыва (`apple_token_revocations`) в той же
транзакции, что удаляет привязку, — до её удаления; задача
`auth.apple-revoke-retry` повторяет неудачи с отсрочкой от минуты, удваивая
её, не больше суток. Отвязка Apple отзывает токен тем же способом.

#### Scenario: Отзыв при удалении

- **WHEN** выполняется необратимое удаление аккаунта, привязанного к Apple
- **THEN** в Apple отправлен запрос отзыва с токеном этого аккаунта

#### Scenario: Apple недоступна

- **WHEN** запрос отзыва завершился ошибкой сети
- **THEN** аккаунт удалён
- **AND** в очереди фоновых задач есть задача повторить отзыв

#### Scenario: Совпадение адреса с существующим аккаунтом

- **WHEN** адрес из токена принадлежит аккаунту с паролем, а `sub` не привязан
- **THEN** ответ — `needs_link_confirmation` с `pending_token`
- **AND** `native/oauth/link` с верным паролем возвращает пару токенов и привязывает Apple
