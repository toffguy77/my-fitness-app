# Дыра в check-api-contract.mjs: не видел пути из локальных BASE-констант

## Статус

Исправлено, покрыто тестом, зелено на текущем dev. Настоящих несуществующих
путей на dev не найдено (см. ниже).

## Что было не так

`frontendCalls` собирал только строковые литералы, **начинающиеся** с `/api/`.
Широко распространённый в проекте уклад:

```ts
const BASE = '/api/v1/admin'
apiClient.get(`${BASE}/leads`)
```

даёт шаблонный литерал, начинающийся с `${BASE}`, а не с `/api/` — такая
строка никогда не попадала в проверку. `isBaseURL` (строка 76 старой версии)
дополнительно гасила тревогу даже про голый `/api/v1/admin`, если хоть один
маршрут начинался с него как с префикса.

## Правка

`scripts/check-api-contract.mjs`: добавлены `localConstants()` и
`resolveLocalBases()`. Перед сканированием файла модульного разбора нет —
только:

1. `localConstants(text)` — построчно, в пределах одного файла, ищет
   `const ИМЯ = 'литерал'` и `const ИМЯ = process.env.X || 'литерал'`
   (второе — под `API_BASE`, чьё настоящее значение в обычной настройке и есть
   строка-умолчание).
2. `resolveLocalBases(text)` — заменяет начало шаблонного литерала `` `${ИМЯ} ``
   на найденное значение, если `ИМЯ` — локальная константа. Дальше текст идёт
   через прежний код без изменений: та же нормализация `${...}` → `X`, та же
   обрезка query-строки, тот же `isBaseURL`.

Общий разбор TypeScript не заводился — сознательно, по заданию.

## Прогоны

```
$ node scripts/check-api-contract.mjs
API contract OK — 93 frontend paths all resolve to registered routes.
```

До правки (тот же dev, `git stash`):

```
$ node scripts/check-api-contract.mjs
API contract OK — 49 frontend paths all resolve to registered routes.
```

**Скрипт видит 93 пути вместо 49** — 44 дополнительных пути стали видны
(оценка «51 место в 7 файлах» из задания включала повторные вызовы,
нормализующиеся в один и тот же путь — отсюда разница 44 vs 51).

```
$ node scripts/check-codebase-integrity.mjs
Codebase integrity OK — 4 public env vars all used, 1 Next.js config, no
unimplemented shipped handlers, 113 app files free of fixture data, 42 e2e
specs all in a project, 18 analytics events all sent, 81 server env vars all
forwarded by compose.
```

```
$ node --test scripts/__tests__/check-api-contract.test.mjs
✔ a path built from a local BASE constant is detected when missing (38.7ms)
✔ a path built from a local BASE constant is not flagged when it exists (38.3ms)
✔ a plain /api/... literal is still detected when missing (37.7ms)
✔ a plain /api/... literal is still not flagged when it exists (37.4ms)
✔ an API_BASE that falls back to an empty string does not create a false alarm (39.2ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

## Реальны ли на dev пути, которых нет в бэкенде?

**Нет.** После правки скрипт зелёный на первом же прогоне — 93 пути, все
разрешились в зарегистрированные маршруты. Все 7 файлов с локальными BASE
(`account.ts`, `telegram.ts`, `chatApi.ts`, `adminApi.ts`, `curatorApi.ts`,
`preferencesApi.ts`, `deliveryApi.ts`) и три файла с `API_BASE`
(`auth.ts`, `verification.ts`, `api-client.ts`) не выдали ни одной находки.
Значит, вся эта поверхность звала существующие маршруты — просто никто это не
проверял.

## Доказательство мутацией

Временно вернул старое регулярное выражение (убрал вызов `resolveLocalBases`,
оставил сырой `readFileSync`), прогнал новый тест:

```
$ node --test scripts/__tests__/check-api-contract.test.mjs
✖ a path built from a local BASE constant is detected when missing (40.2ms)
  AssertionError [ERR_ASSERTION]: expected the script to fail:
  API contract OK — 1 frontend paths all resolve to registered routes.
  0 !== 1
✔ a path built from a local BASE constant is not flagged when it exists
✔ a plain /api/... literal is still detected when missing
✔ a plain /api/... literal is still not flagged when it exists
✔ an API_BASE that falls back to an empty string does not create a false alarm
ℹ tests 5
ℹ pass 4
ℹ fail 1
```

Ровно тест, завязанный на правку, покраснел (сообщил "OK" про путь, которого
на самом деле нет в golden-файле фикстуры); остальные четыре, не зависящие от
неё, остались зелёными. Затем правку вернул — `diff` с сохранённой копией до
мутации показал отсутствие различий.

## Файлы

- `scripts/check-api-contract.mjs` — правка сборщика путей.
- `scripts/__tests__/check-api-contract.test.mjs` — новый тест, гоняется
  `node --test scripts/__tests__/check-api-contract.test.mjs` (тот же
  запускальщик, что и `scripts/__tests__/dev-proxy.test.mjs`).

## Рамки

Приложение (`apps/web`, `apps/api`) не трогал — только `scripts/`.
