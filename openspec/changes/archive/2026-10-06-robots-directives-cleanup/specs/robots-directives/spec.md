## ADDED Requirements

### Requirement: Только действующие директивы

`robots.txt` MUST NOT содержать директивы `Host` и `Crawl-delay` и SHALL
содержать ровно один блок правил — для `User-Agent: *`.

#### Scenario: Устаревшие директивы

- **WHEN** сформирован `robots.txt`
- **THEN** в нём нет `Host` и `Crawl-delay`

#### Scenario: Один блок

- **WHEN** сформирован `robots.txt`
- **THEN** в нём один блок правил с `User-Agent: *`

### Requirement: Закрыты только разделы приложения

`robots.txt` SHALL закрывать от индексации разделы приложения, требующие
учётной записи или одноразовых ссылок, и MUST NOT закрывать публичные страницы.

#### Scenario: Закрытые разделы

- **WHEN** сформирован `robots.txt`
- **THEN** закрыты `/dashboard`, `/food-tracker`, `/notifications`, `/profile`, `/settings`, `/chat`, `/curator`, `/admin`, `/onboarding`, `/forgot-password`, `/reset-password`, `/api/`

#### Scenario: Публичные страницы открыты

- **WHEN** пути `/`, `/pricing`, `/content/<slug>`, `/kalkulyator-kbzhu`, `/avtor/sergey-burcev`, `/legal/terms` проверяются по правилам `robots.txt`
- **THEN** ни один из них не закрыт
