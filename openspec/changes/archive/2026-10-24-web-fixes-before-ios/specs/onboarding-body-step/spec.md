## ADDED Requirements

### Requirement: Текущий вес из онбординга — замер

Шаг «Тело и цели» онбординга SHALL сохранять «Текущий вес» как замер веса за сегодня (`POST /api/v1/dashboard/daily`, тип `weight`) и MUST NOT отправлять его как `target_weight`.

#### Scenario: Ввод текущего веса

- **WHEN** клиент вводит в онбординге текущий вес 78,4 кг и нажимает «Завершить»
- **THEN** отправлен `POST /dashboard/daily` с `metric {type: "weight", data: {weight: 78.4}}`
- **AND** запрос `PUT /users/settings` не содержит `target_weight`

#### Scenario: Вес не введён

- **WHEN** поле «Текущий вес» пустое
- **THEN** замер веса не отправляется
