# Слияние origin/dev в feat/public-support-widget

## Статус

Слияние доведено и закоммичено. Рабочий каталог чист, конфликтов не осталось.

Хэш коммита слияния: см. `git log -1` после коммита (указан в ответе агенту).

## Семь конфликтов — как и почему

1. **`apps/api/internal/modules/leads/types.go`** — объединение: оставлен
   `QueueEntry` (очередь заявок, dev), доклад комментарий у `CreateInput`
   расширен до трёх источников контакта (шаг, экран результата, бот — было
   у HEAD), заодно убран дублирующийся/битый doc-комментарий, который уже был
   в dev (два подряд `// CreateInput is what...`). Поле `CaptureSource` в
   `CreateInput` слилось само — оно было идентично на обеих сторонах.

2. **`apps/api/internal/modules/leads/service_test.go`** — `TestCreate_StoresCaptureSource`
   существовал на обеих ветках с разным значением источника (`"bot"` у HEAD,
   `"result"` у dev). Не подмена одного другим: переписан в табличный тест
   `for _, source := range []string{"result", "bot"}`, чтобы проверялись оба
   сценария, а не один вытеснял другой.

3. **`apps/api/internal/modules/support/handler.go`** — объединение: оставлены
   все пять обработчиков веб-виджета (`StartWeb`, `WebMessage`, `WebMessages`,
   `WebHuman`, `WebContact`) из HEAD; комментарий над `List` взят с dev —
   маршрут теперь `/api/v1/curator/support/conversations` (админка → кураторы).

4. **`apps/api/internal/modules/support/testdata/control-questions.json`** —
   объединение списка контрольных вопросов: добавлен один вопрос HEAD (про
   `09-зачем-нужен-аккаунт.md`) и три вопроса dev (про вход по ссылке,
   переключение устройств, вес порции). Проверено `python3 -m json.tool` —
   валидный JSON, все четыре источника существуют в `docs/user-guide/` и
   зеркальной копии в `internal/modules/support/knowledge/`.

5. **`apps/api/internal/router/authorization_matrix_test.go`** — объединение
   реестра `protectedRoutes`: маршруты `/api/v1/admin/support/conversations/*`
   заменены на `/api/v1/curator/support/conversations/*` (dev, переезд к
   кураторам) + сохранены пять публичных маршрутов виджета
   (`/api/v1/public/support/web*`) с `protPublic`. Проверено: тест
   `TestRoleProtectedRoutesRefuseNonPrivilegedRole` фильтрует
   `if kind != protRole { continue }` — публичные маршруты в выборку не
   попадают, ассерт 403 их не касается.

6. **`apps/api/internal/router/support.go`** — объединение: группа публичных
   маршрутов виджета (`/public/support/web...` с пятью отдельными именами
   лимитов) оставлена как в HEAD; группа очереди — `/curator/support` вместо
   `/admin/support`, взято с dev вместе с комментарием про переход к
   кураторам.

