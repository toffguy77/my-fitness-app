# Dashboard Error Handling

## Overview

The dashboard feature implements comprehensive error handling with automatic retry logic, unsaved data management, and user-friendly error notifications. This document describes the error handling architecture and usage patterns.

## Features

### 1. **Toast Notifications for Errors**
- All errors display user-friendly toast notifications in Russian
- Error messages are contextual and actionable
- Toast duration: 5 seconds for errors, 4 seconds for validation errors

### 2. **Retry Logic with Exponential Backoff**
- Automatic retry for retryable errors (network, server, timeout)
- Exponential backoff: 1s, 2s, 4s delays
- Maximum 3 retry attempts by default
- Configurable retry parameters

### 3. **Inline Validation Errors**
- Real-time validation for all input fields
- Error messages displayed below inputs
- Prevents submission until errors are resolved
- ARIA live regions for screen reader accessibility

### 4. **Unsaved Data Retention**
- Failed save operations store data in localStorage
- Data retained for 24 hours
- Automatic retry functionality
- Visual notification with retry button
- Maximum 5 retry attempts per entry

## Architecture

### Error Types

```typescript
enum DashboardErrorCode {
    NETWORK_ERROR = 'NETWORK_ERROR',           // No internet connection
    UNAUTHORIZED = 'UNAUTHORIZED',             // 401 - Auth required
    FORBIDDEN = 'FORBIDDEN',                   // 403 - Access denied
    NOT_FOUND = 'NOT_FOUND',                   // 404 - Resource not found
    VALIDATION_ERROR = 'VALIDATION_ERROR',     // 400 - Invalid data
    SERVER_ERROR = 'SERVER_ERROR',             // 500+ - Server issues
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',           // 408 - Request timeout
    RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',     // 429 - Too many requests
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',           // Unexpected errors
}
```

### Error Interface

```typescript
interface DashboardError {
    code: DashboardErrorCode;
    message: string;              // User-friendly Russian message
    details?: Record<string, any>; // Additional error details
    retryable: boolean;           // Whether error can be retried
}
```

### Retry Configuration

```typescript
interface RetryConfig {
    maxRetries: number;           // Default: 3
    baseDelay: number;            // Default: 1000ms
    maxDelay: number;             // Default: 10000ms
    backoffMultiplier: number;    // Default: 2
}
```

## Usage

### 1. Error Handling in Store Actions

The dashboard store automatically handles errors with retry logic:

```typescript
import { useDashboardStore } from '@/features/dashboard';

function MyComponent() {
    const { updateMetric } = useDashboardStore();

    const handleSave = async () => {
        try {
            await updateMetric(date, metric);
            // Success - data saved
        } catch (error) {
            // Error handled automatically:
            // - Toast notification shown
            // - Data stored for retry
            // - Optimistic update rolled back
        }
    };
}
```

### 2. Using Unsaved Data Hook

Track and retry unsaved data:

```typescript
import { useUnsavedData } from '@/features/dashboard';

function MyComponent() {
    const {
        unsavedData,
        unsavedCount,
        hasUnsavedData,
        canRetry,
        removeUnsavedData,
    } = useUnsavedData();

    // Check if date has unsaved data
    if (hasUnsavedData('2024-01-15')) {
        // Show indicator
    }

    // Retry specific entry
    const handleRetry = async (date: string) => {
        const entry = unsavedData.find(e => e.date === date);
        if (entry && canRetry(date)) {
            await updateMetric(date, entry.metric);
            removeUnsavedData(date);
        }
    };
}
```

### 3. Unsaved Data Notification Component

Display notification with retry functionality:

```typescript
import { UnsavedDataNotification } from '@/features/dashboard';

function DashboardPage() {
    return (
        <div>
            {/* Your dashboard content */}
            <UnsavedDataNotification />
        </div>
    );
}
```

### 4. Manual Error Handling

For custom error handling:

```typescript
import {
    mapApiError,
    showErrorToast,
    handleError,
    retryWithBackoff,
} from '@/features/dashboard';

// Map API error
const error = mapApiError(apiError);
console.log(error.code, error.message, error.retryable);

// Show toast notification
showErrorToast(error);

// Handle error with logging and toast
handleError(apiError, 'MyComponent');

// Retry with custom config
const result = await retryWithBackoff(
    () => apiClient.post('/endpoint', data),
    {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 30000,
        backoffMultiplier: 3,
    }
);
```

### 5. Validation Errors

Display validation errors:

```typescript
import { showValidationErrors } from '@/features/dashboard';

const errors = [
    'Вес должен быть положительным',
    'Шаги не могут быть отрицательными',
];

showValidationErrors(errors);
// Shows toast with bulleted list of errors
```

## Error Messages (Russian)

All error messages are in Russian for user-facing display:

