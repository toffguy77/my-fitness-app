# weekly-report-feedback Specification

## Purpose
Ссылка уведомления и показ отзыва на дашборде. Возможность введена изменением `web-fixes-before-ios` (архив `openspec/changes/archive/2026-10-24-web-fixes-before-ios`).

## Requirements

### Requirement: Уведомление об отзыве ведёт на существующую страницу

Уведомление `feedback_received` SHALL иметь `actionUrl` вида `/dashboard?report=<id отчёта>`; путь `/dashboard/weekly-reports/<id>/feedback`, страницы для которого нет, MUST NOT использоваться.

#### Scenario: Куратор оставил отзыв

- **WHEN** куратор отправляет отзыв на отчёт 42
- **THEN** у уведомления клиента `actionUrl` равен `/dashboard?report=42`

### Requirement: Дашборд показывает отзыв по ссылке

`/dashboard?report=<id>` SHALL показывать блок отзыва куратора (`GET /api/v1/dashboard/weekly-reports/:reportId/feedback`) под карточками дня и прокручивать к нему; без параметра блок MUST NOT отрисовываться пустым.

#### Scenario: Переход из уведомления

- **WHEN** клиент открывает `/dashboard?report=42`
- **THEN** виден блок «Отзыв куратора» с оценками, итогом и рекомендациями отчёта 42

#### Scenario: Обычное открытие дашборда

- **WHEN** открыт `/dashboard` без параметра
- **THEN** на странице нет блока отзыва и нет запроса `GET …/feedback`
