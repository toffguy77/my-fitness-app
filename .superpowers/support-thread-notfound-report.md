# Дефект: GET /curator/support/conversations/:id с негодным id отвечал 500

## Статус

Исправлено. Ветка `fix/support-thread-not-found`, все проверки зелёные.

## Где провёл границу и почему

`support_conversations.id` — uuid. Разбор негодного значения (`1` вместо
uuid) Postgres отвергает ещё в момент парсинга запроса — `invalid input
syntax for type uuid` — раньше, чем может появиться `sql.ErrNoRows`. Эта
ошибка не `sql.ErrNoRows`, и уже существующий код (`Service.Thread` →
`apperrors.ErrNotFound` → `handler` → 404) её не видит: она проваливается в
generic-ветку и становится 500.

Выбрал первый из двух вариантов, предложенных в задаче: **отвергать
негодный id до обращения к базе**, разбором uuid в обработчике. Не потому
что это моё предпочтение, а потому что это уже сложившийся уклад проекта:
`admin.GetConversationMessages` (`internal/modules/admin/handler.go:192`) и
`account.DownloadExport` (`internal/modules/account/handler.go:229`) решают
ровно эту же задачу тем же способом — `uuid.Parse` в обработчике, 404 при
ошибке, с тем же обоснованием в комментарии: "негодная форма — это не
поломка сервера, а `not found`". Запрос, который заведомо ничего не найдёт,
не должен доходить до базы — ни лишнего round trip'а, ни лишней строки в
журнале.

(В `content.parseArticleID` та же идея выражена иначе — 400 вместо 404,
потому что там id вводит сам куратор, редактируя статью, и негодная форма —
его ошибка ввода, а не что-то, на что он мог бы просто наткнуться по ссылке.
Здесь ближе аналогия с admin/account: куратор открывает существующий ресурс
по ссылке, поэтому 404, а не 400.)

Реализация — приватный метод `Handler.conversationID(c)` в
`apps/api/internal/modules/support/handler.go`, вызываемый первым делом (после
проверки `h.service == nil` и аутентификации) в `Messages`, `Reply` и
`CloseConversation`. При негодном uuid — `response.NotFound(c, "Обращение не
найдено")` и возврат без обращения к сервису/базе.

## Нашлись ли те же места на соседних маршрутах

Да, две штуки, как и предполагалось в задаче:

- **`Reply`** (`POST .../conversations/:id/reply`, ответ оператора) — тот же
  класс: `Service.answerAs` → `Service.byID` делает `SELECT ... WHERE id =
  $1` без явного каста и без защиты от негодной формы; при `1` в пути падал
  в тот же generic-`default` → 500.
- **`CloseConversation`** (`POST .../conversations/:id/close`) — `Service.Close`
  делает `UPDATE ... WHERE id = $1`; при негодном id `ExecContext` возвращает
  саму ошибку Postgres (не `RowsAffected == 0`), и она тоже утекала в 500.

Публичные маршруты виджета (`StartWeb`, `WebMessage`, `WebMessages`,
`WebHuman`, `WebContact`) не затронуты: они адресуют разговор предъявительским
токеном (`web_token_hash`), а не `id` из URL, поэтому у них нет id-в-пути и
нет этого класса дефекта.

Все три маршрута защищены одним и тем же методом `conversationID`, чтобы
исправление не оказалось точечным.

## Порядок работы

1. Написал падающий тест первым (`apps/api/internal/modules/support/curator_conversation_id_test.go`,
   sqlmock-уровень) и подтвердил красный прогон **до** правки:
   ```
   --- FAIL: TestMessages_MalformedIDIsRejectedBeforeTheDatabase   (expected 404, actual 500)
   --- PASS: TestMessages_WellFormedButUnknownIDIsNotFound          (уже работал — apperrors.ErrNotFound)
   --- FAIL: TestReply_MalformedIDIsRejectedBeforeTheDatabase       (expected 404, actual 500)
   --- FAIL: TestClose_MalformedIDIsRejectedBeforeTheDatabase       (expected 404, actual 500)
   ```
2. Внёс правку в `handler.go`.
3. Прогон снова — все четыре зелёные.
4. Добавил интеграционный тест на живой базе
   (`curator_conversation_id_integration_test.go`, `-tags=integration`),
   воспроизводящий буквально ту самую ошибку смоук-теста — до правки
   получил тело ответа один в один с отчётом:
   ```
   {"status":"error","message":"Не удалось загрузить обращение","code":"internal"}
   ```
   (и такое же для reply/close с их собственными сообщениями) — при 500.
   sqlmock не годился для этой проверки: он не знает, что `id` — uuid, и не
   отказал бы на `"1"` так, как отказывает настоящий Postgres.

