## Why

Фоновая работа в API сейчас сделана одной горутиной с тикером: `apps/api/internal/modules/content/scheduler.go:10-27` раз в минуту публикует запланированные статьи, запускается из `cmd/server/main.go:508`. Из этого следуют три проблемы.

1. **Небезопасно при нескольких инстансах.** Вторая реплика опубликует те же статьи повторно и разошлёт дублирующиеся уведомления. Сейчас прод — один инстанс, но это неявное допущение, зашитое в код, а не решение.
2. **Часть фоновой работы просто не выполняется.** `apps/api/internal/modules/curator/snapshots.go:11` — `CollectDailySnapshot` не вызывается нигде, кроме тестов и объявления в интерфейсе. Нет ни планировщика, ни эндпоинта. Поэтому `GET /curator/analytics/history` и `GET /curator/analytics/benchmark` всегда возвращают пустоту, а три таблицы из миграции `041_curator_analytics_snapshots_up.sql` (`curator_daily_snapshots`, `curator_weekly_snapshots`, `platform_weekly_benchmarks`) не пишутся ничем. У кураторов есть раздел аналитики, который никогда не наполнится.
3. **Нет уборки.** `apps/api/internal/shared/middleware/rate_limiter.go:134` — `CleanupOldAttempts` тоже не вызывается: таблица `password_reset_attempts` растёт бесконечно. То же ждёт таблицу `ws_tickets` из изменения `secure-token-lifecycle`.

Нужен один механизм периодических задач: с блокировкой, наблюдаемый, с местом, куда добавлять новые задачи.

## What Changes

- Вводится пакет `internal/shared/jobs`: реестр периодических задач, планировщик, захват межпроцессной блокировки через PostgreSQL advisory lock, запись результатов выполнения.
- Публикация запланированных статей переносится из `content.RunScheduler` в задачу реестра; поведение снаружи не меняется.
- Включается сбор снапшотов кураторской аналитики: ежедневная задача наполняет `curator_daily_snapshots`, еженедельная — `curator_weekly_snapshots` и `platform_weekly_benchmarks`. Разделы «История» и «Бенчмарк» у куратора начинают работать.
- Добавляются задачи уборки: просроченные попытки сброса пароля, использованные и просроченные WebSocket-тикеты, отозванные refresh-токены старше срока хранения.
- Добавляется таблица `job_runs` с историей запусков (задача, время начала и конца, результат, ошибка) и эндпоинт `GET /api/v1/admin/jobs` для супер-администратора.
- Graceful shutdown ожидает завершения текущего запуска задачи, а не только отменяет контекст.
- Добавляется ручной запуск задачи супер-администратором: `POST /api/v1/admin/jobs/:name/run` — нужен для первичного наполнения снапшотов и для диагностики.

## Capabilities

### New Capabilities

- `background-jobs`: как объявляются, планируются и выполняются периодические задачи; гарантии при нескольких инстансах; наблюдаемость и ручной запуск.
- `curator-analytics-history`: наполнение и выдача исторических и бенчмарк-метрик куратора.

### Modified Capabilities

<!-- Существующих спеков на фоновые задачи нет -->

## Impact

**Бэкенд:**
- Новый пакет `apps/api/internal/shared/jobs/` — `registry.go`, `scheduler.go`, `lock.go`, `store.go` и тесты.
- `apps/api/internal/modules/content/scheduler.go` — удаляется, публикация переносится в задачу.
- `apps/api/internal/modules/curator/snapshots.go` — `CollectDailySnapshot` вызывается задачей; добавляются `CollectWeeklySnapshot` и `CollectPlatformBenchmark`, которых сейчас нет.
- `apps/api/internal/shared/middleware/rate_limiter.go:134` — `CleanupOldAttempts` подключается к задаче уборки.
- `apps/api/cmd/server/main.go:506-509,528-541` — запуск планировщика через реестр, ожидание завершения при остановке.
- `apps/api/internal/modules/admin/` — обработчики `GET /admin/jobs` и `POST /admin/jobs/:name/run`.
- Новая миграция `046_job_runs`.

**Фронтенд:**
- `apps/web/src/features/curator/` — разделы истории и бенчмарка перестают быть пустыми; проверить состояния «нет данных» для первых дней после включения.

**Зависимости:** новых нет — advisory lock штатный в PostgreSQL.

**Порядок:** после `fix-authorization-gaps` (регистрация роутов) и `secure-token-lifecycle` (задача уборки `ws_tickets` появляется вместе с таблицей).
