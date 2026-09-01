## 1. Подготовка окружений

- [x] 1.1 Выгрузить фактические наборы переменных окружения из Dokploy для dev и prod, сверить со списком из `config.go`. Проверка: сверка выполнена через API Dokploy (`compose.one`).
  **Результат (2026-09-01):** dev — 56 переменных, prod — 53; разница только в трёх отладочных `NEXT_PUBLIC_*` на dev. Всё, что `config.validate()` требует в production, на проде задано: `DB_PASSWORD`, `JWT_SECRET` (44 байта, не плейсхолдер), `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS`, `APP_DOMAIN`. Новые опциональные (`YANDEX_*`, `VK_*`, `TELEGRAM_*`, `SUPPORT_*`) не заданы — соответствующие возможности выключены и об этом сообщается в `/health`.
- [x] 1.2 Проставить недостающие обязательные переменные в Dokploy. Проверка: недостающих обязательных переменных не оказалось — см. 1.1.

## 2. Валидация конфигурации

- [x] 2.1 Добавить в `apps/api/internal/config/config.go` тип `Features` с флагами `FoodRecognition`, `WeeklyPhotos`, `ChatAttachments`, `ContentMedia`, `ProfileAvatars`, `Email` и заполнять его в `Load()`. Проверка: `go build ./...` проходит.
- [x] 2.2 Реализовать `func (c *Config) validate() error`: обязательные переменные в `production`, проверка длины и плейсхолдеров `JWT_SECRET`, агрегация через `errors.Join`. Проверка: unit-тесты из 2.4.
- [x] 2.3 Убрать небезопасный дефолт `JWT_SECRET` для `production`, оставить дефолт с `WARN` для остальных окружений. Проверка: тест сценария «дефолтный секрет в development».
- [x] 2.4 Создать `apps/api/internal/config/config_test.go` с матрицей: prod без `JWT_SECRET`, prod с коротким секретом, prod с плейсхолдером, prod полный набор, dev без переменных, несколько проблем одновременно. Проверка: `go test ./internal/config/ -run TestConfig -v` — все сценарии спека покрыты.

## 3. Поведение сервиса

- [x] 3.1 В `apps/api/cmd/server/main.go` развернуть агрегированную ошибку и напечатать по строке на проблему перед `log.Fatal`. Проверка: ручной запуск с двумя незаданными переменными печатает две строки.
- [x] 3.2 Добавить в `main.go` лог уровня `WARN` при старте с перечнем выключенных опциональных возможностей. Проверка: запуск без `OPENROUTER_API_KEY` печатает предупреждение.
- [x] 3.3 Добавить в `/health` поле `features`. Проверка: `curl localhost:4000/health | jq .features` возвращает объект с булевыми значениями.
- [x] 3.4 Перевести проверки доступности возможностей в хендлерах с `nil`-проверок на `cfg.Features` и привести ответ к единому `503` с русским сообщением: `food-tracker/handler.go:359-362`, `users/handler.go` (аватар), `chat/handler.go` (вложения), `dashboard/handler.go` (фото), `content/handler.go` (медиа). Проверка: `go test ./internal/modules/...` зелёные, добавлен тест на `503` для каждой возможности.

## 4. Документация окружения

- [x] 4.1 Синхронизировать `apps/api/.env.example` с фактическим списком переменных из `config.go`, пометив обязательные и опциональные. Проверка: скрипт/ручная сверка — каждая переменная из `getEnv`/`getEnvAsInt`/`getEnvWithFallback` присутствует в примере.
- [x] 4.2 Обновить `.env.README.md` и `deploy/env/.env.*.example` тем же списком с пометкой «обязательна в production». Проверка: ревью PR.

## 5. Выкатка

- [x] 5.1 Задеплоить на dev, убедиться, что контейнер поднялся и `/health` отдаёт `features`. Проверка: выполнено 2026-09-01, `https://new.burcev.team/ready` отдаёт `{"checks":{"database":"ok"},"features":{...,"support_bot":false},"ready":true}`.
- [ ] 5.2 Задеплоить на prod, повторить проверку. Проверка: `curl https://burcev.team/health` возвращает `200` и корректный `features`.