## Мутации — фактический вывод

**Мутация 1 — полный откат правки** (`git stash` на `handler.go`, разбор uuid
убран):
- unit-тесты (sqlmock): 3 из 4 красные — `Messages`, `Reply`, `Close` по
  негодному id вернулись к 500; `WellFormedButUnknownID` остался зелёным
  (он проверяет другой путь — `sql.ErrNoRows`, который правка не трогает).
- интеграционные тесты на живой базе: все 3 "malformed id" теста красные, с
  тем же телом ответа, что в отчёте о дефекте; `WellFormedButUnknownID`
  остался зелёным.
- Откатил (`git stash pop`), убедился по `git diff`, что правка вернулась
  байт в байт.

**Мутация 2 — вырезана ветка `errors.Is(err, apperrors.ErrNotFound)` в
`Messages`** (проверка, что тест "правильный, но не существующий id" не
проходит вырожденно, то есть не всегда возвращает 404 независимо от кода):
- unit-тест `TestMessages_WellFormedButUnknownIDIsNotFound` — красный
  (ожидание 404, получено 500).
- интеграционный `TestMessages_WellFormedButUnknownIDOnRealDatabaseIsNotFound`
  — красный, тем же образом на живой базе.
- Вернул ветку обратно, `go build` и `gofmt -l .` чистые.

Оба случая — негодная форма id и годная форма, но несуществующий id —
проверены раздельно и оба независимо ловят соответствующую поломку: тест не
охраняет одно вместо другого.

## Прогоны

```
cd apps/api && go build ./... && go vet ./... && gofmt -l .
```
Чисто, без вывода.

```
cd apps/api && go test ./internal/... -count=1
```
Все 35 пакетов `ok`, без пропусков в `internal/modules/support` и
`internal/router`.

```
cd apps/api && TEST_DATABASE_URL="postgres://burcev:burcev@localhost:5432/burcev_test?sslmode=disable" \
  go test -tags=integration ./internal/... -count=1 -v
```
1059 `--- PASS`, 0 `--- FAIL`. 4 `--- SKIP` — все не связаны с этой правкой
(два — SMTP-интеграция без реального сервера, один — плановое удаление кода
до 2026-11-01, один — экспорт префикса без заданного `PREFIX_OUT`). Новые
тесты `TestMessages_MalformedIDOnRealDatabaseIsNotFound`,
`TestMessages_WellFormedButUnknownIDOnRealDatabaseIsNotFound`,
`TestReply_MalformedIDOnRealDatabaseIsNotFound`,
`TestClose_MalformedIDOnRealDatabaseIsNotFound` — выполнились, не
пропущены (видно по применённым миграциям и `--- PASS` в логе).

```
node scripts/check-api-contract.mjs && node scripts/check-codebase-integrity.mjs
```
```
API contract OK — 104 frontend paths all resolve to registered routes.
Codebase integrity OK — 4 public env vars all used, 1 Next.js config,
no unimplemented shipped handlers, 118 app files free of fixture data,
48 e2e specs all in a project, 21 analytics events all sent, 81 server
env vars all forwarded by compose.
```

Маршруты не менялись (не добавлял и не переименовывал ни одного), поэтому
`routes.golden` и `authorization_matrix_test.go` регенерировать не
потребовалось — `TestRoutesMatchGolden` прошёл без обновления.

Router-тест на роль (`TestCuratorSupportRoutesAllowCoordinatorAndAdmin` в
`internal/router/curator_leads_test.go`) использует `.../conversations/1`
как заглушку id для проверки доступа по роли, но в этом тесте `Support`
handler — нулевой указатель (роутер собирается без БД), и вызов падает в
панику на `h.service` раньше, чем доходит до новой проверки uuid — поведение
теста не изменилось, правка его не затронула.

## Что теперь видит куратор, открывший ссылку на несуществующее обращение

Раньше: `500 {"status":"error","message":"Не удалось загрузить обращение","code":"internal"}`
— выглядело как поломка сервера, с записью об ошибке в журнале.

Теперь: `404 {"status":"error","message":"Обращение не найдено"}` — и для
негодной по форме ссылки (опечатка, устаревший id), и для корректной по
форме, но удалённой или никогда не существовавшей — оба случая неразличимы
снаружи и оба честно говорят "такого обращения нет", без ложной тревоги и
без лишней записи в журнал.
