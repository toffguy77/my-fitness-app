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
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

5. Запустите dev сервер:
```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000)

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

SQL миграции находятся в `docs/migrations/`:

1. `phase2.5_step1_add_enum.sql` - добавление super_admin роли
2. `phase2.5_step2_add_columns.sql` - поля подписки
3. `phase2.5_step3_rls_policies.sql` - RLS policies
4. `add_weight_tracking.sql` - трекинг веса

Выполняйте по порядку в Supabase SQL Editor.

## 📚 Документация

- [Phase 1 BRD](./docs/Phase1_BRD.md) - MVP функционал
- [Phase 2 BRD](./docs/Phase2_BRD.md) - The Loop (петля обратной связи)
- [Phase 2.5 BRD](./docs/Phase2.5_BRD.md) - Freemium SaaS
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
```

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
