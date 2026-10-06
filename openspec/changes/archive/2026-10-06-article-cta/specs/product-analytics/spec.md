## ADDED Requirements

### Requirement: Переход из статьи измеряется

Система SHALL отправлять событие `article_cta_clicked` со свойством `target`
из набора `calculator`, `pricing` при клике по ссылке блока под статьёй.
Событие MUST быть объявлено в словарях клиента и сервера, а значение `target` вне
набора MUST отклоняться сервером.

#### Scenario: Клик по кнопке расчёта

- **WHEN** читатель нажимает «Рассчитать мою норму»
- **THEN** отправлено `article_cta_clicked` с `target = calculator`

#### Scenario: Клик по тарифам

- **WHEN** читатель нажимает «Тарифы»
- **THEN** отправлено `article_cta_clicked` с `target = pricing`

#### Scenario: Значение вне набора

- **WHEN** сервер получает `article_cta_clicked` с `target = other`
- **THEN** событие отклоняется
