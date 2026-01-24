# Быстрый старт: Тестирование

## Установка

```bash
# Установить зависимости и настроить хуки
npm install

# Установить Go зависимости для backend
cd apps/api && go mod download
```

## Запуск тестов

### Frontend

```bash
# Все тесты
npm run test:web

# Watch режим (для разработки)
cd apps/web && npm run test:watch

# С покрытием
npm run test:coverage:web
```

### Backend

```bash
# Все тесты
npm run test:api

# С покрытием
cd apps/api && make test-coverage

# Бенчмарки
cd apps/api && make bench
```

### Все вместе

```bash
# Запустить все тесты с покрытием
npm run test:coverage

# CI режим (как в GitHub Actions)
npm run test:coverage:ci
```

## Pre-commit хуки

Хуки настроены автоматически и запускаются перед каждым коммитом:

- **Frontend**: type-check, lint, тесты (только для измененных файлов)
- **Backend**: fmt check, тесты (только для измененных пакетов)

### Пропустить хуки (не рекомендуется)

```bash
git commit --no-verify -m "message"
```

## Требования к покрытию

- **Минимум 80%** для всех метрик
- Проверяется автоматически в CI
- Коммит будет заблокирован при покрытии < 80%

## Структура тестов

```
apps/web/src/
├── features/auth/__tests__/        # Тесты компонентов
├── shared/hooks/__tests__/         # Тесты хуков
└── shared/utils/__tests__/         # Тесты утилит

apps/api/internal/
├── modules/auth/*_test.go          # Тесты модулей
└── shared/middleware/*_test.go     # Тесты middleware
```

## Полезные команды

```bash
# Проверить всё перед коммитом
npm run type-check && npm run lint && npm run test:coverage

# Посмотреть покрытие в браузере
npm run test:coverage:web  # откроет apps/web/coverage/lcov-report/index.html
cd apps/api && make test-coverage-html  # откроет coverage.html

# Запустить только быстрые тесты
cd apps/api && go test ./... -short
```

## Документация

Полная документация: [docs/TESTING.md](docs/TESTING.md)
