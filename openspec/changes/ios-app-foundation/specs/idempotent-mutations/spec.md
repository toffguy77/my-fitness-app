## ADDED Requirements

### Requirement: Повтор с тем же ключом возвращает первый ответ

Для `POST /api/v1/food-tracker/entries`, `PUT` и `DELETE /api/v1/food-tracker/entries/:id`, `POST /api/v1/food-tracker/water`, `POST /api/v1/dashboard/daily`, `POST /api/v1/dashboard/tasks/:id/complete` и `POST /api/v1/conversations/:id/messages` сервер SHALL сохранять ответ на запрос с заголовком `Idempotency-Key` на 24 часа и на повтор с тем же ключом, пользователем, методом, путём и телом MUST возвращать сохранённый ответ с заголовком `Idempotent-Replayed: true`, не выполняя действие снова.

#### Scenario: Двойная отправка записи еды

- **WHEN** один и тот же `POST /food-tracker/entries` с одним ключом отправлен дважды
- **THEN** создана одна запись
- **AND** второй ответ совпадает с первым и содержит `Idempotent-Replayed: true`

### Requirement: Тот же ключ с другим телом отклоняется

Повтор с тем же ключом и отличающимся телом SHALL отклоняться с `422` и кодом `conflict`.

#### Scenario: Ключ использован для другой еды

- **WHEN** ключ, уже использованный для записи «Овсянка», приходит с телом «Гречка»
- **THEN** ответ `422` с кодом `conflict`, новая запись не создана

### Requirement: Без ключа поведение не меняется

Запрос без заголовка `Idempotency-Key` SHALL обрабатываться как прежде. Ключ одного пользователя MUST NOT влиять на запросы другого.

#### Scenario: Запрос из веба

- **WHEN** веб отправляет `POST /food-tracker/entries` без заголовка
- **THEN** запись создаётся, таблица ключей не меняется
