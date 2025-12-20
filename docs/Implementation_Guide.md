# Руководство по реализации My Fitness App

**Версия документа:** 1.0  
**Дата создания:** Январь 2025  
**Статус:** Актуальная реализация v4.0+

---

## Обзор

Этот документ описывает структуру проекта, настройку окружения, процесс разработки, тестирование и деплой My Fitness App.

---

## Структура проекта

```
my-fitness-app/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Лендинг (публичный)
│   │   ├── login/             # Авторизация
│   │   ├── register/           # Регистрация
│   │   ├── onboarding/        # Онбординг
│   │   ├── app/               # Защищенная зона
│   │   │   ├── dashboard/     # Дашборд клиента
│   │   │   ├── nutrition/     # Ввод питания
│   │   │   ├── reports/      # Отчеты (Premium)
│   │   │   ├── settings/     # Настройки
│   │   │   ├── achievements/ # Достижения
│   │   │   └── coach/        # Кабинет тренера
│   │   ├── admin/             # Супер-админка
│   │   └── api/               # Next.js API Routes
│   ├── components/            # React компоненты
│   │   ├── ui/                # Базовые UI компоненты
│   │   ├── charts/            # Компоненты графиков
│   │   ├── chat/              # Компоненты чата
│   │   ├── products/          # Компоненты продуктов
│   │   ├── ocr/               # Компоненты OCR
│   │   ├── achievements/       # Компоненты достижений
│   │   ├── reports/           # Компоненты отчетов
│   │   ├── invites/           # Компоненты инвайт-кодов
│   │   └── pwa/               # Компоненты PWA
│   ├── utils/                 # Утилиты
│   │   ├── supabase/          # Supabase утилиты
│   │   ├── validation/        # Валидация
│   │   ├── export/            # Экспорт данных
│   │   ├── products/          # Работа с продуктами
│   │   ├── ocr/               # OCR обработка
│   │   ├── chat/              # Чат утилиты
│   │   ├── invites/           # Инвайт-коды
│   │   └── achievements/      # Достижения
│   ├── hooks/                 # Custom hooks
│   ├── types/                 # TypeScript типы
│   └── middleware.ts          # Роутинг по ролям
├── supabase/
│   ├── functions/            # Supabase Edge Functions
│   │   ├── send-notification/
│   │   ├── check-expired-subscriptions/
│   │   ├── check-expiring-subscriptions/
│   │   └── update-product-cache/
│   └── config.toml            # Конфигурация Supabase
├── docs/
│   ├── migrations/            # SQL миграции
│   ├── product/               # Продуктовая документация
│   └── *.md                   # Другая документация
├── e2e/                       # E2E тесты (Playwright)
├── public/                    # Статические файлы
│   └── manifest.json          # PWA манифест
├── .cursor/                   # Правила разработки
├── package.json               # Зависимости
├── tsconfig.json              # TypeScript конфигурация
├── next.config.ts             # Next.js конфигурация
├── jest.config.js             # Jest конфигурация
├── playwright.config.ts       # Playwright конфигурация
├── Dockerfile                 # Docker образ
├── docker-compose.yml         # Docker Compose
└── Makefile                   # Команды для разработки
```

---

## Настройка окружения

### Требования

- **Node.js:** 20+
- **npm:** 9+ (или yarn/pnpm)
- **Docker:** 20+ (для production деплоя)
- **Supabase проект:** Созданный на supabase.com

### Локальная разработка

#### 1. Клонирование репозитория

```bash
git clone git@github.com:toffguy77/my-fitness-app.git
cd my-fitness-app
```

#### 2. Установка зависимостей

```bash
npm install
```

#### 3. Настройка переменных окружения

Создайте файл `.env.local`:

```bash
cp env.example .env.local
```

Заполните переменные:

```bash
# Supabase (обязательно)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Email Configuration (Resend) - опционально
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=Fitness App <noreply@yourdomain.com>
NEXT_PUBLIC_APP_URL=http://localhost:3069

# OCR Configuration (опционально)
NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1-xxxxx
```

#### 4. Настройка базы данных

1. Создайте проект в Supabase
2. Выполните миграции в порядке версий:
   - Откройте Supabase SQL Editor
   - Выполните `docs/migrations/setup_database_from_scratch.sql` для новой БД
   - Или выполните миграции последовательно для существующей БД

#### 5. Запуск dev сервера

```bash
npm run dev
```

