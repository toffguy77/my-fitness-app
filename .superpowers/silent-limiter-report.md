# Тихий пропуск в AuthRateLimiter.Limit — отчёт

## Статус

Готово. Ветка `fix/rate-limiter-silent-noop`, все прогоны зелёные, изменения
закоммичены (хэш — в конце отчёта после коммита).

## Что было не так

`AuthRateLimiter.Limit(endpoint)` (`apps/api/internal/shared/middleware/auth_rate_limiter.go`)
при отсутствии настройки для `endpoint` в `authLimitConfigs` молча возвращал
пропускающий middleware. `internal/router/users.go:65-67` вызывал
`d.AuthRateLimiter.Limit("unsubscribe")`, но `authLimitConfigs` записи
`"unsubscribe"` не имел — эндпоинт `/api/v1/notifications/unsubscribe`
(публичный, без аутентификации, принимает подписанный токен) не был
ограничен вовсе, хотя комментарий рядом с маршрутом утверждал обратное.

**Что мог сделать посторонний с эндпоинтом отписки до починки:** слать POST
`/api/v1/notifications/unsubscribe` без какого-либо ограничения по частоте —
перебирать `token` в цикле с любой скоростью, какую выдержит сеть и сервер.
Сам токен — HMAC-SHA256 над `"<user id>.<expiry>"`, так что перебор подписи
всё равно вычислительно неосуществим (это не менялось), но ничто не мешало
превратить публичный, пишущий в базу эндпоинт в мишень для флуда: скрипт мог
слать запросы без пауз, каждый успешный — это `UPDATE users` плюс
`UPDATE notification_deliveries`, то есть нагрузка на БД росла с частотой
запросов, а не с частотой реальных отписок.

## Порядок работы (как просили — тест сначала)

1. Написал сторож `TestEveryRouterLimitCallHasAConfig`
   (`apps/api/internal/shared/middleware/auth_rate_limiter_endpoints_test.go`):
   читает исходники `internal/router/*.go`, регулярка `\.Limit\(\s*"([^"]+)"\s*\)`
   находит все имена, переданные в `Limit(...)`, и сверяет их с ключами
   `authLimitConfigs` (тот же пакет, доступ к неэкспортированной карте напрямую).
2. Прогнал до починки — сторож упал и назвал `unsubscribe`:
   ```
   Error: Should be empty, but was [unsubscribe]
   Messages: internal/router calls AuthRateLimiter.Limit with a name absent
   from authLimitConfigs: [unsubscribe] — Limit silently skips rate limiting
   for an unrecognized name, so this endpoint is currently unprotected
   --- FAIL: TestEveryRouterLimitCallHasAConfig
   ```
3. Только после этого — правка.

## Что сделано

1. **Настройка для `unsubscribe`** в `authLimitConfigs`:
   ```go
   "unsubscribe": {maxRequests: 5, window: 15 * time.Minute},
   ```
   Обоснование в комментарии рядом: это ссылка из письма, человек жмёт её
   один раз — пяти запросов с запасом хватает на двойной клик или обновление
   страницы. Токен — HMAC, перебор его подписи неосуществим на любой
   доступной скорости запросов, так что лимит защищает не от подбора токена
   как такового, а от превращения публичного, пишущего в базу эндпоинта в
   мишень для флуда скриптом — ровно то, что произошло без ограничения.
   Величина ближе к `resend-verification` (3/час) и `lead-create` (5/час) —
   тоже разовые, редкие, чувствительные к злоупотреблению публичные ручки —
   но чуть щедрее по окну, потому что легитимный повторный клик по ссылке из
   письма (например, из другого письма того же дайджеста) правдоподобнее, чем
   повторная регистрация.

2. **Сторож** — `TestEveryRouterLimitCallHasAConfig`, описан выше. Живёт в
   пакете `middleware` (не `router`), потому что `Limit` и `authLimitConfigs`
   там, и тест обращается к карте напрямую без экспорта.

3. **Молчаливый пропуск заменён паникой.** `Limit` при неизвестном имени
   теперь паникует:
   ```go
   panic("middleware: no rate limit configured for endpoint " + strconv.Quote(endpoint) +
       " — add an entry to authLimitConfigs in auth_rate_limiter.go")
   ```
   Решение: `Limit` вызывается при регистрации маршрутов — то есть при
   старте (`cmd/server/main.go`) или при построении тестового движка, а не на
   каждый запрос. Отказ при старте с именем сломанного эндпоинта в тексте
   паники — куда честнее прежнего поведения: раньше маршрут выглядел
   защищённым и не был, теперь либо защищён, либо процесс не поднимется.
   Проверил, что это не ломает тесты, поднимающие движок: везде, где строится
   `router.New(Deps{...})` (`authorization_matrix_test.go`, `health_test.go`,
   `routes_test.go`, `cmd/server/main.go`), `AuthRateLimiter` создаётся через
   `middleware.NewAuthRateLimiter()`, у которого всегда полная карта — паника
   в норме недостижима. Плюс сторож из пункта 2 ловит опечатку на этапе
   `go test`, до того как до неё вообще дойдёт паника при старте.

