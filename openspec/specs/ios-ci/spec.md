# ios-ci Specification

## Purpose
Сборка и тесты приложения в CI. Возможность введена изменением `ios-app-foundation` (архив `openspec/changes/archive/2026-10-24-ios-app-foundation`).

## Requirements

### Requirement: Приложение собирается и тестируется в CI

Задача `ios` в отдельном файле `.github/workflows/ios.yml` (не в `ci.yml`, чьи имена задач — договор обязательных проверок) SHALL запускаться при изменениях в `apps/ios/**`, `packages/design-tokens/**` или самом файле, генерировать проект XcodeGen, выполнять `swiftlint --strict` и `xcodebuild test -scheme Vzvesheno-Dev` на симуляторе iPhone, кэшировать SwiftPM и DerivedData и всегда выкладывать снапшоты (`**/__Snapshots__/**`) и `.xcresult` артефактами; падение любого шага MUST помечать задачу неуспешной.

#### Scenario: Изменение токенов

- **WHEN** в pull request меняется `packages/design-tokens/tokens/semantic/light.json`
- **THEN** задача `ios` запускается и собирает приложение с новыми токенами

#### Scenario: Изменение только веба

- **WHEN** pull request меняет только `apps/web/**`
- **THEN** задача `ios` не запускается

### Requirement: Новая проверка не меняет обязательные

Добавление задачи `ios` SHALL оставлять имена существующих задач `ci.yml` без изменений.

#### Scenario: Сравнение имён задач

- **WHEN** тест охранников CI сравнивает имена задач с обязательными проверками
- **THEN** `CI Pipeline`, `Performance Analysis`, `Comprehensive Security Scan`, `Container Security Scan` по-прежнему существуют
