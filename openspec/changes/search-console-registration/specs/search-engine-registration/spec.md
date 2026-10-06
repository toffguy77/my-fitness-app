## ADDED Requirements

### Requirement: robots.txt называет карту сайта

`robots.txt` SHALL содержать директиву `Sitemap` с абсолютным адресом
`https://burcev.team/sitemap.xml`.

#### Scenario: Директива Sitemap

- **WHEN** сформирован `robots.txt`
- **THEN** в нём есть `Sitemap: https://burcev.team/sitemap.xml`

### Requirement: Подтверждение прав не дублируется в разметке

Пока права в Яндекс Вебмастере подтверждены через DNS, страницы MUST NOT
содержать мета-тег `yandex-verification`.

#### Scenario: Мета-тега нет

- **WHEN** проверяются метаданные корневого макета
- **THEN** в них нет `verification.yandex`
