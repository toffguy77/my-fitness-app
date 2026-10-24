# ios-design-tokens Specification

## Purpose
Swift-представление токенов, каталог цветов, шрифты и Dynamic Type, проверка отставания. Возможность введена изменением `ios-app-foundation` (архив `openspec/changes/archive/2026-10-24-ios-app-foundation`).

## Requirements

### Requirement: Сборка токенов выпускает Swift и каталог цветов

`npm run tokens:build` SHALL выпускать `packages/design-tokens/dist/ios/Tokens.swift` и `dist/ios/Colors.xcassets` с colorset на каждую цветовую роль; у каждого colorset MUST быть варианты Any (светлая тема) и Dark (тёмная) со значениями из `dist/tokens.json`.

#### Scenario: Роль в обеих темах

- **WHEN** выполняется сборка токенов
- **THEN** `Colors.xcassets/BgCanvas.colorset/Contents.json` содержит светлое значение `color.bg.canvas` для Any и тёмное — для Dark

#### Scenario: Новая роль

- **WHEN** в `semantic/light.json` и `semantic/dark.json` добавлена роль
- **THEN** после сборки в `Tokens.swift` есть соответствующий член `DS.Color` и colorset с тем же именем

### Requirement: Отставший вывод для iOS ломает проверку

`npm run tokens:check` SHALL завершаться отказом, если `dist/ios/*` не совпадает с источником.

#### Scenario: Правка цвета без пересборки

- **WHEN** изменено значение роли, а `dist/ios/Colors.xcassets` не пересобран
- **THEN** `tokens:check` завершается отказом и называет отставший файл

### Requirement: Цвета в приложении — только из DesignSystem

Код приложения и расширений вне модуля `DesignSystem` MUST NOT создавать цвет из компонентов или шестнадцатеричной строки; проверка SHALL выполняться SwiftLint в CI.

#### Scenario: Цвет литералом в экране

- **WHEN** в экране написано `Color(red: 0.7, green: 0.3, blue: 0.2)`
- **THEN** `swiftlint --strict` завершается ошибкой правила `ds_color_literal`

### Requirement: Текст бренда масштабируется с Dynamic Type

Стили текста `DS.Typography` SHALL использовать шрифты Literata и Golos Text через `Font.custom(_:size:relativeTo:)` с относительным стилем из токенов. На размере `accessibility5` главные числа экранов MUST NOT обрезаться.

#### Scenario: Крупный текст

- **WHEN** снапшот-тест рисует карточку «Питание» с `dynamicTypeSize = .accessibility5`
- **THEN** число остатка калорий видно целиком, без многоточия
