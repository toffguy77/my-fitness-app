# Техническая архитектура My Fitness App

**Версия документа:** 1.0  
**Дата создания:** Январь 2025  
**Статус:** Актуальная реализация v4.0+

---

## Обзор архитектуры

My Fitness App построен как **Full-Stack приложение** на базе **Next.js 16** с использованием **Supabase** в качестве Backend-as-a-Service (BaaS). Архитектура следует принципам **Server-Side Rendering (SSR)**, **Client-Side Rendering (CSR)** и **Progressive Web App (PWA)**.

---

## Технологический стек

### Frontend

#### Framework и библиотеки
- **Next.js 16** (App Router) — React framework с SSR/SSG
- **React 19** — UI библиотека с React Compiler
- **TypeScript 5** — типизированный JavaScript
- **Tailwind CSS v4** — utility-first CSS framework
- **Lucide React** — иконки

#### UI компоненты и утилиты
- **react-hot-toast** — toast уведомления
- **recharts** — графики и визуализация данных
- **clsx** — условные классы CSS
- **tailwind-merge** — слияние Tailwind классов

#### Экспорт данных
- **papaparse** — парсинг и экспорт CSV
- **jspdf** — генерация PDF документов

#### OCR и обработка изображений
- **tesseract.js** — клиентское OCR распознавание
- **OpenRouter API** — облачное OCR через API

### Backend

#### Supabase (BaaS)
- **PostgreSQL** — реляционная база данных
- **Supabase Auth** — аутентификация и авторизация
- **Supabase Realtime** — WebSocket для real-time обновлений
- **Supabase Edge Functions** — serverless функции (Deno)
- **Row Level Security (RLS)** — безопасность на уровне БД
- **Storage** — хранение файлов (для будущего использования)

#### Внешние сервисы
- **Resend API** — отправка email уведомлений
- **Open Food Facts API** — база продуктов
- **OpenRouter API** — OCR распознавание через AI модели

### Инфраструктура

#### Развертывание
- **Docker** — контейнеризация
- **Docker Compose** — оркестрация контейнеров
- **Next.js Standalone** — оптимизированный production build

#### PWA
- **next-pwa** — PWA поддержка
- **Service Worker** — offline режим и кэширование
- **Web App Manifest** — установка на домашний экран

### Тестирование

- **Jest** — unit и integration тесты
- **Testing Library** — тестирование React компонентов
- **Playwright** — E2E тестирование
- **MSW** — мокирование API

### Инструменты разработки

- **ESLint** — линтинг кода
- **TypeScript** — проверка типов
- **Prettier** — форматирование кода (опционально)

---

## Архитектура приложения

### Общая структура

```
┌─────────────────────────────────────────────────┐
│              Client (Browser)                   │
│  ┌──────────────────────────────────────────┐   │
│  │      Next.js App (React 19)              │   │
│  │  ┌──────────────┐  ┌──────────────┐      │   │
│  │  │   Pages      │  │  Components  │      │   │
│  │  │   (App       │  │  (UI, Logic) │      │   │
│  │  │   Router)    │  │              │      │   │
│  │  └──────────────┘  └──────────────┘      │   │
│  │  ┌──────────────┐  ┌──────────────┐      │   │
│  │  │   Utils      │  │   Hooks      │      │   │
│  │  │   (Helpers)  │  │   (Custom)   │      │   │
│  │  └──────────────┘  └──────────────┘      │   │
│  └──────────────────────────────────────────┘   │
│              ↓ HTTP/WebSocket                   │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│         Supabase (Backend-as-a-Service)         │
│  ┌──────────────┐  ┌───────────────┐            │
│  │   Auth       │  │  Database     │            │
│  │   (JWT)      │  │  (PostgreSQL) │            │
│  └──────────────┘  └───────────────┘            │
│  ┌──────────────┐  ┌───────────────┐            │
│  │  Realtime    │  │ Edge Functions│            │
│  │  (WebSocket) │  │  (Deno)       │            │
│  └──────────────┘  └───────────────┘            │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│         External Services                       │
│  ┌──────────────┐  ┌──────────────┐             │
│  │   Resend     │  │ Open Food    │             │
│  │   (Email)    │  │ Facts API    │             │
│  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐                               │
│  │  OpenRouter  │                               │
│  │  (OCR API)   │                               │
│  └──────────────┘                               │
└─────────────────────────────────────────────────┘
```

### Слои архитектуры

