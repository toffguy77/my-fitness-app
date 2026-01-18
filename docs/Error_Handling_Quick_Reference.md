# Error Handling Quick Reference

**Версия:** 1.0  
**Дата:** Январь 2025

---

## 🚀 Быстрый старт

### 1. Отмена запросов при размонтировании

```typescript
import { useAbortController } from '@/hooks/useAbortController'
import { fetchWithAbort, isAbortError } from '@/utils/request-handler'

function MyComponent() {
  const { signal } = useAbortController()
  
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchWithAbort('/api/data', { signal })
        setData(data)
      } catch (error) {
        if (!isAbortError(error)) {
          setError(error)
        }
      }
    }
    
    loadData()
  }, [signal])
}
```

### 2. Retry при сетевых ошибках

```typescript
const data = await fetchWithAbort('/api/data', {
  retries: 3,              // 3 попытки
  retryDelay: 1000,        // Начальная задержка 1s
  showUserNotification: true  // Показать уведомление при ошибке
})
```

### 3. Загрузка изображений с fallback

```typescript
import { loadImage, getPlaceholder } from '@/utils/image-loader'

const imageUrl = await loadImage(product.image_url, {
  fallbackUrl: getPlaceholder(),
  timeout: 5000
})
```

### 4. Отправка метрик

```typescript
import { prometheusCollector } from '@/utils/metrics/prometheus-collector'

await prometheusCollector.pushMetric({
  name: 'app_requests_total',
  value: 1,
  labels: { method: 'GET', status: '200' }
})
```

## 📋 Cheat Sheet

### Request Handler

| Функция | Описание | Пример |
|---------|----------|--------|
| `fetchWithAbort()` | HTTP запрос с retry | `await fetchWithAbort('/api/data', { signal })` |
| `isAbortError()` | Проверка AbortError | `if (isAbortError(error)) return` |
| `isNetworkError()` | Проверка network error | `if (isNetworkError(error)) retry()` |
| `shouldLogError()` | Нужно ли логировать | `if (shouldLogError(error)) log()` |

### useAbortController Hook

| Свойство | Тип | Описание |
|----------|-----|----------|
| `signal` | `AbortSignal` | Сигнал для отмены |
| `abort()` | `() => void` | Функция отмены |

### Image Loader

| Функция | Описание | Пример |
|---------|----------|--------|
| `loadImage()` | Загрузка с fallback | `await loadImage(url, { timeout: 5000 })` |
| `getPlaceholder()` | Путь к placeholder | `const placeholder = getPlaceholder()` |
| `preloadImage()` | Предзагрузка | `await preloadImage(url)` |
| `preloadImages()` | Batch предзагрузка | `await preloadImages([url1, url2])` |

### Prometheus Collector

| Метод | Описание | Пример |
|-------|----------|--------|
| `pushMetric()` | Отправить метрику | `await pushMetric({ name, value, labels })` |
| `pushMetrics()` | Batch отправка | `await pushMetrics([metric1, metric2])` |
| `isConnected()` | Проверка доступности | `if (isConnected()) ...` |
| `checkConnection()` | Ручная проверка | `await checkConnection()` |

## 🎯 Типичные сценарии

### Сценарий 1: Загрузка данных в компоненте

```typescript
function DataComponent() {
  const { signal } = useAbortController()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const result = await fetchWithAbort('/api/data', {
          signal,
          retries: 3,
          showUserNotification: true
        })
        setData(result)
      } catch (err) {
        if (!isAbortError(err)) {
          setError(err)
        }
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [signal])
  
  if (loading) return <LoadingSpinner />
  if (error) return <ErrorDisplay error={error} />
  return <DataView data={data} />
}
```

### Сценарий 2: Форма с отправкой данных

```typescript
function FormComponent() {
  const { signal } = useAbortController()
  
  const handleSubmit = async (formData) => {
    try {
      await fetchWithAbort('/api/submit', {
        method: 'POST',
        body: JSON.stringify(formData),
        signal,
        retries: 2,
        showUserNotification: true
      })
      
      toast.success('Данные сохранены')
    } catch (error) {
      if (!isAbortError(error)) {
        toast.error('Ошибка сохранения')
      }
    }
  }
  
  return <form onSubmit={handleSubmit}>...</form>
}
```

### Сценарий 3: Галерея изображений

