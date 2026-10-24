## ADDED Requirements

### Requirement: Публичная конфигурация для клиентов

`GET /api/v1/config` SHALL без авторизации отвечать
`{features, ios: {min_supported_version}, support_url, legal: {terms_url, privacy_url}}`
с заголовком `Cache-Control: no-store`. Поле `features` MUST строиться тем же
кодом, что и `features` в `/ready`.

#### Scenario: Возможность выключена

- **WHEN** распознавание еды не настроено
- **THEN** `features.food_recognition` в `/config` равно `false`
- **AND** то же значение отдаёт `/ready`

### Requirement: Конфигурация не зависит от базы данных

`GET /api/v1/config` SHALL отвечать `200`, даже когда проверка базы в `/ready`
не проходит.

#### Scenario: База недоступна

- **WHEN** соединение с базой разорвано
- **THEN** `/ready` отвечает `503`
- **AND** `/config` отвечает `200` с прежними значениями

### Requirement: Минимальная версия приложения задаётся конфигурацией

`ios.min_supported_version` SHALL браться из `IOS_MIN_SUPPORTED_VERSION` в
формате `MAJOR.MINOR.PATCH`. Без переменной поле MUST равняться `0.0.0`.
Значение в неверном формате MUST останавливать старт в проде с сообщением о
переменной.

#### Scenario: Неверный формат

- **WHEN** `IOS_MIN_SUPPORTED_VERSION=1.2` в проде
- **THEN** `config.Load()` возвращает ошибку с именем переменной
