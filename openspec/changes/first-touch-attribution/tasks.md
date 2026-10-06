## 1. Клиент

- [x] 1.1 Тесты `attribution.test.ts`: переход из Дзена без меток (реферер без строки запроса, страница входа); метки и `yclid`; повторный заход не перезаписывает; истёкшая запись заменяется; свой домен не реферер; прямой заход; обрезка до 200 и запись ≤ 1 КБ; отказ cookie — метки из адреса. Проверка: `npx jest attribution` падает до реализации.
- [x] 1.2 Переписать `attribution.ts` на cookie `first_touch`; `storedAttribution` отдаёт `referrer` и `landing_page`. Проверка: тесты зелёные; тесты `GuestOnboarding` и `PricingRequestForm` зелёные.

## 2. База

- [x] 2.1 Сверить номер `091` с `schema_migrations` dev/прода и ветками соседей. Проверка: максимум 090 (после `article-slugs`).
- [x] 2.2 Миграция `091_first_touch_referrer_{up,down}.sql`: `referrer`, `landing_page` в `leads` и `user_attribution`. Обновить `schema.golden`. Проверка: `go test ./internal/router/ ./internal/modules/account/` зелёный.

## 3. Заявка

- [x] 3.1 Тесты Go: заявка сохраняет `referrer`/`landing_page`; перенос пишет их в `user_attribution`; ответ списка заявок их содержит. Проверка: `go test ./internal/modules/leads/` падает до реализации.
- [x] 3.2 Реализовать. Проверка: тесты зелёные.
- [x] 3.3 Тест `LeadList`: заявка без меток с реферером показывает хост `dzen.ru`. Реализовать. Проверка: `npx jest LeadList`.

## 4. Регистрация

- [x] 4.1 Тест `FirstTouchFromCookie`: корректное значение, мусор, превышение длины. Проверка: `go test ./internal/modules/leads/ -run FirstTouch` падает до реализации.
- [x] 4.2 Интеграционный тест `TestEveryAccountPathRecordsAttribution` (по образцу `TestEveryAccountPathAssignsCurator`): пароль, ссылка из письма, провайдер с cookie `first_touch` → строка `user_attribution`; перенос заявки побеждает cookie; повреждённая cookie не мешает регистрации; вход в существующую учётную запись ничего не пишет. Проверка: `TEST_DATABASE_URL=… go test ./internal/modules/auth/ -run Attribution` падает до реализации. *Как сделано:* пароль и ссылка — сквозным тестом через роутер; путь провайдера без настоящего провайдера не прогнать, его держит `TestEveryAccountPathCarriesArrival` (разбор AST: все три обработчика зовут `carryArrival`, проверено мутацией); «заявка побеждает cookie» — `TestRecordFirstTouch` в `leads`.
- [x] 4.3 Реализовать запись в трёх путях. Проверка: тест зелёный, `go test ./...` зелёный.

## 5. Живая проверка

- [ ] 5.1 После выкатки на dev: зайти с `Referer: https://dzen.ru/a/test` на статью, сохранить заявку — в `leads.referrer` `https://dzen.ru/a/test` (запрос через `db.sh`). Зарегистрироваться паролем без заявки — строка `user_attribution` с реферером. Учётную запись удалить. *Dev проверен 2026-10-06 браузером: cookie `first_touch` с реферером без строки запроса, 30 дней; заявка `e2e-lead-seo-…@burcev.test` хранит `referrer` и `landing_page`.* Затем на проде — проверка заполнения на живом трафике через неделю (`SELECT count(*) FILTER (WHERE referrer IS NOT NULL) FROM leads WHERE created_at > выкатка`).
