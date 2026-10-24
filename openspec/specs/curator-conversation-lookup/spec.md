# curator-conversation-lookup Specification

## Purpose
Бэкенд — переписка по id участника. Возможность введена изменением `web-fixes-before-ios` (архив `openspec/changes/archive/2026-10-24-web-fixes-before-ios`).

## Requirements

### Requirement: Переписка по id участника

`GET /api/v1/conversations/by-participant/:userId` SHALL возвращать переписку, участниками которой являются вызывающий пользователь и `:userId`, в том же формате, что элемент `GET /conversations`. Если такой переписки нет или вызывающий в ней не участвует, ответ MUST быть `404` с кодом `not_found`.

#### Scenario: Куратор и его клиент

- **WHEN** куратор запрашивает переписку со своим клиентом
- **THEN** ответ `200` с перепиской и участником-клиентом

#### Scenario: Чужая пара

- **WHEN** клиент A запрашивает переписку с клиентом B
- **THEN** ответ `404` с кодом `not_found`

### Requirement: Маршрут зарегистрирован в матрице доступа

Маршрут SHALL быть внесён в `protectedRoutes` с защитой `participant`.

#### Scenario: Сборка без записи

- **WHEN** маршрут добавлен без записи в `protectedRoutes`
- **THEN** `go test ./internal/router/` завершается ошибкой
