## ADDED Requirements

### Requirement: У метрик дня есть источник

Шаги, вес и тренировка дня SHALL храниться с источником `manual` или `healthkit`. `GET /api/v1/dashboard/daily/:date`, `GET /api/v1/dashboard/week` и `GET /api/v1/curator/clients/:id` MUST отдавать `steps_source`, `weight_source` и `workout_source` (`null`, если значения нет).

#### Scenario: Шаги из Здоровья

- **WHEN** шаги за дату пришли импортом
- **THEN** ответ дня содержит `steps_source: "healthkit"`

### Requirement: Ручной ввод главнее импорта

`POST /api/v1/dashboard/daily` SHALL сохранять значение с источником `manual` при любом текущем источнике. Импорт MUST NOT изменять метрику даты с источником `manual`.

#### Scenario: Клиент исправил шаги руками

- **WHEN** клиент ввёл 8 000 шагов вручную, а затем импорт прислал 6 412 за ту же дату
- **THEN** у даты 8 000 шагов с источником `manual`
- **AND** `accepted` импорта учитывает запись, хотя значение не изменилось

#### Scenario: Импорт перед ручным вводом

- **WHEN** импорт записал вес 78,4, а клиент затем ввёл 78,1 вручную
- **THEN** у даты вес 78,1 с источником `manual`

### Requirement: Существующие значения считаются ручными

Миграция SHALL присвоить источник `manual` всем уже сохранённым непустым значениям шагов, веса и тренировки.

#### Scenario: Данные до изменения

- **WHEN** у даты был вес 80,0 до миграции
- **THEN** после миграции `weight_source` равен `manual`
