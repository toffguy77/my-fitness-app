## ADDED Requirements

### Requirement: Приложение собирается и тестируется в CI

Задача `ios` в `.github/workflows/ci.yml` SHALL запускаться при изменениях в `apps/ios/**` или `packages/design-tokens/**`, генерировать проект XcodeGen, выполнять `swiftlint --strict` и `xcodebuild test` на симуляторе iPhone; падение любого шага MUST помечать задачу неуспешной.

#### Scenario: Изменение токенов

- **WHEN** в pull request меняется `packages/design-tokens/tokens/semantic/light.json`
- **THEN** задача `ios` запускается и собирает приложение с новыми токенами

#### Scenario: Изменение только веба

- **WHEN** pull request меняет только `apps/web/**`
- **THEN** задача `ios` не запускается

### Requirement: Новая проверка не меняет обязательные

Добавление задачи `ios` SHALL оставлять имена существующих задач без изменений.

#### Scenario: Сравнение имён задач

- **WHEN** тест охранников CI сравнивает имена задач с обязательными проверками
- **THEN** `CI Pipeline`, `Performance Analysis`, `Comprehensive Security Scan`, `Container Security Scan` по-прежнему существуют
