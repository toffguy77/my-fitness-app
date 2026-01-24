# Система логирования

## Обзор

Комплексная система логирования для frontend (React/TypeScript) и backend (Go), обеспечивающая:
- ✅ Уровни критичности (DEBUG, INFO, WARN, ERROR, FATAL)
- ✅ Человекочитаемый формат (development)
- ✅ Машиночитаемый формат (production, JSON)
- ✅ Структурированные логи с контекстом
- ✅ Автоматическое обогащение метаданными
- ✅ Централизованный сбор логов
- ✅ Трассировка запросов (request ID)

## Backend Logging (Go)

### Уровни логирования

```go
logger.Debug("Отладочная информация", "key", "value")
logger.Info("Информационное сообщение", "key", "value")
logger.Warn("Предупреждение", "key", "value")
logger.Error("Ошибка", "key", "value")
logger.Fatal("Критическая ошибка", "key", "value") // Завершает программу
```

### Базовое использование

```go
package main

import (
    "github.com/burcev/api/internal/shared/logger"
)

func main() {
    log := logger.New()
    defer log.Sync() // Flush буфера перед выходом

    // Простое логирование
    log.Info("Application started")

    // С контекстом
    log.Info("User logged in", "user_id", "123", "email", "user@example.com")

    // С ошибкой
    err := someFunction()
    if err != nil {
        log.Error("Function failed", "error", err, "function", "someFunction")
    }
}
```

### Логирование с контекстом

```go
// Добавление полей к logger
logWithFields := log.WithFields(map[string]interface{}{
    "user_id": "123",
    "session_id": "abc-def",
    "ip": "192.168.1.1",
})

logWithFields.Info("User action performed")
logWithFields.Warn("Suspicious activity detected")

// Добавление одного поля
logWithUser := log.WithField("user_id", "123")
logWithUser.Info("Processing request")

// Добавление ошибки
logWithError := log.WithError(err)
logWithError.Error("Operation failed")
```

### Логирование HTTP запросов

```go
// Автоматически через middleware
func setupRouter(log *logger.Logger) *gin.Engine {
    r := gin.New()
    r.Use(middleware.Logger(log))
    // ...
    return r
}

// Вручную
log.LogHTTPRequest(
    "GET",
    "/api/users",
    200,
    time.Millisecond * 150,
    map[string]interface{}{
        "user_id": "123",
        "query": "page=1",
    },
)
```

### Логирование запросов к БД

```go
start := time.Now()
result, err := db.Query("SELECT * FROM users WHERE id = ?", userID)
duration := time.Since(start)

log.LogDatabaseQuery(
    "SELECT * FROM users WHERE id = ?",
    duration,
    err,
    map[string]interface{}{
        "user_id": userID,
        "rows_affected": result.RowsAffected(),
    },
)
```

### Логирование бизнес-событий

```go
log.LogBusinessEvent("user_registered", map[string]interface{}{
    "user_id": "123",
    "email": "user@example.com",
    "plan": "premium",
    "referral_code": "ABC123",
})

log.LogBusinessEvent("payment_processed", map[string]interface{}{
    "user_id": "123",
    "amount": 99.99,
    "currency": "USD",
    "payment_method": "card",
})
```

### Логирование событий безопасности

```go
log.LogSecurityEvent(
    "failed_login_attempt",
    "high",
    map[string]interface{}{
        "email": "user@example.com",
        "ip": "192.168.1.1",
        "attempts": 5,
    },
)

log.LogSecurityEvent(
    "suspicious_api_access",
    "critical",
    map[string]interface{}{
        "user_id": "123",
        "endpoint": "/admin/users",
        "reason": "unauthorized_role",
    },
)
```

### Формат логов

**Development (console, human-readable):**
```
2026-01-24T21:45:30.123+0300    INFO    auth/service.go:45    User logged in    
{"user_id": "123", "email": "user@example.com", "ip": "192.168.1.1"}
```

**Production (JSON, machine-readable):**
```json
{
  "level": "info",
  "timestamp": "2026-01-24T18:45:30.123Z",
  "caller": "auth/service.go:45",
  "message": "User logged in",
  "user_id": "123",
  "email": "user@example.com",
  "ip": "192.168.1.1",
  "request_id": "abc-def-123",
  "trace_id": "xyz-789"
}
```

## Frontend Logging (React/TypeScript)

### Уровни логирования

