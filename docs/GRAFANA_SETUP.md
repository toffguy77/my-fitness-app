# Grafana Dashboard Setup для My Fitness App

Этот документ описывает, как настроить Grafana для мониторинга метрик приложения My Fitness App.

## Метрики приложения

Приложение экспортирует метрики Prometheus на эндпоинте `/metrics`. Все метрики доступны в формате Prometheus text format.

### RED метрики (HTTP запросы)

- **http_requests_total** (counter) - общее количество HTTP запросов
  - Labels: `route`, `method`, `status_code`
  
- **http_request_duration_seconds** (histogram) - длительность HTTP запросов
  - Labels: `route`, `method`, `status_code`
  - Buckets: стандартные Prometheus buckets (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10)
  
- **http_requests_errors_total** (counter) - количество ошибок HTTP запросов
  - Labels: `route`, `method`, `status_code`, `error_type`

### Метрики ошибок

- **errors_total** (counter) - общее количество ошибок
  - Labels: `type`, `error_code`, `severity`
  
- **errors_critical_total** (counter) - количество критических ошибок
  - Labels: `type`
  
- **errors_database_total** (counter) - количество ошибок базы данных
  - Labels: `code`

### Бизнес метрики

- **registrations_total** (counter) - общее количество попыток регистрации
  - Labels: `source` (invite_code | direct)
  
- **registrations_completed_total** (counter) - количество успешных регистраций
  - Labels: `source`
  
- **subscriptions_total** (counter) - общее количество подписок
- **subscriptions_active_gauge** (gauge) - текущее количество активных подписок

### Метрики пользовательской активности

- **weight_logged_total** (counter) - количество записей веса
- **meals_saved_total** (counter) - количество сохраненных приемов пищи
- **daily_logs_completed_total** (counter) - количество завершенных дневных логов
- **reports_viewed_total** (counter) - количество просмотров отчетов

### Аналитические метрики

- **analytics_events_total** (counter) - общее количество аналитических событий
  - Labels: `event_type`, `event_name`, `session_id` (опционально), `user_id` (опционально)
  
- **dau_total** (counter) - Daily Active Users
  - Labels: `event_type`, `event_name`, `session_id`, `user_id` (опционально)
  
- **session_duration_seconds** (histogram) - длительность сессии пользователя
  - Labels: различные в зависимости от события
  
- **ttfv_seconds** (histogram) - Time to First Value (время до первого сохранения данных)

## Настройка Prometheus

1. Добавьте job в `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'my-fitness-app'
    scrape_interval: 30s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['localhost:3069']  # Измените на ваш адрес приложения
```

2. Если приложение работает за reverse proxy, убедитесь, что путь `/metrics` доступен.

## Импорт дашборда в Grafana

1. Откройте Grafana (обычно `http://localhost:3000`)
2. Перейдите в **Dashboards** → **Import**
3. Скопируйте содержимое файла `docs/grafana-dashboard.json`
4. Вставьте JSON в поле импорта
5. Выберите источник данных Prometheus
6. Нажмите **Import**

Альтернативно, вы можете использовать API Grafana:

```bash
curl -X POST \
  http://admin:admin@localhost:3000/api/dashboards/db \
  -H 'Content-Type: application/json' \
  -d @docs/grafana-dashboard.json
```

## Структура дашборда

Дашборд содержит следующие панели:

1. **HTTP Requests Rate** - график скорости HTTP запросов по роутам
2. **HTTP Request Duration** - график длительности запросов (p50, p95, p99)
3. **HTTP Error Rate** - график ошибок HTTP запросов
4. **HTTP Requests by Status Code** - круговая диаграмма по статус-кодам
5. **Total Errors** - график общих ошибок и критических ошибок
6. **Database Errors** - график ошибок базы данных
7. **Registrations** - график регистраций
8. **Subscriptions** - график подписок
9. **User Engagement** - график активности пользователей (вес, приемы пищи, дневные логи)
10. **Reports Viewed** - график просмотров отчетов
11. **Analytics Events** - график аналитических событий
12. **Daily Active Users (DAU)** - график ежедневных активных пользователей
13. **Session Duration** - график длительности сессий
14. **Time to First Value (TTFV)** - график времени до первого сохранения
15. **Top Routes by Request Count** - таблица топ-10 роутов
16. **Error Summary Table** - таблица ошибок по типам

## Настройка алертов

Рекомендуется настроить алерты для следующих метрик:

1. **Высокий уровень ошибок HTTP**:
   ```
   rate(http_requests_errors_total[5m]) > 10
   ```

2. **Высокая длительность запросов**:
   ```
   histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
   ```

3. **Критические ошибки**:
   ```
   rate(errors_critical_total[5m]) > 0
   ```

4. **Ошибки базы данных**:
   ```
   rate(errors_database_total[5m]) > 5
   ```

## Обновление дашборда

При добавлении новых метрик в приложение, обновите файл `docs/grafana-dashboard.json` и переимпортируйте дашборд в Grafana.

