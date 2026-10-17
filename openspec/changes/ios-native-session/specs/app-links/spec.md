## ADDED Requirements

### Requirement: Сайт отдаёт apple-app-site-association

`GET https://<AppDomain>/.well-known/apple-app-site-association` SHALL:

- отвечать `200`, `Content-Type: application/json`, без редиректа;
- отдавать JSON с `applinks.details[].appIDs = ["<APPLE_TEAM_ID>.<APPLE_BUNDLE_ID>"]`;
- отдавать `webcredentials.apps` с тем же идентификатором.

Если `APPLE_TEAM_ID` или `APPLE_BUNDLE_ID` не заданы, ответ MUST быть `404`.

#### Scenario: Запрос от Apple

- **WHEN** запрашивается `/.well-known/apple-app-site-association`
- **THEN** ответ `200` с типом `application/json`
- **AND** тело разбирается как JSON и содержит идентификатор приложения из конфигурации

#### Scenario: Приложение не настроено

- **WHEN** переменные Apple не заданы
- **THEN** ответ `404`

### Requirement: Приложение открывает только перечисленные адреса

`applinks.details[].components` SHALL включать пути:

- `/auth/link/consume*`, `/auth/native-complete*`, `/reset-password*`;
- `/content/*`, `/dashboard*`, `/food-tracker*`, `/chat*`, `/notifications*`, `/curator/*`.

Пути `/api/*` и `/unsubscribe*` MUST быть исключены (`"exclude": true`).

#### Scenario: Ссылка отписки из письма

- **WHEN** проверяются компоненты AASA
- **THEN** `/unsubscribe` помечен исключением
- **AND** `/auth/link/consume` присутствует в списке открываемых