Откройте [http://localhost:3069](http://localhost:3069)

---

## Процесс разработки

### 1. Создание feature ветки

```bash
git checkout -b feature/description
```

### 2. Разработка

#### Следование правилам

Перед началом работы:
1. Прочитайте [.cursor/rules.md](../.cursor/rules.md)
2. Изучите актуальную документацию
3. Понять текущую архитектуру

#### Создание компонентов

```bash
# Создать новый компонент
touch src/components/NewComponent.tsx

# Создать тесты
touch src/components/__tests__/NewComponent.test.tsx
```

#### Создание миграций БД

```bash
# Создать новую миграцию
touch docs/migrations/v4.1_add_new_feature.sql

# Обновить setup_database_from_scratch.sql
```

#### Обновление документации

При значимых изменениях:
1. Обновите `Application_Structure_vN.md`
2. Обновите `Application_Navigation_Diagrams_vN.md`
3. Создайте новую версию при необходимости

### 3. Тестирование

```bash
# Unit/Integration тесты
npm test

# С покрытием кода
npm run test:coverage

# E2E тесты
npm run test:e2e

# Все тесты
npm run test:all
```

### 4. Линтинг и проверка типов

```bash
# Линтинг
npm run lint

# Проверка типов
npm run type-check
```

### 5. Коммит изменений

**Формат commit message:**
```
type(scope): краткое описание

Подробное описание изменений (если необходимо)

- Что изменено
- Почему изменено
- Связанные задачи/документы
```

**Типы коммитов:**
- `feat` — новая функциональность
- `fix` — исправление бага
- `docs` — изменения в документации
- `test` — добавление/изменение тестов
- `refactor` — рефакторинг кода
- `migration` — миграции БД

### 6. Push и создание Pull Request

```bash
git push origin feature/description
```

---

## Тестирование

### Типы тестов

#### 1. Unit Tests (Jest)

**Расположение:** `src/**/__tests__/*.test.ts`

**Пример:**
```typescript
import { validateCaloriesMatchMacros } from '@/utils/validation/nutrition'

describe('validateCaloriesMatchMacros', () => {
  it('should validate correct values', () => {
    const result = validateCaloriesMatchMacros(200, 20, 10, 20)
    expect(result.valid).toBe(true)
  })
})
```

#### 2. Functional Tests (Jest + Testing Library)

**Расположение:** `src/**/__tests__/*.test.tsx`

**Пример:**
```typescript
import { render, screen } from '@testing-library/react'
import ProgressBar from '@/components/ProgressBar'

describe('ProgressBar', () => {
  it('should render progress', () => {
    render(<ProgressBar current={80} target={100} label="Test" />)
    expect(screen.getByText(/80/)).toBeInTheDocument()
  })
})
```

#### 3. E2E Tests (Playwright)

**Расположение:** `e2e/*.spec.ts`

**Пример:**
```typescript
import { test, expect } from '@playwright/test'

test('user can login', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'test@example.com')
  await page.fill('input[type="password"]', 'password')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/app/dashboard')
})
```

### Запуск тестов

```bash
# Все unit/integration тесты
npm test

# В режиме watch
npm test -- --watch

# С покрытием
npm run test:coverage

# E2E тесты
npm run test:e2e

# E2E с UI
npm run test:e2e:ui

# Все тесты
npm run test:all
```

### Покрытие кода

**Целевое покрытие:**
- Критичная бизнес-логика: 80%+
- Общее покрытие: 80%+

**Просмотр отчета:**
```bash
npm run test:coverage
# Откройте coverage/lcov-report/index.html
```

---

## Деплой

### Docker Deployment

#### 1. Подготовка

```bash
# Создайте .env.production
cp env.example .env.production
# Заполните переменные
```

#### 2. Сборка образа

```bash
docker build -t my-fitness-app .
```

#### 3. Запуск через Docker Compose

```bash
docker-compose up -d --build
```

#### 4. Использование Makefile

```bash
make build    # Собрать образ
make up       # Запустить контейнеры
make down     # Остановить контейнеры
make logs     # Просмотр логов
make update   # Обновить из git и пересобрать
```

### Production Build

#### 1. Сборка

```bash
npm run build
```

#### 2. Запуск

```bash
npm start
```

### Настройка Supabase Edge Functions

#### 1. Установка Supabase CLI

```bash
npm install -g supabase
```

#### 2. Логин в Supabase

```bash
supabase login
```

#### 3. Связывание проекта

```bash
supabase link --project-ref your-project-ref
```

#### 4. Деплой Edge Functions

```bash
supabase functions deploy send-notification
supabase functions deploy check-expired-subscriptions
supabase functions deploy check-expiring-subscriptions
supabase functions deploy update-product-cache
```

#### 5. Настройка переменных окружения

В Supabase Dashboard:
- Settings → Edge Functions → Environment Variables
- Добавьте:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - `NEXT_PUBLIC_APP_URL`

#### 6. Настройка Cron Jobs

В Supabase SQL Editor выполните:

```sql
-- Проверка истекших подписок (ежедневно в 00:00)
SELECT cron.schedule(
  'check-expired-subscriptions-daily',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/check-expired-subscriptions',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    )
  ) AS request_id;
  $$
);

-- Проверка истекающих подписок (ежедневно в 00:00)
SELECT cron.schedule(
  'check-expiring-subscriptions-daily',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/check-expiring-subscriptions',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    ),
    body := '{"daysAhead": 3}'::jsonb
  ) AS request_id;
  $$
);
```

---

## CI/CD (будущее)

### GitHub Actions

**Планируется:**
- Автоматические тесты при push
- Автоматический деплой при merge в main
- Проверка типов и линтинг
- Сборка Docker образа

---

## Отладка

### Локальная отладка

#### 1. Dev сервер с hot reload

```bash
npm run dev
```

#### 2. Проверка логов

```typescript
import { logger } from '@/utils/logger'

logger.debug('Debug message', { data })
logger.info('Info message', { data })
logger.warn('Warning message', { data })
logger.error('Error message', error, { context })
```

#### 3. React DevTools

Установите React DevTools для отладки компонентов

#### 4. Network Tab

Используйте DevTools Network Tab для отладки API запросов

### Production отладка

#### 1. Логи Docker

```bash
docker-compose logs -f
```

#### 2. Supabase Logs

- Edge Functions: Supabase Dashboard → Edge Functions → Logs
- Database: Supabase Dashboard → Database → Logs

---

## Производительность

### Оптимизация

#### 1. Code Splitting

Next.js автоматически разделяет код по маршрутам

#### 2. Image Optimization

Используйте `next/image` для оптимизации изображений

#### 3. Database Queries

- SELECT только нужные поля
- Используйте индексы
- Пагинация для больших списков

#### 4. Caching

- Service Worker для статических ресурсов
- React.useMemo для вычислений
- React.useCallback для функций

---

## Безопасность

### Проверки безопасности

#### 1. RLS политики

Все таблицы защищены Row Level Security

#### 2. Middleware

Защита маршрутов на уровне middleware

#### 3. Валидация

Валидация данных на клиенте и сервере

#### 4. Секреты

Никогда не коммитьте секреты в git:
- Используйте `.env.local` для локальной разработки
- Используйте переменные окружения для production

---

## Мониторинг

### Метрики

#### 1. Производительность

- Время загрузки страниц
- Время выполнения запросов
- Размер бандла

#### 2. Ошибки

- Логирование всех ошибок
- Отслеживание частоты ошибок

#### 3. Использование

- Активные пользователи
- Частота использования функций

---

## Troubleshooting

### Частые проблемы

#### 1. Ошибки авторизации

**Проблема:** Пользователь не может войти

**Решение:**
- Проверьте переменные окружения Supabase
- Проверьте RLS политики
- Проверьте логи в Supabase Dashboard

#### 2. Ошибки миграций

**Проблема:** Миграция не выполняется

**Решение:**
- Проверьте зависимости миграций
- Выполняйте миграции последовательно
- Проверьте логи в Supabase SQL Editor

#### 3. Проблемы с Edge Functions

**Проблема:** Edge Function не работает

**Решение:**
- Проверьте переменные окружения
- Проверьте логи в Supabase Dashboard
- Проверьте права доступа (Service Role Key)

---

## Связанные документы

- [Technical_Architecture.md](./Technical_Architecture.md) - Техническая архитектура
- [Database_Schema.md](./Database_Schema.md) - Схема базы данных
- [API_Reference.md](./API_Reference.md) - Справочник API
- [.cursor/rules.md](../.cursor/rules.md) - Правила разработки
- [README.md](../README.md) - Общая информация

---

**Последнее обновление:** Январь 2025  
**Версия документа:** 1.0

