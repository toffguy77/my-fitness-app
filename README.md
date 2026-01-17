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

## 📝 Миграции БД

SQL миграции находятся в `docs/migrations/`. Подробная документация: [migrations/README.md](./docs/migrations/README.md)

**Для новой базы данных:**
- Используйте `setup_database_from_scratch.sql` для полного сетапа

**Для существующей базы:**
- Выполняйте миграции последовательно в порядке версий (v2.5.1 → v2.5.2 → ... → v3.3)

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
