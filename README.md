# Fitness App - Freemium SaaS Platform

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
```

5. Запустите dev сервер:
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
│   │   └── coach/        # Кабинет тренера
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
