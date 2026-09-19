# Смена роли обесценивает токены — отчёт

## Статус

Готово. Исправление внесено, покрыто интеграционными тестами против реальной
базы (обе ветки), мутационное тестирование выполнено для каждой ветки
отдельно и подтверждено падением нужного теста.

## Хэш коммита

<будет вписан после коммита ниже>

## Что сделано

`apps/api/internal/modules/admin/service.go`:

- В `Service` добавлено поле `sessions SessionCache` и метод
  `WithSessionCache`, интерфейс `SessionCache` с единственным методом
  `BumpVersion(ctx, tx, userID) error` — копия того, как это устроено в
  `auth.Service` (`WithSessionCache`/`SessionCache`), только без зависимости
  admin-модуля от пакета `middleware`. Второй реализации механизма не
  заводилось — используется тот же `middleware.TokenVersions`, что и у смены
  пароля.
- `ChangeRole` перед диспетчеризацией в обе ветки требует `s.sessions != nil`
  (`apperrors.ErrValidation` иначе) — по тому же принципу «громко, а не
  тихо», что и `auth.Service.endAllSessions`.
- Ветка `client -> coordinator` была одиночным `UPDATE` без транзакции;
  теперь она обёрнута в `s.db.BeginTx` и внутри неё выполняется `UPDATE users
  SET role...`, затем `s.sessions.BumpVersion(ctx, tx, userID)`, затем
  `tx.Commit()`.
- `demoteCurator` — добавлен шаг 3a сразу после `UPDATE users SET role =
  'client'...`: `s.sessions.BumpVersion(ctx, tx, curatorID)`, внутри уже
  существующей транзакции, до `tx.Commit()`.

`apps/api/cmd/server/main.go`:

- После создания `tokenVersions` (там же, где `authService.WithSessionCache`
  и `resetService.WithSessionCache`) добавлено
  `adminService.WithSessionCache(tokenVersions)`.

`apps/api/internal/modules/admin/service_test.go` (sqlmock, обновлены под
новое поведение):

- `setupTestService` теперь возвращает и `*fakeSessionCache` (стаб, ведущий
  список ID, для которых был вызван `BumpVersion`, без обращения к БД).
- `TestChangeRole`: добавлены `mock.ExpectBegin/ExpectCommit` для простой
  ветки; добавлена проверка `sessions.bumped` для повышения и понижения;
  добавлен новый подтест «отказ без token-version-кэша».
- Тест «demote без оставшихся кураторов» (откат транзакции) больше не
  проверяет `sessions.bumped == empty` — это оказалось артефактом стаба, не
  реальным поведением (см. ниже, в разделе про мутации).

`apps/api/internal/modules/admin/role_change_tokens_integration_test.go`
(новый, `-tags=integration`):

- `TestPromotionInvalidatesTheOldToken` — создаёт клиента, читает версию
  через `middleware.TokenVersions.Current` (прогревает кэш), вызывает
  `ChangeRole(..., "coordinator")`, проверяет, что `Current` сразу возвращает
  большую версию — то есть кэш действительно сброшен `BumpVersion`, а не
  просто изменилась колонка в БД, которую кэш ещё 30 секунд не увидит.
- `TestDemotionInvalidatesTheOldToken` — создаёт двух кураторов и клиента,
  назначает клиента понижаемому куратору, демотирует его, проверяет: версия
  демотированного куратора выросла; версия другого куратора не тронута;
  клиент реально переназначен второму куратору (доказывает, что
  `demoteCurator` в этом прогоне дошёл до конца, а не выполнил
  тривиальный путь без клиентов).

## Прогоны

```
cd apps/api && go build ./... && go vet ./... && gofmt -l .
```
→ чисто, без вывода (build/vet без ошибок, gofmt не нашёл неотформатированных файлов).

```
cd apps/api && go test ./internal/...
```
→ `ok` по всем 34 пакетам с тестами (admin — `ok ... 1.364s`, полный прогон
без пропусков, sqlmock/юнит-уровень).

```
cd apps/api && TEST_DATABASE_URL="postgres://burcev:burcev@localhost:5432/burcev_test?sslmode=disable" \
  go test -tags=integration ./internal/...
```
→ `ok` по всем пакетам, включая `internal/router` (сторожевые тесты матрицы
авторизации не покраснели от изменений в admin) и
`internal/modules/admin` — `ok ... 2.552s`.

Явное подтверждение, что интеграционные тесты **выполнились, а не
пропустились** (флаг `-v`, только admin-пакет):

```
=== RUN   TestPromotionInvalidatesTheOldToken
--- PASS: TestPromotionInvalidatesTheOldToken (0.58s)
=== RUN   TestDemotionInvalidatesTheOldToken
--- PASS: TestDemotionInvalidatesTheOldToken (0.49s)
PASS
ok  	github.com/burcev/api/internal/modules/admin	1.673s
```

