## Why

Изоляция данных между пользователями держится исключительно на прикладном коде: миграция `004_dashboard_rls_policies_up.sql` включила Row Level Security, миграция `015_disable_rls_policies_up.sql` её отключила, а `apps/api/internal/shared/middleware/rls.go` и ветки `WithRLSConn` в `apps/api/internal/shared/database/postgres.go:217-250` остались мёртвым кодом — middleware нигде не регистрируется. Значит один забытый `WHERE user_id` = утечка данных, и защитной сетки на уровне БД нет.

Это уже произошло. `GET /api/v1/curator/clients/:id/targets/history` (`cmd/server/main.go:444`) ведёт в `internal/modules/nutrition-calc/handler.go:163-193`, который проверяет только факт аутентификации и сразу вызывает `GetHistory(clientID)`. Это единственный из двадцати curator-роутов без `verifyRelationship` — любой куратор читает историю КБЖУ-целей чужого клиента. Найти это глазами тяжело, потому что все ~100 роутов регистрируются в одном 542-строчном `main.go`.

Дополнительно, авторизационные решения местами принимаются по подстрокам текста ошибки: `internal/modules/chat/handler.go:318` — `strings.Contains(err.Error(), "only the curator")`, при том что в проекте есть `internal/shared/apperrors`.

## What Changes

- Закрыта IDOR-уязвимость: `GetClientHistory` проверяет активную связь куратор↔клиент перед выдачей данных.
- Введён единый механизм проверки владения ресурсом: middleware `RequireClientRelationship` для всех роутов `/curator/clients/:id/*` — проверка перестаёт быть обязанностью каждого сервиса и становится свойством группы роутов.
- Регистрация роутов вынесена из `cmd/server/main.go` в `internal/router/` с разбивкой по доменам. `main.go` остаётся точкой сборки зависимостей.
- Введён тест-матрица «чужой пользователь → 403»: для каждого роута, принимающего идентификатор чужого ресурса, существует тест, проверяющий отказ. Отсутствие такого теста ломает сборку.
- Авторизационные ошибки переводятся на `apperrors.ErrForbidden`/`ErrNotFound`; сравнение по подстрокам текста ошибки удаляется.
- **BREAKING (внутреннее):** удаляются мёртвые `middleware/rls.go`, `database.WithRLSConn`, `rlsConnFromContext` и связанные ветки в `QueryContext`/`QueryRowContext`/`ExecContext`, а также миграции RLS помечаются как исторические. Внешнее поведение API не меняется.

## Capabilities

### New Capabilities

- `resource-authorization`: правила доступа к чужим ресурсам — какие роуты требуют проверки владения, что возвращается при отказе, и обязательство покрывать каждый такой роут негативным тестом.

### Modified Capabilities

<!-- Существующих спеков на авторизацию нет -->

## Impact

**Бэкенд:**
- `apps/api/internal/modules/nutrition-calc/handler.go:163-193` — добавить проверку связи (исправление уязвимости).
- `apps/api/internal/shared/middleware/relationship.go` — новый файл, middleware `RequireClientRelationship`.
- `apps/api/internal/router/` — новый пакет: `router.go`, `auth.go`, `curator.go`, `admin.go`, `content.go`, `chat.go`, `tracker.go`.
- `apps/api/cmd/server/main.go` — сокращается до сборки зависимостей и запуска; регистрация ~100 роутов уезжает в `internal/router/`.
- `apps/api/internal/shared/middleware/rls.go` — удаляется.
- `apps/api/internal/shared/database/postgres.go:217-250` — удаляются ветки RLS-соединения.
- `apps/api/internal/modules/chat/handler.go:318` и аналогичные — переход на `errors.Is` с `apperrors`.
- `apps/api/internal/modules/curator/service.go` — `verifyRelationship` остаётся как defence-in-depth, но перестаёт быть единственной защитой.

**Тесты:**
- `apps/api/internal/router/authorization_matrix_test.go` — новый: перечень защищаемых роутов и негативные тесты.

**Зависимости:** новых нет.

**Связанные изменения:** `harden-api-limits` трогает те же хендлеры (загрузки, пагинация) — мержить после этого изменения, чтобы не конфликтовать по `main.go`.