```typescript
function ImageGallery({ images }) {
  const [loadedImages, setLoadedImages] = useState({})
  
  useEffect(() => {
    const loadAllImages = async () => {
      const results = await Promise.all(
        images.map(async (img) => ({
          id: img.id,
          url: await loadImage(img.url, {
            fallbackUrl: getPlaceholder(),
            timeout: 5000
          })
        }))
      )
      
      setLoadedImages(
        results.reduce((acc, { id, url }) => ({
          ...acc,
          [id]: url
        }), {})
      )
    }
    
    loadAllImages()
  }, [images])
  
  return (
    <div className="grid">
      {images.map(img => (
        <img key={img.id} src={loadedImages[img.id] || getPlaceholder()} />
      ))}
    </div>
  )
}
```

### Сценарий 4: Отправка метрик

```typescript
async function trackUserAction(action: string, metadata: Record<string, string>) {
  await prometheusCollector.pushMetric({
    name: 'app_user_actions_total',
    value: 1,
    labels: {
      action,
      ...metadata
    }
  })
}

// Использование
await trackUserAction('button_click', {
  button_id: 'submit',
  page: 'checkout'
})
```

## ⚠️ Частые ошибки

### ❌ Не проверяете AbortError

```typescript
// НЕПРАВИЛЬНО
try {
  await fetchWithAbort('/api/data', { signal })
} catch (error) {
  logger.error('Request failed', error)  // Логирует AbortError
}

// ПРАВИЛЬНО
try {
  await fetchWithAbort('/api/data', { signal })
} catch (error) {
  if (!isAbortError(error)) {
    logger.error('Request failed', error)
  }
}
```

### ❌ Не используете useAbortController

```typescript
// НЕПРАВИЛЬНО
useEffect(() => {
  fetch('/api/data')  // Не отменяется при unmount
}, [])

// ПРАВИЛЬНО
const { signal } = useAbortController()

useEffect(() => {
  fetchWithAbort('/api/data', { signal })
}, [signal])
```

### ❌ Не обрабатываете fallback изображений

```typescript
// НЕПРАВИЛЬНО
<img src={product.image_url} />  // Сломанное изображение при ошибке

// ПРАВИЛЬНО
const [imageSrc, setImageSrc] = useState(getPlaceholder())

useEffect(() => {
  loadImage(product.image_url).then(setImageSrc)
}, [product.image_url])

<img src={imageSrc} />
```

### ❌ Блокируете приложение при недоступности Pushgateway

```typescript
// НЕПРАВИЛЬНО
try {
  await fetch(pushgatewayUrl, { method: 'POST', body: metrics })
} catch (error) {
  throw error  // Блокирует приложение
}

// ПРАВИЛЬНО
await prometheusCollector.pushMetric(metric)  // Silent failure
```

## 🔧 Конфигурация

### Environment Variables

```bash
# Prometheus (опционально)
PROMETHEUS_ENABLED=true
PROMETHEUS_PUSHGATEWAY_URL=http://pushgateway:9091
```

### Default Values

```typescript
// fetchWithAbort
retries: 3
retryDelay: 1000  // ms
showUserNotification: false

// loadImage
timeout: 5000  // ms
fallbackUrl: '/images/product-placeholder.svg'

// prometheusCollector
retryIntervalMs: 60000  // 60 seconds
```

## 📊 Метрики

### Доступные метрики

- `abort_errors_total` - Отмененные запросы
- `network_retries_total` - Retry попытки
- `image_fallbacks_total` - Fallback изображений
- `prometheus_connection_status` - Статус Pushgateway
- `prometheus_recoveries_total` - Восстановления подключения

### Пример запроса в Prometheus

```promql
# Количество retry за последний час
sum(rate(network_retries_total[1h])) by (url, success)

# Процент успешных retry
sum(rate(network_retries_total{success="true"}[1h])) 
/ 
sum(rate(network_retries_total[1h]))

# Топ URL с fallback изображений
topk(10, sum(rate(image_fallbacks_total[1h])) by (original_url))
```

## 🔗 Полезные ссылки

- [Error Handling Guide](./Error_Handling_Guide.md) - Полное руководство
- [RLS Migration Guide](./RLS_Migration_Guide.md) - Миграция RLS
- [Release Notes](./RELEASE_NOTES_Error_Handling_v1.0.md) - Release notes
- [API Reference](./API_Reference.md) - API документация

---

**Версия:** 1.0  
**Последнее обновление:** Январь 2025
