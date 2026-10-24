## Why

Шаги, вес и тренировки сейчас вводятся только руками. В веб-настройках
есть переключатель «Синхронизация с Apple Здоровье», но он не работает:
- `AppleHealthToggle.tsx` откатывает флаг и показывает «Скоро будет доступно»;
- в `routes.golden` нет ни одного маршрута импорта.

Куратор видит дыры в данных там, где у клиента на руке часы, а в ванной —
весы, которые уже пишут всё в Здоровье. Ручной ввод шагов — главный источник
пропусков в «Требуют внимания» (`inactive`) и в недельных отчётах (вес ≥5/7 дней).

## What Changes

- `POST /api/v1/health/import` — пакетный идемпотентный приём:
  - дневная сумма шагов, вес, тренировки;
  - у каждой записи источник (`healthkit`) и внешний id;
  - удалённые в Здоровье тренировки убираются.
- У метрик дня появляется источник (`manual` | `healthkit`):
  - импорт не перезаписывает введённое вручную;
  - ручной ввод перекрывает импорт.
- `GET dashboard/daily/:date`, `GET dashboard/week` и карточка клиента у
  куратора отдают источник метрики. Интерфейсы подписывают «из Здоровья».
- `apple_health_enabled` в `user_settings` становится настоящим признаком:
  - приложение ставит его при подключении и снимает при отключении; импорт
    при снятом признаке отклоняется;
  - веб-переключатель заменяется пояснением «Подключается в приложении на iPhone».
- В iOS-приложении:
  - экран подключения с объяснением до системного запроса;
  - чтение шагов, веса и тренировок с фоновой доставкой;
  - запись еды (энергия, белки, жиры, углеводы) и воды в Здоровье с
    синхронизацией правок и удалений.

## Capabilities

### New Capabilities
- `health-import`: серверный приём данных Здоровья — формат, идемпотентность, границы суток, удаление.
- `daily-metric-source`: источник у метрик дня и правило старшинства ручного ввода.
- `healthkit-client`: поведение iOS-приложения — разрешения, фоновое чтение, запись еды и воды, отключение.

### Modified Capabilities
<!-- нет: существующие спеки не описывают ни Apple Health, ни источник метрик -->

## Impact

**Бэкенд**
- `apps/api/internal/router/tracker.go:61` — рядом с `POST /daily` новый маршрут `POST /health/import` (группа `/api/v1/health`); `routes.golden`.
- `apps/api/internal/modules/dashboard/service.go:162` — `SaveMetric` ставит источник `manual`; новый `ImportHealth` в отдельном файле `health_import.go`.
- `apps/api/internal/modules/dashboard/types.go:315-364` — `MetricUpdate`, ответы дня и недели получают `*_source`.
- `apps/api/migrations/003_create_dashboard_tables_up.sql:33-58` — исходная схема `daily_metrics`. Новая миграция добавляет:
  - `steps_source`, `weight_source`, `workout_source`;
  - таблицу `health_workouts (user_id, external_id, date, type, duration_min, started_at)`.

  Номер выбирается по `schema_migrations` dev и прода.
- `apps/api/migrations/014_user_settings_up.sql:30` — `apple_health_enabled` уже есть, схема не меняется.
- `apps/api/internal/modules/curator/` — карточка клиента отдаёт источник веса и шагов.

**Веб**
- `apps/web/src/shared/components/settings/AppleHealthToggle.tsx` (47 строк) — переключатель заменяется пояснением и состоянием «подключено на iPhone».
- `apps/web/src/features/dashboard/components/` — подпись «из Здоровья» у шагов и веса.

**iOS** — модуль `Health` в `apps/ios` (`ios-app-foundation`).

**Документация** — `docs/user-guide/07-настройка-профиля.md` и раздел про дашборд; `make sync-knowledge`.