#### 1. Presentation Layer (Frontend)
- **Next.js Pages** — маршруты и страницы
- **React Components** — UI компоненты
- **Client-side State** — React Hooks (useState, useEffect, useMemo)
- **Client-side Validation** — валидация на клиенте

#### 2. Application Layer
- **Middleware** — защита маршрутов и роутинг
- **API Routes** — Next.js API endpoints
- **Utils** — утилиты и хелперы
- **Business Logic** — клиентская бизнес-логика

#### 3. Data Layer
- **Supabase Client** — клиент для работы с Supabase
- **Database Functions** — PostgreSQL функции
- **RLS Policies** — политики безопасности

#### 4. External Services Layer
- **Resend** — email уведомления
- **Open Food Facts** — база продуктов
- **OpenRouter** — OCR API

---

## Паттерны проектирования

### 1. Component-Based Architecture

**Принцип:** Приложение построено на React компонентах

**Структура:**
```
src/components/
├── ui/              # Базовые UI компоненты
├── charts/          # Компоненты графиков
├── chat/            # Компоненты чата
├── products/        # Компоненты продуктов
├── ocr/             # Компоненты OCR
├── achievements/    # Компоненты достижений
└── reports/         # Компоненты отчетов
```

**Пример:**
```typescript
// Компонент с пропсами и состоянием
export default function ProgressBar({ 
  current, 
  target, 
  label 
}: ProgressBarProps) {
  const percentage = (current / target) * 100
  // ...
}
```

### 2. Custom Hooks Pattern

**Принцип:** Переиспользуемая логика выносится в custom hooks

**Примеры:**
- `useUserProfile()` — работа с профилем пользователя
- `useDailyLogs()` — работа с дневными логами
- `useChat()` — работа с чатом

### 3. Utility Functions Pattern

**Принцип:** Вспомогательные функции выносятся в утилиты

**Структура:**
```
src/utils/
├── supabase/        # Supabase утилиты
├── validation/      # Валидация
├── export/          # Экспорт данных
├── products/        # Работа с продуктами
├── ocr/             # OCR обработка
└── chat/            # Чат утилиты
```

### 4. Server-Side Rendering (SSR)

**Принцип:** Начальная загрузка страниц на сервере

**Использование:**
- Middleware для проверки авторизации
- Server Components для статического контента
- Client Components для интерактивности

### 5. Optimistic Updates

**Принцип:** Мгновенное обновление UI до подтверждения сервера

**Реализация:**
```typescript
// Сохраняем предыдущее состояние
const previousState = { ...currentState }

// Обновляем UI сразу
setCurrentState(newState)

try {
  // Отправляем на сервер
  await saveToServer(newState)
} catch (error) {
  // Откатываем при ошибке
  setCurrentState(previousState)
}
```

### 6. Error Boundary Pattern

**Принцип:** Обработка ошибок на уровне компонентов

**Реализация:**
- Try-catch блоки для асинхронных операций
- Toast уведомления для ошибок
- Fallback UI для критичных ошибок

---

## Безопасность

### 1. Row Level Security (RLS)

**Принцип:** Защита данных на уровне базы данных

**Реализация:**
- RLS политики для каждой таблицы
- Проверка `auth.uid()` для доступа к данным
- Разделение доступа по ролям

**Пример:**
```sql
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);
```

### 2. Middleware Protection

**Принцип:** Защита маршрутов на уровне middleware

**Реализация:**
- Проверка авторизации перед доступом к маршрутам
- Проверка ролей для доступа к специфичным страницам
- Проверка Premium статуса для Premium функций

**Пример:**
```typescript
// Проверка Premium доступа
if (pathname.startsWith('/app/reports') && !isPremium) {
  return NextResponse.redirect(new URL('/app/dashboard', request.url))
}
```

### 3. Client-Side Validation

**Принцип:** Валидация данных на клиенте для лучшего UX

**Реализация:**
- Валидация форм перед отправкой
- Визуальная обратная связь
- Предотвращение некорректных данных

### 4. Server-Side Validation

**Принцип:** Валидация данных на сервере для безопасности

**Реализация:**
- PostgreSQL CHECK constraints
- Database functions для валидации
- Edge Functions для дополнительной проверки

**Пример:**
```sql
ALTER TABLE nutrition_targets
ADD CONSTRAINT check_calories_range 
CHECK (calories >= 1000 AND calories <= 6000);
```

### 5. Authentication & Authorization

**Принцип:** JWT токены через Supabase Auth

**Реализация:**
- Авторизация через email/password
- JWT токены для сессий
- Автоматическое обновление токенов
- Проверка токенов на каждом запросе

