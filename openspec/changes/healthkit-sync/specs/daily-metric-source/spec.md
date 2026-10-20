## ADDED Requirements

### Requirement: У метрик дня есть источник

Шаги, вес и тренировка дня SHALL храниться с источником `manual` или `healthkit`. `GET /api/v1/dashboard/daily/:date` и каждый день `GET /api/v1/dashboard/week` MUST отдавать `steps_source`, `weight_source` и `workout_source` (`null`, если значения нет). `GET /api/v1/curator/clients/:id` MUST отдавать те же три поля и `weight` у каждого элемента `days`, `source` у точек `weight_history` и `last_weight_source`; список `GET /api/v1/curator/clients` — `last_weight_source` у карточки.

#### Scenario: Источник у куратора

- **WHEN** у клиента сегодня вес 78,4 и шаги из Здоровья, а тренировка введена вручную
- **THEN** карточка в списке и `GET /curator/clients/:id` отдают `last_weight_source: "healthkit"`
- **AND** у сегодняшнего дня `steps_source: "healthkit"`, `weight_source: "healthkit"`, `workout_source: "manual"`, у дня без шагов `steps_source: null`

#### Scenario: Шаги из Здоровья

- **WHEN** шаги за дату пришли импортом
- **THEN** ответ дня содержит `steps_source: "healthkit"`

### Requirement: Ручной ввод главнее импорта

`POST /api/v1/dashboard/daily` SHALL сохранять значение с источником `manual` при любом текущем источнике. Импорт MUST NOT изменять метрику даты с источником `manual`.

#### Scenario: Клиент исправил шаги руками

- **WHEN** клиент ввёл 8 000 шагов вручную, а затем импорт прислал 6 412 за ту же дату
- **THEN** у даты 8 000 шагов с источником `manual`
- **AND** `accepted` импорта учитывает запись, хотя значение не изменилось

Очищенное вручную значение (0 шагов, снятая отметка тренировки) SHALL оставаться без источника, чтобы следующий импорт за эту дату мог его вернуть. Ручной ввод одной метрики MUST NOT менять источник остальных.

#### Scenario: Очищенное значение возвращает импорт

- **WHEN** клиент ввёл 8 000 шагов, затем 0, а затем импорт прислал 6 412 за ту же дату
- **THEN** у даты 6 412 шагов с источником `healthkit`

#### Scenario: Импорт перед ручным вводом

- **WHEN** импорт записал вес 78,4, а клиент затем ввёл 78,1 вручную
- **THEN** у даты вес 78,1 с источником `manual`

### Requirement: Существующие значения считаются ручными

Миграция SHALL присвоить источник `manual` всем уже сохранённым непустым значениям шагов, веса и тренировки.

#### Scenario: Данные до изменения

- **WHEN** у даты был вес 80,0 до миграции
- **THEN** после миграции `weight_source` равен `manual`
