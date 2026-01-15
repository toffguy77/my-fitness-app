# Pre-Commit Hooks Setup

Этот документ описывает настройку и использование pre-commit hooks для локальной проверки кода перед отправкой в GitHub.

## Зачем это нужно?

Pre-commit hooks автоматически запускают проверки **локально** перед каждым коммитом, что позволяет:

- ✅ Обнаруживать ошибки до отправки в GitHub
- ✅ Экономить время на исправление ошибок в CI/CD
- ✅ Поддерживать высокое качество кода
- ✅ Избегать "красных" пайплайнов в GitHub Actions

## Быстрая установка

### Вариант 1: Автоматическая установка (рекомендуется)

```bash
npm run precommit:setup
```

Этот скрипт автоматически:
1. Установит `pre-commit` (через pip или brew)
2. Настроит git hooks
3. Обновит hooks до последних версий
4. Запустит проверку на всех файлах

### Вариант 2: Ручная установка

```bash
# 1. Установите pre-commit
pip install pre-commit
# или
brew install pre-commit

# 2. Установите git hooks
pre-commit install
pre-commit install --hook-type pre-push

# 3. (Опционально) Запустите на всех файлах
pre-commit run --all-files
```

## Что проверяется?

### При каждом коммите (commit):

1. **TypeScript Type Check** - проверка типов TypeScript
   ```bash
   npm run type-check
   ```

2. **ESLint** - проверка качества кода и стиля
   ```bash
   npm run lint
   ```

3. **Jest Tests** - запуск тестов для измененных файлов
   ```bash
   npm test -- --bail --findRelatedTests
   ```

4. **Detect Secrets** - поиск секретов и паролей в коде

5. **File Checks**:
   - Проверка больших файлов (>1MB)
   - Проверка JSON/YAML синтаксиса
   - Проверка приватных ключей
   - Удаление trailing whitespace
   - Исправление окончаний файлов

### При каждом push:

1. **NPM Security Audit** - проверка уязвимостей в зависимостях
   ```bash
   npm audit --audit-level=high
   ```

## Использование

### Обычный workflow

```bash
# 1. Внесите изменения в код
git add .

# 2. Сделайте коммит (hooks запустятся автоматически)
git commit -m "feat: добавил новую функцию"

# Если проверки прошли успешно:
✅ TypeScript Type Check.....................................Passed
✅ ESLint....................................................Passed
✅ Jest Tests................................................Passed
✅ Detect secrets............................................Passed

# 3. Отправьте в GitHub
git push origin main

# При push запустится security audit
✅ NPM Security Audit........................................Passed
```

### Если проверка не прошла

```bash
# Hooks покажут ошибки:
❌ ESLint....................................................Failed
- hook id: eslint
- exit code: 1

/path/to/file.ts
  10:5  error  'variable' is never used  @typescript-eslint/no-unused-vars

# Исправьте ошибки и попробуйте снова
git add .
git commit -m "fix: исправил ошибки линтера"
```

### Пропустить проверки (не рекомендуется!)

```bash
# Пропустить все hooks
git commit --no-verify -m "WIP: временный коммит"

# Или установить переменную окружения
SKIP=eslint git commit -m "пропустить только eslint"
```

## Полезные команды

```bash
# Запустить все hooks вручную на всех файлах
npm run precommit:run
# или
pre-commit run --all-files

# Запустить конкретный hook
pre-commit run eslint --all-files
pre-commit run typescript-check --all-files

# Обновить hooks до последних версий
npm run precommit:update
# или
pre-commit autoupdate

# Посмотреть список установленных hooks
pre-commit run --all-files --verbose

# Удалить hooks (если нужно)
pre-commit uninstall
```

## Настройка

Конфигурация находится в файле `.pre-commit-config.yaml` в корне проекта.

### Отключить конкретный hook

Отредактируйте `.pre-commit-config.yaml` и добавьте hook в секцию `ci.skip`:

```yaml
ci:
  skip: [jest-tests]  # Пропустить тесты в CI
```

### Изменить когда запускается hook

Измените `stages` для конкретного hook:

```yaml
- id: jest-tests
  stages: [push]  # Запускать только при push, не при commit
```

## Troubleshooting

### pre-commit не найден

```bash
# Установите через pip
pip3 install pre-commit

# Или через brew (macOS)
brew install pre-commit

# Проверьте установку
pre-commit --version
```

### Hooks не запускаются

```bash
# Переустановите hooks
pre-commit uninstall
pre-commit install
pre-commit install --hook-type pre-push
```

### Тесты работают слишком долго

Можно настроить запуск только для измененных файлов или отключить тесты при коммите:

```yaml
# В .pre-commit-config.yaml
- id: jest-tests
  stages: [push]  # Запускать только при push
```

### Ошибка "command not found: npm"

Убедитесь, что Node.js установлен и доступен в PATH:

```bash
node --version
npm --version
```

## Интеграция с IDE

### VS Code

Установите расширение:
- [Pre-commit Helper](https://marketplace.visualstudio.com/items?itemName=elagil.pre-commit-helper)

### WebStorm / IntelliJ IDEA

Pre-commit hooks работают автоматически через git integration.

## Производительность

Если hooks работают медленно:

1. **Используйте кэш**: pre-commit автоматически кэширует результаты
2. **Запускайте тесты только для измененных файлов**: уже настроено через `--findRelatedTests`
3. **Отключите медленные hooks для коммитов**: переместите их в `pre-push` stage

## Дополнительная информация

- [Официальная документация pre-commit](https://pre-commit.com/)
- [Список доступных hooks](https://pre-commit.com/hooks.html)
- [GitHub Actions интеграция](https://pre-commit.ci/)

## Поддержка

Если возникли проблемы:
1. Проверьте [Troubleshooting](#troubleshooting) выше
2. Запустите `pre-commit run --all-files --verbose` для детальной информации
3. Проверьте логи в `.git/hooks/`