### 6. Input Sanitization

**Принцип:** Очистка пользовательского ввода

**Реализация:**
- Параметризованные запросы (Supabase делает автоматически)
- Валидация типов данных
- Ограничение длины полей

---

## Производительность

### 1. Code Splitting

**Принцип:** Разделение кода на чанки

**Реализация:**
- Next.js автоматически разделяет код по маршрутам
- Динамические импорты для тяжелых компонентов
- Lazy loading для неиспользуемых компонентов

### 2. Caching

**Принцип:** Кэширование данных и ресурсов

**Реализация:**
- **Service Worker** для кэширования статических ресурсов
- **Supabase Realtime** для кэширования подписок
- **React.useMemo** для мемоизации вычислений
- **React.useCallback** для мемоизации функций

### 3. Optimistic Updates

**Принцип:** Мгновенное обновление UI

**Реализация:**
- Обновление состояния до подтверждения сервера
- Откат при ошибке
- Улучшение воспринимаемой производительности

### 4. Database Optimization

**Принцип:** Оптимизация запросов к БД

**Реализация:**
- Индексы для часто используемых запросов
- Составные индексы для сложных запросов
- SELECT только нужных полей
- Пагинация для больших списков

### 5. Image Optimization

**Принцип:** Оптимизация изображений

**Реализация:**
- Next.js Image компонент (для будущего использования)
- Ленивая загрузка изображений
- Оптимизация форматов (WebP)

### 6. Bundle Size Optimization

**Принцип:** Минимизация размера бандла

**Реализация:**
- Tree shaking для удаления неиспользуемого кода
- Минификация кода в production
- Оптимизация зависимостей

---

## Масштабируемость

### 1. Horizontal Scaling

**Принцип:** Масштабирование через добавление инстансов

**Реализация:**
- Stateless приложение (Next.js)
- Внешняя БД (Supabase)
- Docker контейнеризация

### 2. Database Scaling

**Принцип:** Масштабирование БД

**Реализация:**
- Supabase автоматически масштабирует БД
- Индексы для производительности
- Партиционирование больших таблиц (при необходимости)

### 3. Caching Strategy

**Принцип:** Многоуровневое кэширование

**Реализация:**
- Client-side кэш (Service Worker)
- Database кэш (Supabase)
- CDN для статических ресурсов (Supabase Storage)

### 4. API Rate Limiting

**Принцип:** Ограничение частоты запросов

**Реализация:**
- Rate limiting на уровне Edge Functions
- Защита от злоупотреблений
- Graceful degradation при превышении лимитов

---

## Мониторинг и логирование

### 1. Centralized Logging

**Принцип:** Централизованное логирование

**Реализация:**
- `@/utils/logger` для всех логов
- Уровни логирования (debug, info, warn, error)
- Контекст в логах (userId, action, metadata)

**Пример:**
```typescript
logger.info('Nutrition: лог сохранен', { userId: user.id, date: selectedDate })
logger.error('Nutrition: ошибка сохранения', error, { userId: user.id })
```

### 2. Error Tracking

**Принцип:** Отслеживание ошибок

**Реализация:**
- Try-catch блоки для всех асинхронных операций
- Логирование ошибок с контекстом
- Toast уведомления для пользователей

### 3. Performance Monitoring

**Принцип:** Мониторинг производительности

**Реализация:**
- Next.js встроенные метрики
- Время загрузки страниц
- Время выполнения запросов

---

## Развертывание

### 1. Docker Deployment

**Принцип:** Контейнеризация приложения

**Реализация:**
- Dockerfile для сборки образа
- Docker Compose для оркестрации
- Standalone output для оптимизации

### 2. Environment Variables

**Принцип:** Конфигурация через переменные окружения

**Реализация:**
- `.env.local` для локальной разработки
- `.env.production` для production
- `env.example` для документации

### 3. CI/CD (будущее)

**Принцип:** Автоматизация развертывания

**Планируется:**
- GitHub Actions для CI/CD
- Автоматические тесты
- Автоматическое развертывание

---

## Связанные документы

- [Database_Schema.md](./Database_Schema.md) - Схема базы данных
- [API_Reference.md](./API_Reference.md) - Справочник API
- [Implementation_Guide.md](./Implementation_Guide.md) - Руководство по реализации
- [Diagrams_Architecture.md](./Diagrams_Architecture.md) - Архитектурные диаграммы

---

**Последнее обновление:** Январь 2025  
**Версия документа:** 1.0

