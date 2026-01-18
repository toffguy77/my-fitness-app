# Fitness App - Freemium SaaS Platform

[![CI Pipeline](https://github.com/toffguy77/my-fitness-app/actions/workflows/ci.yml/badge.svg)](https://github.com/toffguy77/my-fitness-app/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/toffguy77/my-fitness-app/branch/main/graph/badge.svg)](https://codecov.io/gh/toffguy77/my-fitness-app)
[![Coverage Status](https://codecov.io/gh/toffguy77/my-fitness-app/branch/main/graph/badge.svg?token=YOUR_TOKEN)](https://codecov.io/gh/toffguy77/my-fitness-app)

Цифровой дневник питания с поддержкой тренера. Freemium SaaS платформа для отслеживания КБЖУ и управления пищевым поведением.

## 🚀 Технологии

- **Framework:** Next.js 16 (App Router)
- **React:** v19 с React Compiler
- **Styling:** Tailwind CSS v4
- **Backend:** Supabase (PostgreSQL + Auth)
- **Deployment:** Docker

## 📋 Требования

- Node.js 20+
- Docker & Docker Compose (для production)
- Supabase проект

## 🛠️ Установка

### Локальная разработка

1. Клонируйте репозиторий:
```bash
git clone git@github.com:toffguy77/my-fitness-app.git
cd my-fitness-app
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте файл `.env.local`:
```bash
cp env.example .env.local
```

4. Заполните переменные окружения:
```bash
# Supabase (обязательно)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Email Configuration (Resend) - опционально для уведомлений
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=Fitness App <noreply@yourdomain.com>
NEXT_PUBLIC_APP_URL=http://localhost:3069

# OCR Configuration (опционально, для улучшения точности распознавания)
# Без этого ключа будет работать только Tesseract.js (клиентская обработка)
NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1-xxxxx

# FatSecret API Configuration (рекомендуется для доступа к базе продуктов)
# Получите credentials на https://platform.fatsecret.com/
FATSECRET_ENABLED=true
FATSECRET_CLIENT_ID=your_fatsecret_client_id
FATSECRET_CLIENT_SECRET=your_fatsecret_client_secret
```

5. Настройте pre-commit hooks (рекомендуется):
```bash
npm run precommit:setup
```

Это установит автоматические проверки перед каждым коммитом:
- ✅ TypeScript type checking
- ✅ ESLint
- ✅ Jest tests
- ✅ Security checks

Подробнее: [docs/Pre-Commit-Hooks.md](docs/Pre-Commit-Hooks.md)

6. Запустите dev сервер:
```bash
npm run dev
```

Откройте [http://localhost:3069](http://localhost:3069)

## 🐳 Docker Deployment

### Быстрый старт

1. Создайте `.env.production`:
```bash
cp env.example .env.production
# Заполните переменные
```

2. Запустите через Docker Compose:
```bash
docker-compose up -d --build
```

Или используйте Makefile:
```bash
make deploy
```

### Команды

- `make build` - собрать образ
- `make up` - запустить контейнеры
- `make down` - остановить контейнеры
- `make logs` - просмотр логов
- `make update` - обновить из git и пересобрать

Подробнее в [DOCKER.md](./DOCKER.md)

## 📊 Структура проекта

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Лендинг (публичный)
│   ├── login/             # Авторизация
│   ├── register/          # Регистрация
│   ├── app/               # Защищенная зона
│   │   ├── dashboard/     # Дашборд клиента
│   │   ├── nutrition/     # Ввод питания
│   │   ├── reports/      # Отчеты (Premium)
│   │   └── curator/      # Кабинет куратора
│   └── admin/            # Супер-админка
├── components/            # React компоненты
├── utils/                 # Утилиты
└── middleware.ts          # Роутинг по ролям
```

## 🔐 Роли пользователей

- **Client (Free):** Базовый дневник питания
- **Client (Premium):** Полный функционал с тренером
- **Coach:** Управление клиентами
- **Super Admin:** Управление всей платформой

## 🍎 FatSecret API Integration

Приложение использует FatSecret API как основной источник данных о продуктах питания, с автоматическим fallback на Open Food Facts API.

### Настройка FatSecret API

1. **Получите API credentials:**
   - Зарегистрируйтесь на [FatSecret Platform](https://platform.fatsecret.com/)
   - Создайте новое приложение в разделе "API"
   - Скопируйте Client ID и Client Secret

2. **Добавьте credentials в `.env.local`:**
```bash
FATSECRET_ENABLED=true
FATSECRET_CLIENT_ID=your_client_id_here
FATSECRET_CLIENT_SECRET=your_client_secret_here
```

3. **Опциональные настройки:**
```bash
# Базовый URL API (по умолчанию: https://platform.fatsecret.com/rest/server.api)
FATSECRET_BASE_URL=https://platform.fatsecret.com/rest/server.api

# Таймаут запросов в миллисекундах (по умолчанию: 5000)
FATSECRET_TIMEOUT=5000

# Максимальное количество результатов поиска (по умолчанию: 20)
FATSECRET_MAX_RESULTS=20

# Включить fallback на Open Food Facts при ошибках (по умолчанию: true)
FATSECRET_FALLBACK_ENABLED=true
```

### Как работает интеграция

**Поиск продуктов:**
1. Сначала проверяется локальная база данных (кэш)
2. Если недостаточно результатов → запрос к FatSecret API
3. При ошибке FatSecret → автоматический fallback на Open Food Facts API
4. Все найденные продукты кэшируются в локальной БД

**Поиск по штрих-коду:**
1. Проверка локальной БД
2. FatSecret API barcode endpoint
3. Fallback на Open Food Facts API
4. Сохранение найденного продукта в БД

### Лимиты API

**FatSecret Free Tier:**
- 5,000 API calls в день
- OAuth 2.0 аутентификация
- Доступ к 1.5+ миллионам продуктов

**Оптимизация использования:**
- Агрессивное кэширование в PostgreSQL
- Приоритет локальной БД перед API запросами
- Автоматический fallback на Open Food Facts
- Дебаунсинг поисковых запросов (300ms)

### Мониторинг

Система автоматически логирует:
- Количество API запросов
- Время ответа API
- Частоту активации fallback
- Процент попаданий в кэш
- Ошибки аутентификации и rate limits

### Отключение FatSecret

Если нужно отключить FatSecret и использовать только Open Food Facts:

```bash
FATSECRET_ENABLED=false
```

Приложение продолжит работать с Open Food Facts API как основным источником.

## 🛠️ Утилиты для обработки ошибок

Приложение включает набор утилит для надежной обработки ошибок и улучшения пользовательского опыта:

### Request Handler с AbortController

**Файл:** `src/utils/request-handler.ts`

Утилита для выполнения HTTP запросов с автоматической отменой и retry логикой:

```typescript
import { fetchWithAbort, isAbortError } from '@/utils/request-handler'

// Пример использования
const { signal } = useAbortController()

try {
  const data = await fetchWithAbort('/api/data', {
    signal,
    retries: 3,
    retryDelay: 1000,
    showUserNotification: true
  })
} catch (error) {
  if (!isAbortError(error)) {
    // Обработка ошибки
  }
}
```

**Возможности:**
- ✅ Автоматический retry с экспоненциальной задержкой (1s, 2s, 4s)
- ✅ Тихая отмена запросов (без логирования AbortError)
- ✅ Структурированное логирование с контекстом
- ✅ Уведомления пользователя после исчерпания попыток
- ✅ Настраиваемое количество попыток и задержек

### React Hook для AbortController

**Файл:** `src/hooks/useAbortController.ts`

React hook для автоматического управления отменой запросов:

```typescript
import { useAbortController } from '@/hooks/useAbortController'

function MyComponent() {
  const { signal, abort } = useAbortController()
  
  // signal автоматически отменяется при размонтировании компонента
  const fetchData = async () => {
    const data = await fetchWithAbort('/api/data', { signal })
  }
}
```

**Возможности:**
- ✅ Автоматическая очистка при размонтировании компонента
- ✅ Предотвращение утечек памяти
- ✅ Устранение ошибок AbortError в консоли

### Image Loader с Fallback

**Файл:** `src/utils/image-loader.ts`

Утилита для загрузки изображений с автоматическим fallback:

```typescript
import { loadImage, getPlaceholder } from '@/utils/image-loader'

// Загрузка с fallback
const imageUrl = await loadImage('https://example.com/image.jpg', {
  fallbackUrl: getPlaceholder(),
  timeout: 5000
})

// Предзагрузка изображений
await preloadImages([
  'https://example.com/image1.jpg',
  'https://example.com/image2.jpg'
])
```

**Возможности:**
- ✅ Автоматический fallback на placeholder при ошибке
- ✅ Таймаут для медленных соединений
- ✅ Предзагрузка изображений для кэширования
- ✅ Batch предзагрузка нескольких изображений

### Prometheus Graceful Degradation

**Файл:** `src/utils/metrics/prometheus-collector.ts`

Сборщик метрик с graceful degradation при недоступности Pushgateway:

```typescript
import { prometheusCollector } from '@/utils/metrics/prometheus-collector'

// Отправка метрики (silent failure если Pushgateway недоступен)
await prometheusCollector.pushMetric({
  name: 'app_requests_total',
  value: 1,
  labels: { method: 'GET', status: '200' }
})

// Проверка доступности
const isConnected = prometheusCollector.isConnected()
```

**Возможности:**
- ✅ Silent failure при недоступности Pushgateway
- ✅ Автоматический retry каждые 60 секунд
- ✅ Логирование только первой ошибки и восстановления
- ✅ Неблокирующая отправка метрик
- ✅ Batch отправка нескольких метрик

**Переменные окружения:**
```bash
PROMETHEUS_ENABLED=true
PROMETHEUS_PUSHGATEWAY_URL=http://pushgateway:9091
```

## 📝 Миграции БД

SQL миграции находятся в `migrations/`. Подробная документация: [migrations/README.md](./migrations/README.md)

**Для новой базы данных:**
- Используйте `setup_database.sql` для полного сетапа

**Для существующей базы:**
- Выполняйте миграции последовательно в порядке версий
- **Важно:** Миграция `fix_products_rls.sql` исправляет RLS политики для products таблицы

## 📚 Документация

- [Правила разработки](./.cursor/rules.md) - **ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ** перед началом работы
- [Документация проекта](./docs/README.md) - индекс всей документации
- [Текущая структура приложения](./docs/Application_Structure_v3.3.md) - v3.3
- [Текущие диаграммы навигации](./docs/Application_Navigation_Diagrams_v3.2.md) - v3.2
- [Phase 1 BRD](./docs/Phase1_BRD.md) - MVP функционал
- [Phase 2 BRD](./docs/Phase2_BRD.md) - The Loop (петля обратной связи)
- [Phase 2.5 BRD](./docs/Phase2.5_BRD.md) - Freemium SaaS
- [Phase 2.6 BRD](./docs/Phase2.6_BRD.md) - Enhanced Dashboard
- [Phase 3 BRD](./docs/Phase3_BRD.md) - Уведомления, валидация, деактивация подписок
- [Docker Guide](./DOCKER.md) - Деплой в Docker

## 🧪 Разработка

```bash
# Dev сервер
npm run dev

# Production build
npm run build
npm start

# Линтинг
npm run lint

# Тестирование
npm test                    # Unit/Integration тесты (Jest)
npm run test:coverage      # С покрытием кода
npm run test:e2e           # E2E тесты (Playwright)
npm run test:all           # Все тесты
```

Подробнее: [TESTING.md](./TESTING.md)

## 📦 Production Build

```bash
# Сборка
npm run build

# Запуск
npm start
```

## 🔄 Обновление

```bash
git pull
make update  # или docker-compose up -d --build
```

## 📄 Лицензия

Private