7. **`apps/api/internal/shared/middleware/auth_rate_limiter.go`** — обе
   стороны добавляли записи в `authLimitConfigs`: слиты без потерь — пять
   имён виджета (`support-web-start/message/read/human/contact`, HEAD) и два
   имени магической ссылки (`magic-link-request/consume`, dev).
   **Отдельная проверка**: в задаче упоминался «сторож», роняющий сборку на
   незарегистрированном имени в `Limit(...)`, и что сама `Limit` теперь
   паникует вместо молчаливого пропуска. Такого сторожа и паники в коде **не
   нашлось** ни на dev, ни на HEAD — `Limit` по-прежнему молча пропускает
   неизвестное имя (`auth_rate_limiter.go:111-115`, коммент "Unknown endpoint
   – pass through without limiting"), это подтверждено и существующим тестом
   `TestMagicLinkRequestRateLimit_...` в `auth_rate_limiter_test.go`, где в
   комментарии явно написано "Without an entry in authLimitConfigs, Limit
   passes every endpoint it does not recognise straight through". Имена
   виджета в реестре всё равно оставлены объявленными — это правильно
   независимо от наличия сторожа, — но самого механизма, который бы ронял
   сборку, я не нашёл и не стал придумывать. Заодно нашёл более старую
   отдельную дыру того же рода, не относящуюся к этим семи конфликтам:
   `router/users.go:70` вызывает `d.AuthRateLimiter.Limit("unsubscribe")`, а
   ключа `"unsubscribe"` в `authLimitConfigs` нет вообще — при текущем
   поведении `Limit` это означает нелимитированный `/api/v1/notifications/unsubscribe`.
   Не трогал — вне периметра задачи, но стоит завести отдельную задачу.

## Дублирующая миграция

`078_leads_capture_source_{up,down}.sql` — удалены оба файла
(`git rm`). Подтверждено:
- `077_leads_capture_source_{up,down}.sql` (из dev) добавляет тот же столбец
  `capture_source TEXT` в `leads` с тем же комментарием.
- Ссылок на `078` в коде, тестах и документации не найдено.
- `go build ./...`, `go vet ./...` — чисто.

`schema.golden` перегенерирован:
```
TEST_DATABASE_URL="postgres://burcev:burcev@localhost:5432/burcev_test?sslmode=disable" \
UPDATE_GOLDEN=1 go test -tags=integration ./internal/shared/database/
```
Применилось 75 миграций, `leads_capture_source` — версия 77, разрыва
нумерации нет (76 → 77 → следующая, 78 просто не существует, это ожидаемо —
номера миграций не обязаны идти без пропусков, у нас просто никогда не было
78-й).

**Дифф golden: пустой.** Файл, который приехал слиянием (из dev), уже
содержал точный ожидаемый снимок — `git diff` после регенерации ничего не
показал. `capture_source` встречается в golden ровно один раз
(`leads.capture_source text`, строка 393) — дублирования колонки, разумеется,
и не могло быть (одна колонка с одним именем), но проверено явно.

## Полная проверка — фактические прогоны

```
cd apps/api && go build ./...      # чисто
cd apps/api && go vet ./...        # чисто
cd apps/api && gofmt -l .          # пусто — весь код отформатирован
```

```
cd apps/api && go test ./internal/... -count=1
```
Все 34 пакета с тестами — `ok`. (`openfoodfacts`, `ws` — без тестов, ожидаемо.)

```
cd apps/api && TEST_DATABASE_URL="postgres://burcev:burcev@localhost:5432/burcev_test?sslmode=disable" \
  go test -tags=integration ./internal/... -count=1 -v
```
Полный вывод сохранён (2094 подтеста через `=== RUN`), все пакеты — `ok`.
4 легитимных `SKIP` (env-зависимые: SMTP-тесты писем без реальных кредов,
один тест измерения дампа) — не относятся к слиянию, пропускались и раньше.
Отдельно прогнаны и подтверждены зелёными ключевые тесты по теме задачи:
- `TestAuthorizationMatrixIsComplete` — PASS
- `TestAuthorizationMatrixHasNoStaleEntries` — PASS
- `TestRoutesMatchGolden` — PASS
- `TestRoleProtectedRoutesRequireAuthentication` — PASS (все 15 protRole-маршрутов)
- `TestRoleProtectedRoutesRefuseNonPrivilegedRole` — PASS (все 15, включая
  два маршрута из dev `/curator/support/conversations/...`)
- `TestKnowledgeMatchesUserGuide` — PASS
- `TestSchemaMatchesGolden` — PASS

```
cd apps/web && npx jest && npm run lint && npm run type-check
```
- jest: 343/344 test suite passed (1 skipped — не связан со слиянием),
  4548/4562 тестов, 14 skipped, 0 failed.
- lint: 0 errors, 589 warnings (все — предсуществующие: `no-explicit-any`,
  неиспользуемые переменные, `<img>` вместо `next/image`; ни одного нового
  файла из конфликтов в списке).
- type-check: чисто, без вывода.

```
node scripts/check-i18n.mjs && node scripts/check-codebase-integrity.mjs \
  && node scripts/check-api-contract.mjs && node scripts/check-internal-links.mjs
```
Все четыре — OK:
- i18n OK — 271 файл, 17 секций, 1645 ключей.
- Codebase integrity OK — 4 публичных env var использованы, 1 конфиг Next.js,
  без нереализованных обработчиков, 118 файлов без фикстур, 47 e2e-спеков в
  проекте, 21 событие аналитики отправляется, 81 серверная переменная
  проброшена в compose.
- API contract OK — 104 фронтенд-пути резолвятся в зарегистрированные маршруты.
- Internal links OK — 31 внутренняя ссылка в 387 файлах резолвится в одну из
  46 страниц App Router.

## Что упало после слияния и чем оказалось

**Ничего не упало.** Все прогоны выше — зелёные с первого раза, включая
интеграционные на живой базе. Единственная находка — не падение теста, а
несостыковка между тем, что было заявлено в задаче (сторож на сборке +
паника в `Limit` на незарегистрированном имени), и тем, что реально есть в
коде обеих веток (по-прежнему тихий пропуск). Зафиксировано выше в разделе
про конфликт №7, вместе с обнаруженной попутно дырой `"unsubscribe"`.
