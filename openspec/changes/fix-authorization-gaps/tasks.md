## 1. Немедленное закрытие уязвимости

- [x] 1.1 В `apps/api/internal/modules/nutrition-calc/handler.go:163-193` добавить проверку активной связи куратор↔клиент перед вызовом `GetHistory`; при отсутствии связи вернуть `403`. Проверка: новый тест `TestGetClientHistory_ForeignClient_Forbidden` в `nutrition-calc/handler_test.go` падает до правки и проходит после.
- [x] 1.2 Выкатить исправление 1.1 отдельным коммитом с типом `fix`, не дожидаясь остальных задач. Проверка: коммит смержен, CI зелёный.

## 2. Middleware проверки связи

- [x] 2.1 Создать `apps/api/internal/shared/middleware/relationship.go` с `RequireClientRelationship(db *database.DB, log *logger.Logger) gin.HandlerFunc`: читает `:id`, берёт `user_id` из контекста, проверяет `curator_client_relationships.status = 'active'`, кладёт `client_id` в контекст, иначе отвечает `403`. Проверка: `go build ./...`.
- [x] 2.2 Написать `relationship_test.go`: связь есть, связи нет, связь неактивна, некорректный `:id`, отсутствующий `user_id`. Проверка: `go test ./internal/shared/middleware/ -run TestRequireClientRelationship -v`.
- [x] 2.3 Убедиться, что при отказе обработчик не вызывается (счётчик вызовов в тестовом обработчике равен нулю). Проверка: сценарий спека «Обработчик не вызывается при отказе».

## 3. Вынос роутера

- [x] 3.1 Зафиксировать golden-снимок текущих маршрутов: тест, печатающий отсортированный список `method path handlersCount` из `gin.Engine`, сохранить в `internal/router/testdata/routes.golden`. Проверка: тест проходит на текущем `main.go`.
- [x] 3.2 Создать пакет `apps/api/internal/router` с `Deps` (все хендлеры, cfg, log, db) и `New(deps Deps) *gin.Engine`, перенеся глобальные middleware, `/health` и `/ws`. Проверка: `go build ./...`.
- [x] 3.3 Перенести регистрацию роутов по доменным файлам: `auth.go`, `users.go`, `tracker.go`, `dashboard.go`, `chat.go`, `curator.go`, `admin.go`, `content.go`, `notifications.go`, `logs.go`. Проверка: golden-снимок из 3.1 совпадает.
- [x] 3.4 Сократить `cmd/server/main.go` до загрузки конфигурации, сборки зависимостей, вызова `router.New` и graceful shutdown. Проверка: `main.go` короче 200 строк, golden-снимок совпадает.
- [x] 3.5 Повесить `RequireClientRelationship` на подгруппу `/curator/clients/:id` и убрать дублирующий параметр `clientID` из сигнатур, где он теперь берётся из контекста. Проверка: `go test ./...` зелёные, golden-снимок обновлён осознанно (изменилось только количество handlers на группе).

## 4. Реестр и матрица тестов

- [x] 4.1 Создать `apps/api/internal/router/authorization_matrix_test.go` с реестром `protectedRoutes` (метод, путь, способ проверки) и тестом, который обходит `engine.Routes()` и падает на маршруте с параметром чужого идентификатора вне реестра. Проверка: временно добавленный маршрут `/curator/clients/:id/probe` роняет тест.
- [x] 4.2 Для каждой записи реестра добавить негативный тест «пользователь без прав → 403». Проверка: `go test ./internal/router/ -run TestAuthorizationMatrix -v` — число проверок равно числу записей реестра.
- [x] 4.3 Внести реестр и его назначение в `CLAUDE.md` (раздел про добавление роутов). Проверка: ревью PR.

## 5. Типизация ошибок

- [x] 5.1 Заменить в `internal/modules/chat/handler.go:318` и во всех аналогичных местах сравнение по подстроке на `errors.Is` с `apperrors.ErrForbidden` / `apperrors.ErrNotFound`; при необходимости обернуть ошибки в сервисах. Проверка: `grep -rn "strings.Contains(err.Error()" apps/api` не находит совпадений.
- [x] 5.2 Добавить тесты на маппинг типизированных ошибок в HTTP-статусы. Проверка: `go test ./internal/modules/chat/ -v`.

## 6. Удаление мёртвого RLS

- [x] 6.1 Удалить `apps/api/internal/shared/middleware/rls.go` и его тесты, если есть. Проверка: `go build ./...`.
- [x] 6.2 Удалить `WithRLSConn`, `rlsConnFromContext` и ветвление RLS в `QueryContext`/`QueryRowContext`/`ExecContext` в `internal/shared/database/postgres.go:217-250`. Проверка: `go test ./...` зелёные.
- [x] 6.3 Добавить в `CLAUDE.md` строку о том, что RLS отключён миграцией 015 и изоляция данных обеспечивается прикладным слоем и реестром маршрутов. Проверка: ревью PR.
- [x] 6.4 Проверить отсутствие упоминаний: `grep -rn "RLSContext\|WithRLSConn\|rlsConnFromContext" apps/api/internal` — пусто. Проверка: команда возвращает пустой вывод.

## 7. Выкатка

- [ ] 7.1 Задеплоить на dev, вручную проверить сценарий чужого клиента через два кураторских аккаунта. Проверка: второй куратор получает `403`.
- [ ] 7.2 Задеплоить на prod, повторить проверку. Проверка: `403` на чужом клиенте, `200` на своём.