```typescript
import { logger } from '@/shared/utils/logger'

logger.debug('Отладочная информация', { key: 'value' })
logger.info('Информационное сообщение', { key: 'value' })
logger.warn('Предупреждение', { key: 'value' })
logger.error('Ошибка', error, { key: 'value' })
logger.fatal('Критическая ошибка', error, { key: 'value' })
```

### Базовое использование

```typescript
import { logger } from '@/shared/utils/logger'

// Простое логирование
logger.info('Page loaded')

// С контекстом
logger.info('User action', {
  action: 'button_click',
  button_id: 'submit',
  page: '/dashboard',
})

// С ошибкой
try {
  await fetchData()
} catch (error) {
  logger.error('Failed to fetch data', error as Error, {
    endpoint: '/api/data',
    retry_count: 3,
  })
}
```

### Использование в React компонентах

```typescript
'use client'

import { useLogger } from '@/shared/hooks/useLogger'

export default function MyComponent() {
  const { info, error, logUserAction } = useLogger({
    component: 'MyComponent',
    autoLogMount: true,
    autoLogUnmount: true,
  })

  const handleClick = () => {
    logUserAction('button_clicked', {
      button_id: 'submit',
      form_data: { /* ... */ },
    })

    try {
      // Some action
      info('Action completed successfully')
    } catch (err) {
      error('Action failed', err as Error, {
        action: 'submit_form',
      })
    }
  }

  return <button onClick={handleClick}>Submit</button>
}
```

### Логирование API вызовов

```typescript
import { logger } from '@/shared/utils/logger'

async function fetchUserData(userId: string) {
  const start = Date.now()
  const url = `/api/users/${userId}`

  try {
    const response = await fetch(url)
    const duration = Date.now() - start

    logger.logAPICall(
      'GET',
      url,
      response.status,
      duration,
      { user_id: userId }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    const duration = Date.now() - start
    logger.logAPICall('GET', url, 0, duration, {
      user_id: userId,
      error: (error as Error).message,
    })
    throw error
  }
}
```

### Логирование действий пользователя

```typescript
import { logger } from '@/shared/utils/logger'

// Клик по кнопке
logger.logUserAction('button_click', {
  button_id: 'add_to_cart',
  product_id: '123',
})

// Навигация
logger.logUserAction('page_view', {
  page: '/products',
  referrer: document.referrer,
})

// Отправка формы
logger.logUserAction('form_submit', {
  form_id: 'registration',
  fields: ['email', 'name', 'password'],
})
```

### Логирование производительности

```typescript
import { logger } from '@/shared/utils/logger'

// Измерение времени выполнения
const start = performance.now()
await heavyOperation()
const duration = performance.now() - start

logger.logPerformance('heavy_operation', duration, {
  operation: 'data_processing',
  items_count: 1000,
})

// Web Vitals
logger.logPerformance('LCP', 2500, {
  metric: 'Largest Contentful Paint',
  page: '/dashboard',
})
```

### Error Boundary

```typescript
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary
      fallback={<div>Произошла ошибка</div>}
      onError={(error, errorInfo) => {
        // Дополнительная обработка
        console.error('Error caught:', error, errorInfo)
      }}
    >
      <YourApp />
    </ErrorBoundary>
  )
}
```

### Установка User ID

```typescript
import { logger } from '@/shared/utils/logger'

// После успешной аутентификации
logger.setUserId(user.id)

// При выходе
logger.clearUserId()
```

### Формат логов

**Development (console, human-readable):**
```
[2026-01-24T21:45:30.123Z] [INFO] User action {
  "action": "button_click",
  "component": "Dashboard",
  "user_id": "123"
}
```

**Production (отправляется на сервер, JSON):**
```json
{
  "level": "info",
  "message": "User action",
  "timestamp": "2026-01-24T18:45:30.123Z",
  "context": {
    "action": "button_click",
    "component": "Dashboard"
  },
  "userId": "123",
  "sessionId": "abc-def-123",
  "url": "https://app.example.com/dashboard",
  "userAgent": "Mozilla/5.0..."
}
```

## Централизованный сбор логов

### Backend endpoint

```go
// apps/api/cmd/server/main.go
import "github.com/burcev/api/internal/modules/logs"

func setupRouter(cfg *config.Config, log *logger.Logger) *gin.Engine {
    r := gin.New()
    
    // Logs handler
    logsHandler := logs.NewHandler(cfg, log)
    r.POST("/api/logs", logsHandler.ReceiveLogs)
    
    return r
}
```