| Error Code | Message |
|------------|---------|
| NETWORK_ERROR | Нет подключения к интернету |
| UNAUTHORIZED | Требуется авторизация |
| FORBIDDEN | Доступ запрещен |
| NOT_FOUND | Данные не найдены |
| VALIDATION_ERROR | Неверные данные |
| SERVER_ERROR | Сервис временно недоступен |
| TIMEOUT_ERROR | Превышено время ожидания |
| RATE_LIMIT_ERROR | Слишком много запросов. Попробуйте позже |
| UNKNOWN_ERROR | Произошла ошибка |

## Retry Logic

### Retryable Errors
- Network errors (offline, fetch failures)
- Server errors (500, 502, 503, 504)
- Timeout errors (408)
- Rate limit errors (429)

### Non-Retryable Errors
- Authentication errors (401)
- Authorization errors (403)
- Not found errors (404)
- Validation errors (400)

### Exponential Backoff

Retry delays increase exponentially:
- Attempt 1: 1 second
- Attempt 2: 2 seconds
- Attempt 3: 4 seconds

Formula: `delay = baseDelay * (backoffMultiplier ^ attempt)`

Maximum delay is capped at `maxDelay` (default 10 seconds).

## Unsaved Data Management

### Storage
- Data stored in localStorage with key `dashboard_unsaved_data`
- Each entry includes: date, metric, timestamp, attempts
- Maximum age: 24 hours (expired entries auto-removed)
- Maximum attempts: 5 per entry

### Retry Flow
1. Save operation fails
2. Data stored in localStorage
3. UnsavedDataNotification appears
4. User clicks "Повторить" (Retry)
5. Store attempts to save again
6. On success: entry removed from localStorage
7. On failure: attempt count incremented

### Data Structure

```typescript
interface UnsavedDataEntry {
    date: string;              // ISO date string
    metric: MetricUpdate;      // The unsaved metric
    timestamp: number;         // When it was saved
    attempts: number;          // Retry attempt count
}
```

## Testing

### Unit Tests
- 20 unit tests for error handling utilities
- 13 unit tests for unsaved data hook
- Coverage: 95%+

### Property-Based Tests
- 5 property tests validating:
  - Retry logic with various configurations
  - Error mapping for all status codes
  - Unsaved data retention
  - Exponential backoff timing
  - Non-retryable error handling

Run tests:
```bash
npm test -- errorHandling.test.ts
npm test -- errorHandling.property.test.ts
npm test -- useUnsavedData.test.ts
```

## Best Practices

### 1. Always Use Store Actions
Let the store handle errors automatically:
```typescript
// ✅ GOOD
await updateMetric(date, metric);

// ❌ BAD - bypassing error handling
await apiClient.post('/dashboard/daily', data);
```

### 2. Show Inline Validation
Display validation errors immediately:
```typescript
const validation = validateWeight(input);
if (!validation.isValid) {
    setError(validation.error);
}
```

### 3. Handle Offline State
Check online status before operations:
```typescript
import { isOnline } from '@/features/dashboard';

if (!isOnline()) {
    // Show offline message
    // Load from cache
}
```

### 4. Provide Retry Options
For critical operations, show retry button:
```typescript
try {
    await submitWeeklyReport();
} catch (error) {
    handleError(error, 'WeeklyReport', () => {
        // Retry callback
        submitWeeklyReport();
    });
}
```

### 5. Log Errors in Development
Errors are automatically logged in development:
```typescript
// Logs include:
// - Error context
// - Stack trace
// - Component name
// - Timestamp
```

## Accessibility

### Screen Reader Support
- Error messages announced via ARIA live regions
- Validation errors have `aria-invalid` and `aria-describedby`
- Toast notifications are announced automatically

### Keyboard Navigation
- Retry buttons are keyboard accessible
- Focus management for error dialogs
- Tab order preserved

### Visual Indicators
- Red text for errors
- Warning icons (⚠️, ❌)
- Color-independent indicators (icons + text)

## Performance

### Optimization
- Debounced validation (300ms)
- Throttled retry attempts
- Cached error mappings
- Minimal re-renders

### Memory Management
- Expired entries auto-removed
- localStorage size monitoring
- Cleanup on unmount

## Future Enhancements

1. **Error Analytics**
   - Track error frequency
   - Identify patterns
   - Alert on spikes

2. **Smart Retry**
   - Adaptive backoff based on error type
   - Network quality detection
   - Batch retry for multiple entries

3. **Offline Queue**
   - Queue all mutations when offline
   - Auto-sync when online
   - Conflict resolution

4. **Error Recovery**
   - Automatic data recovery
   - Partial save support
   - Transaction rollback

## Related Files

- `utils/errorHandling.ts` - Error handling utilities
- `hooks/useUnsavedData.ts` - Unsaved data management
- `components/UnsavedDataNotification.tsx` - Retry notification UI
- `store/dashboardStore.ts` - Store with error handling
- `utils/validation.ts` - Input validation

## Requirements

Implements Requirements 13.3:
- ✅ Display error message when save fails
- ✅ Retain unsaved data for retry
- ✅ Automatic retry with exponential backoff
- ✅ Toast notifications for errors
- ✅ Inline validation errors
