# Environment Setup Guide

Руководство по настройке окружения для разработки BURCEV Fitness App.

## Проблема

На macOS с Homebrew возникают проблемы с PATH для Go и других инструментов, особенно в IDE (Kiro) и при работе с git hooks.

## Решение

### Автоматическое исправление

Запустите скрипт для автоматического исправления `~/.zshrc`:

```bash
bash scripts/fix-zshrc.sh
```

Скрипт:
1. Создаст backup вашего текущего `.zshrc`
2. Исправит порядок инициализации
3. Добавит правильную настройку Homebrew PATH
4. Организует секции для лучшей читаемости

После выполнения перезапустите терминал или выполните:

```bash
source ~/.zshrc
```

### Что было исправлено

**Проблема:** В `.zshrc` команда `brew` вызывалась до того, как Homebrew был добавлен в PATH:

```bash
# ❌ НЕПРАВИЛЬНО - brew еще не в PATH
export GOROOT="$(brew --prefix go)/libexec"
```

**Решение:** Сначала настраиваем Homebrew, потом используем его:

```bash
# ✅ ПРАВИЛЬНО - сначала добавляем Homebrew в PATH
if [[ -f "/opt/homebrew/bin/brew" ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Теперь можно использовать brew
if command -v brew &> /dev/null; then
  export GOROOT="$(brew --prefix go)/libexec"
fi
```

## Структура исправленного .zshrc

```bash
# 1. Powerlevel10k instant prompt (должен быть первым)
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# 2. Homebrew Setup (КРИТИЧНО - до любых brew команд)
if [[ -f "/opt/homebrew/bin/brew" ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# 3. Oh My Zsh
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="powerlevel10k/powerlevel10k"
plugins=(git)
source $ZSH/oh-my-zsh.sh

# 4. Autoenv (после Homebrew)
if [[ -f "/opt/homebrew/opt/autoenv/activate.sh" ]]; then
  source /opt/homebrew/opt/autoenv/activate.sh
fi

# 5. Go Setup (после Homebrew)
if command -v brew &> /dev/null; then
  export GOPATH="$HOME/src/go"
  export GOROOT="$(brew --prefix go)/libexec"
  export PATH="$PATH:$GOPATH/bin:$GOROOT/bin"
fi

# 6. Aliases
alias docker=podman
alias ll='ls -laH'

# 7. Powerlevel10k Configuration
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
```

## Проверка

После исправления проверьте, что все работает:

```bash
# Проверить что brew доступен
which brew
# Должно вывести: /opt/homebrew/bin/brew

# Проверить что Go доступен
which go
# Должно вывести: /opt/homebrew/bin/go

# Проверить переменные окружения
echo $GOROOT
# Должно вывести: /opt/homebrew/opt/go/libexec

echo $GOPATH
# Должно вывести: /Users/yourusername/src/go

# Проверить версию Go
go version
# Должно вывести: go version go1.25.5 darwin/arm64
```

## Для проекта

В проекте используется Makefile, который автоматически настраивает окружение:

```bash
# Makefile автоматически экспортирует правильные пути
export GOROOT := /opt/homebrew/opt/go/libexec
export GOPATH := $(HOME)/src/go
export PATH := /opt/homebrew/bin:$(GOROOT)/bin:$(GOPATH)/bin:$(PATH)
```

Поэтому команды `make` всегда работают корректно:

```bash
make build-api    # Работает даже если shell окружение не настроено
make test-api     # Работает корректно
make dev-api      # Работает корректно
```

## Git Hooks

Pre-commit hooks также используют правильное окружение:

```bash
# .husky/pre-commit
export GOROOT=/opt/homebrew/opt/go/libexec
export GOPATH=$HOME/src/go
export PATH=/opt/homebrew/bin:/opt/homebrew/opt/go/libexec/bin:$GOPATH/bin:$PATH
```

## Troubleshooting

### Терминал зависает при запуске

**Симптомы:**
- Терминал показывает "Restarting the terminal..."
- Ошибка "command not found: brew"
- Powerlevel10k показывает предупреждения

**Причина:**
Autoenv вызывает зависание при инициализации shell.

**Решение:**
```bash
# Отключите autoenv в ~/.zshrc
# Закомментируйте или удалите эти строки:
# if [[ -f "/opt/homebrew/opt/autoenv/activate.sh" ]]; then
#   source /opt/homebrew/opt/autoenv/activate.sh
# fi

# Перезапустите терминал
source ~/.zshrc
```

**Альтернатива:** Используйте direnv вместо autoenv - он более стабильный.

### Go не найден в Kiro

**Симптомы:**
- Ошибка "go: cannot find GOROOT directory"
- Команды make работают, но Kiro не видит Go

**Решение:**
Kiro не наследует shell окружение. Используйте команды через Makefile:

```bash
# ❌ Не работает в Kiro
go build ./cmd/server

# ✅ Работает в Kiro
make build-api
```

**Важно:** Если Go Setup был отключен в ~/.zshrc (закомментирован), включите его обратно:

```bash
# Go Setup (after Homebrew is in PATH)
if command -v brew &> /dev/null; then
  export GOPATH="$HOME/src/go"
  export GOROOT="$(brew --prefix go)/libexec"
  export PATH="$PATH:$GOPATH/bin:$GOROOT/bin"
fi
```

### npm не найден

**Симптомы:**
- Ошибка "npm: command not found"

**Решение:**
```bash
# Установите Node.js через Homebrew
brew install node

# Проверьте установку
which npm
npm --version
```

### Восстановление из backup

Если что-то пошло не так:

```bash
# Найти backup файлы
ls -la ~/.zshrc.backup.*

# Восстановить последний backup
cp ~/.zshrc.backup.20260124_222622 ~/.zshrc

# Перезапустить терминал
source ~/.zshrc
```

## Дополнительные ресурсы

- [Makefile Guide](./MAKEFILE_GUIDE.md) - Использование Makefile
- [Kiro Setup](../KIRO_SETUP.md) - Настройка Kiro
- [Homebrew Documentation](https://docs.brew.sh/) - Документация Homebrew
- [Powerlevel10k](https://github.com/romkatv/powerlevel10k) - Документация темы

## Поддержка

Если проблемы остались:

1. Проверьте что Homebrew установлен: `which brew`
2. Проверьте что Go установлен: `brew list | grep go`
3. Запустите `make version` для диагностики
4. Проверьте backup файлы: `ls -la ~/.zshrc.backup.*`