Длительность в десятые доли секунды и лог применения 70 миграций в стенограмме
прогона — признак того, что тесты реально подняли схему и прогнали код против
Postgres, а не были молча пропущены (`go test` печатает `ok` в обоих случаях,
поэтому это проверялось явно).

База для интеграционных тестов: локальный контейнер `burcev-test-db`
(`postgres:18-alpine`, порт 5432, уже был поднят в окружении), не поднимался
отдельно для этой задачи.

## Мутации

Мутация — закомментировать вызов `BumpVersion` в одной из веток, оставив
остальной код (транзакцию, `UPDATE users`, коммит) без изменений.

**Мутация 1 — убран bump в ветке повышения (`client -> coordinator`):**

```
--- FAIL: TestPromotionInvalidatesTheOldToken (0.82s)
    Error: "0" is not greater than "0"
    Messages: a client promoted to coordinator whose token version did not
    move keeps their pre-promotion token valid...
--- PASS: TestDemotionInvalidatesTheOldToken (0.63s)
```
и юнит-тест:
```
--- FAIL: TestChangeRole (0.00s)
    Error: Not equal:
    Messages: a promotion that does not bump the token version leaves the
    old, unprivileged token as the only one that keeps working
```
Ветка понижения не задета — красна только повышение. Мутация поймана и
интеграционным, и юнит-тестом.

**Мутация 2 — убран bump в `demoteCurator` (`coordinator -> client`):**

```
--- PASS: TestPromotionInvalidatesTheOldToken (0.74s)
--- FAIL: TestDemotionInvalidatesTheOldToken (0.57s)
    Error: "0" is not greater than "0"
    Messages: a curator demoted to client whose token version did not move
    keeps reading clients' personal data and support conversations,
    reassigned to someone else in the database already, until their old
    token expires on its own
```
и юнит-тест:
```
--- FAIL: TestChangeRole (0.00s)
    Messages: a demoted curator whose token version was not bumped keeps
    their coordinator-level token working
```
Ветка повышения не задета — красна только понижение.

Обе мутации внесены и отменены по очереди (не одновременно), каждая проверена
отдельным прогоном; после отмены обеих — `go build`, `go vet`, `gofmt -l .`
и оба прогона тестов снова чистые (см. раздел «Прогоны» выше — это финальное
состояние).

## Что теперь происходит с сессией разжалованного куратора

Демотированный куратор перестаёт быть валиден для API немедленно после
`ChangeRole` внутри той же транзакции, что и смена роли в базе: `BumpVersion`
поднимает `token_version` и сбрасывает кэш `middleware.TokenVersions` на том
инстансе, который выполнил запрос, — следующий же запрос с его access-токеном
получит отказ, поскольку версия в токене не совпадает с версией в базе.
Другие инстансы (если их несколько) увидят новую версию не позже 30 секунд —
это TTL кэша `TokenVersions`, тот же самый, что действует для смены пароля.
Refresh-токен куратора отдельно не отзывается (в отличие от
`auth.endAllSessions`), поэтому попытка обновить сессию по refresh-токену
всё ещё сработает — но выпущенный при этом access-токен будет нести уже
актуальную (пониженную) роль, потому что генерируется заново из текущей
записи в `users`. Итог: разжалованный куратор теряет доступ к кураторским
маршрутам практически сразу и не может продлить старые кураторские права ни
через старый access-токен, ни через refresh — только получить новый токен с
уже правильной ролью `client`.

Повышенный до куратора получает права сразу тем же путём: старый (ещё
клиентский) токен становится недействителен, и следующий запрос с ним
обязан пройти `/auth/refresh`, после чего новый токен уже несёт роль
`coordinator`.

## Рамки — что не трогалось

- Сам механизм `token_version` (`internal/shared/middleware/token_version.go`)
  и смена пароля (`auth.Service`, `reset_service.go`) не менялись.
- Задача не расширялась на другие места, читающие роль из токена. Кроме
  `middleware.RequireRole`, роль из контекста (`c.Get("user_role")`,
  выставляется в `middleware.RequireAuth` из тех же JWT-claims) читают
  напрямую:
  - `apps/api/internal/modules/auth/handler.go:358`
  - `apps/api/internal/modules/content/handler.go:80`
  - `apps/api/internal/modules/dashboard/handler.go:314,429`

  Все они читают роль уже после того, как `RequireAuth` на этом же запросе
  проверил `token_version` — то есть уже прикрыты этим же исправлением
  косвенно, отдельного изменения там не требуется. Это наблюдение, не
  внесённая правка.