### Frontend конфигурация

```typescript
// apps/web/src/shared/utils/logger.ts
const logger = new Logger({
  enableRemote: process.env.NODE_ENV === 'production',
  remoteEndpoint: process.env.NEXT_PUBLIC_API_URL + '/api/logs',
  maxBatchSize: 50,
  flushInterval: 10000, // 10 секунд
})
```

## Best Practices

### 1. Используйте правильные уровни

```typescript
// ✅ Правильно
logger.debug('Cache hit', { key: 'user:123' })
logger.info('User logged in', { user_id: '123' })
logger.warn('API rate limit approaching', { remaining: 10 })
logger.error('Payment failed', error, { amount: 99.99 })
logger.fatal('Database connection lost', error)

// ❌ Неправильно
logger.error('User clicked button') // Слишком критично
logger.debug('Payment failed') // Недостаточно критично
```

### 2. Добавляйте контекст

```typescript
// ✅ Правильно
logger.error('Failed to save user', error, {
  user_id: '123',
  operation: 'update_profile',
  fields: ['email', 'name'],
  retry_count: 3,
})

// ❌ Неправильно
logger.error('Error', error)
```

### 3. Не логируйте чувствительные данные

```typescript
// ✅ Правильно
logger.info('User registered', {
  user_id: '123',
  email_domain: 'example.com',
})

// ❌ Неправильно
logger.info('User registered', {
  email: 'user@example.com',
  password: 'secret123',
  credit_card: '1234-5678-9012-3456',
})
```

### 4. Используйте структурированные логи

```typescript
// ✅ Правильно
logger.info('Payment processed', {
  payment_id: 'pay_123',
  amount: 99.99,
  currency: 'USD',
  status: 'success',
})

// ❌ Неправильно
logger.info(`Payment pay_123 for $99.99 USD processed successfully`)
```

### 5. Логируйте начало и конец операций

```typescript
// ✅ Правильно
logger.info('Starting data export', { user_id: '123', format: 'csv' })
try {
  await exportData()
  logger.info('Data export completed', { user_id: '123', rows: 1000 })
} catch (error) {
  logger.error('Data export failed', error, { user_id: '123' })
}
```

## Мониторинг и анализ

### Поиск по логам

**По уровню:**
```bash
# Backend
grep "ERROR" logs/app.log

# Frontend (в консоли браузера)
# Фильтр по уровню в DevTools
```

**По пользователю:**
```bash
grep "user_id.*123" logs/app.log
```

**По request ID:**
```bash
grep "request_id.*abc-def-123" logs/app.log
```

### Метрики

- Количество ошибок в минуту
- Средняя длительность HTTP запросов
- Количество медленных запросов к БД (>1s)
- Количество событий безопасности

### Алерты

Настройте алерты на:
- ERROR и FATAL логи
- Высокая частота предупреждений
- События безопасности с severity "critical"
- Медленные запросы

## Примеры интеграции

### Express/Gin middleware

```go
r.Use(middleware.Logger(log))
r.Use(middleware.ErrorHandler(log))
```

### React Error Boundary

```typescript
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

### API клиент с логированием

```typescript
const apiClient = {
  async get(url: string) {
    const start = Date.now()
    try {
      const response = await fetch(url)
      logger.logAPICall('GET', url, response.status, Date.now() - start)
      return response
    } catch (error) {
      logger.error('API call failed', error as Error, { url })
      throw error
    }
  },
}
```

## Troubleshooting

### Логи не отправляются на сервер

1. Проверьте `NEXT_PUBLIC_API_URL` в `.env.local`
2. Проверьте CORS настройки на backend
3. Проверьте Network tab в DevTools

### Слишком много логов

1. Увеличьте `minLevel` до `INFO` или `WARN`
2. Уменьшите `maxBatchSize`
3. Увеличьте `flushInterval`

### Логи не читаемы

1. В development используется console формат
2. В production используется JSON формат
3. Используйте инструменты для парсинга JSON (jq, ELK stack)

## Дополнительные ресурсы

- [Zap Documentation](https://pkg.go.dev/go.uber.org/zap)
- [Structured Logging Best Practices](https://www.honeycomb.io/blog/structured-logging-best-practices)
- [12 Factor App - Logs](https://12factor.net/logs)
