# Быстрый старт: Система логирования

## Backend (Go)

### Базовое использование

```go
import "github.com/burcev/api/internal/shared/logger"

log := logger.New()
defer log.Sync()

// Уровни логирования
log.Debug("Отладка", "key", "value")
log.Info("Информация", "key", "value")
log.Warn("Предупреждение", "key", "value")
log.Error("Ошибка", "key", "value")
log.Fatal("Критическая ошибка", "key", "value")
```

### С контекстом

```go
// Добавить поля
logWithFields := log.WithFields(map[string]interface{}{
    "user_id": "123",
    "action": "login",
})
logWithFields.Info("User logged in")

// Добавить ошибку
logWithError := log.WithError(err)
logWithError.Error("Operation failed")
```

### Специализированные методы

```go
// HTTP запросы (автоматически через middleware)
log.LogHTTPRequest("GET", "/api/users", 200, duration, fields)

// База данных
log.LogDatabaseQuery(query, duration, err, fields)

// Бизнес-события
log.LogBusinessEvent("user_registered", fields)

// Безопасность
log.LogSecurityEvent("failed_login", "high", fields)
```

## Frontend (React/TypeScript)

### Базовое использование

```typescript
import { logger } from '@/shared/utils/logger'

// Уровни логирования
logger.debug('Отладка', { key: 'value' })
logger.info('Информация', { key: 'value' })
logger.warn('Предупреждение', { key: 'value' })
logger.error('Ошибка', error, { key: 'value' })
logger.fatal('Критическая ошибка', error, { key: 'value' })
```

### В React компонентах

```typescript
import { useLogger } from '@/shared/hooks/useLogger'

function MyComponent() {
  const { info, error, logUserAction } = useLogger({
    component: 'MyComponent',
    autoLogMount: true,
  })

  const handleClick = () => {
    logUserAction('button_clicked', { button_id: 'submit' })
    info('Button clicked')
  }

  return <button onClick={handleClick}>Click me</button>
}
```

### Специализированные методы

```typescript
// API вызовы
logger.logAPICall('GET', '/api/users', 200, duration, context)

// Действия пользователя
logger.logUserAction('page_view', { page: '/dashboard' })

// Производительность
logger.logPerformance('page_load', 1500, { page: '/dashboard' })

// Безопасность
logger.logSecurityEvent('suspicious_activity', 'high', context)
```

### Error Boundary

```typescript
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'

<ErrorBoundary>
  <App />
</ErrorBoundary>
```

## Форматы логов

### Development (человекочитаемый)

```
[2026-01-24T21:45:30.123Z] [INFO] User logged in {
  "user_id": "123",
  "email": "user@example.com"
}
```

### Production (машиночитаемый JSON)

```json
{
  "level": "info",
  "timestamp": "2026-01-24T18:45:30.123Z",
  "message": "User logged in",
  "user_id": "123",
  "email": "user@example.com",
  "request_id": "abc-def-123"
}
```

## Централизованный сбор

Frontend логи автоматически отправляются на backend:
- **Endpoint:** `POST /api/v1/logs`
- **Батчинг:** До 50 логов или каждые 10 секунд
- **Автоматически:** При закрытии страницы

## Best Practices

✅ **Правильно:**
```typescript
logger.error('Payment failed', error, {
  user_id: '123',
  amount: 99.99,
  payment_method: 'card',
})
```

❌ **Неправильно:**
```typescript
logger.error('Error', error) // Нет контекста
logger.info('User password: secret123') // Чувствительные данные
```

## Полная документация

См. [docs/LOGGING.md](docs/LOGGING.md) для детального руководства.