4. **Комментарии поправлены:**
   - Доковый у `Limit`: вместо `Supported endpoints: "login", "register"` —
     перечислены все актуальные имена плюс объяснение, почему неизвестное
     имя теперь паника, а не пропуск.
   - `users.go:60-67`: было — "the rate limiter keeps the endpoint from being
     used to guess tokens", что неточно (перебор HMAC неосуществим независимо
     от лимитера). Переписал: HMAC делает подделку токена неосуществимой,
     лимит — второй слой, защищающий именно от флуда скриптом по публичной,
     пишущей в базу ручке.

## Мутации

**1. Убрал `unsubscribe` из `authLimitConfigs` повторно:**
```
Error: Should be empty, but was [unsubscribe]
Messages: internal/router calls AuthRateLimiter.Limit with a name absent
from authLimitConfigs: [unsubscribe] — Limit silently skips rate limiting
for an unrecognized name, so this endpoint is currently unprotected
--- FAIL: TestEveryRouterLimitCallHasAConfig
```
Сторож покраснел и назвал имя. Откатил.

**2. Добавил `d.AuthRateLimiter.Limit("опечатка")` на фиктивный маршрут
`/users/typo-probe` в `users.go`:**
```
Error: Should be empty, but was [опечатка]
Messages: internal/router calls AuthRateLimiter.Limit with a name absent
from authLimitConfigs: [опечатка] — Limit silently skips rate limiting for
an unrecognized name, so this endpoint is currently unprotected
--- FAIL: TestEveryRouterLimitCallHasAConfig
```
Покраснел, имя названо. Откатил.

**3. Сломал саму регулярку сторожа** (заменил `\.Limit\(...\)` на заведомо
не встречающийся `\.NoSuchMethod\(...\)`, чтобы `found` осталась пустой):
```
Error: Should NOT be empty, but was map[]
Messages: found no calls to Limit("...") under internal/router; either the
rate limiter has been removed from every route (unlikely) or
limitCallPattern no longer matches the call syntax — fix the pattern
--- FAIL: TestEveryRouterLimitCallHasAConfig
```
Тест не прошёл вырожденно зелёным — `require.NotEmpty(t, found, ...)`
сработал раньше, чем до сравнения дошло дело. Откатил.

После каждой мутации: `go build ./...` — чисто, восстановленный файл собирается.

## Прогоны (фактический вывод)

```
$ cd apps/api && go build ./... && go vet ./... && gofmt -l .
(пусто — всё чисто)
```

```
$ cd apps/api && go test ./internal/... -count=1
ok  	github.com/burcev/api/internal/capabilities	18.469s
ok  	github.com/burcev/api/internal/config	0.862s
... (все 33 пакета с тестами — ok, 0 провалов)
ok  	github.com/burcev/api/internal/shared/middleware	0.906s
ok  	github.com/burcev/api/internal/router	1.616s
```

```
$ cd apps/api && TEST_DATABASE_URL="postgres://burcev:burcev@localhost:5432/burcev_test?sslmode=disable" \
  go test -tags=integration ./internal/... -count=1 -v
1893 подтестов (=== RUN), 0 --- FAIL, все пакеты — ok
```

```
$ node scripts/check-codebase-integrity.mjs && node scripts/check-api-contract.mjs
Codebase integrity OK — 4 public env vars all used, 1 Next.js config, no
unimplemented shipped handlers, 113 app files free of fixture data, 45 e2e
specs all in a project, 18 analytics events all sent, 81 server env vars all
forwarded by compose.
API contract OK — 96 frontend paths all resolve to registered routes.
```

## Изменённые файлы

- `apps/api/internal/shared/middleware/auth_rate_limiter.go` — настройка
  `unsubscribe`, паника вместо тихого пропуска, доковый комментарий.
- `apps/api/internal/router/users.go` — комментарий у
  `registerUnsubscribeRoute`.
- `apps/api/internal/shared/middleware/auth_rate_limiter_endpoints_test.go`
  (новый) — сторож `TestEveryRouterLimitCallHasAConfig`.
