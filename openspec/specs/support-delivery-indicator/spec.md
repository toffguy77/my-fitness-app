# support-delivery-indicator Specification

## Purpose
Веб показывает недоставку, повтор и подпись канала. Возможность введена изменением `web-fixes-before-ios` (архив `openspec/changes/archive/2026-10-24-web-fixes-before-ios`).

## Requirements

### Requirement: Недоставленный ответ виден в веб-очереди обращений

В треде обращения на `/curator/support` у исходящего сообщения с `delivered: false` SHALL показываться «Не доставлено в Telegram» и кнопка «Повторить», вызывающая повтор отправки; у сообщения без поля `delivered` (веб-виджет, бот, сообщения до миграции 065) признак MUST NOT показываться.

#### Scenario: Telegram не принял ответ

- **WHEN** у ответа оператора `delivered: false`
- **THEN** под ним «Не доставлено в Telegram» и «Повторить»

#### Scenario: Обращение с сайта

- **WHEN** у ответа нет поля `delivered`
- **THEN** признака доставки нет

### Requirement: Подпись поля ответа зависит от канала

Поле ответа SHALL подписываться «Ответ уйдёт в Telegram» для `channel = telegram` и «Ответ увидит посетитель сайта» для `channel = web`; кнопка отправки MUST называться «Отправить в Telegram» только для Telegram.

#### Scenario: Обращение с сайта

- **WHEN** открыт тред с `channel = web`
- **THEN** кнопка называется «Отправить», подпись — «Ответ увидит посетитель сайта»
