# Настройка окружения для Kiro

## Проблема

Kiro не наследует переменные окружения из вашей оболочки (zsh/bash), что приводит к ошибкам типа:
```
go: cannot find GOROOT directory: /libexec
```

## Решение

### 1. Автоматическая настройка (рекомендуется)

Создан файл `.kiro/settings/env.json` с правильными путями для вашей системы:

```json
{
  "environment": {
    "GOROOT": "/opt/homebrew/opt/go/libexec",
    "GOPATH": "$HOME/src/go",
    "PATH": "/opt/homebrew/bin:/opt/homebrew/opt/go/libexec/bin:$HOME/src/go/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  }
}
```

### 2. Проверка настроек

Выполните в терминале Kiro:
```bash
export GOROOT=/opt/homebrew/opt/go/libexec
export PATH=/opt/homebrew/bin:$PATH
go version
```

Должно вывести: `go version go1.25.5 darwin/arm64`

### 3. Для других инструментов

Если у вас установлены другие инструменты через Homebrew, добавьте их пути в `env.json`:

```json
{
  "environment": {
    "GOROOT": "/opt/homebrew/opt/go/libexec",
    "GOPATH": "$HOME/src/go",
    "NODE_PATH": "/opt/homebrew/lib/node_modules",
    "PATH": "/opt/homebrew/bin:..."
  }
}
```

## Ваша текущая конфигурация

Из вашего `~/.zshrc`:
```bash
export GOPATH="$HOME/src/go/"
export GOROOT="$(brew --prefix go)/libexec"
export PATH=$PATH:$GOPATH/bin
export PATH=$PATH:$GOROOT/bin
```

## Альтернативное решение

Если `.kiro/settings/env.json` не работает, можно:

1. **Создать wrapper скрипт** для команд Go:
   ```bash
   # .kiro/scripts/go-wrapper.sh
   #!/bin/bash
   export GOROOT=/opt/homebrew/opt/go/libexec
   export PATH=/opt/homebrew/bin:$PATH
   /opt/homebrew/bin/go "$@"
   ```

2. **Использовать полные пути** в Makefile:
   ```makefile
   GO := GOROOT=/opt/homebrew/opt/go/libexec /opt/homebrew/bin/go
   
   test:
       $(GO) test ./...
   ```

3. **Настроить VS Code / Kiro settings**:
   - Открыть настройки Kiro
   - Добавить переменные окружения в конфигурацию терминала

## Проверка установки

```bash
# Проверить Go
which go
# Должно вывести: /opt/homebrew/bin/go

# Проверить GOROOT
echo $GOROOT
# Должно вывести: /opt/homebrew/opt/go/libexec

# Проверить версию
go version
# Должно вывести: go version go1.25.5 darwin/arm64
```

## Для CI/CD

В GitHub Actions переменные окружения настраиваются автоматически через `setup-go` action:

```yaml
- name: Setup Go
  uses: actions/setup-go@v5
  with:
    go-version: '1.22'
```

## Troubleshooting

### Ошибка: "go: cannot find GOROOT directory"

**Причина:** GOROOT не установлен или указывает на неправильный путь.

**Решение:**
```bash
export GOROOT=/opt/homebrew/opt/go/libexec
```

### Ошибка: "command not found: go"

**Причина:** Go не в PATH.

**Решение:**
```bash
export PATH=/opt/homebrew/bin:$PATH
```

### Проверить правильный путь к Go

```bash
brew --prefix go
# Выведет: /opt/homebrew/opt/go

ls -la /opt/homebrew/opt/go/libexec
# Должна быть директория с Go SDK
```

## Для разработчиков команды

Если вы клонируете проект, убедитесь что:

1. Go установлен через Homebrew (macOS):
   ```bash
   brew install go
   ```

2. Или через официальный установщик:
   - Скачать с https://go.dev/dl/
   - Установить в `/usr/local/go`
   - Добавить в PATH: `export PATH=$PATH:/usr/local/go/bin`

3. Проверить установку:
   ```bash
   go version
   ```

## Полезные ссылки

- [Go Installation Guide](https://go.dev/doc/install)
- [Homebrew Go Formula](https://formulae.brew.sh/formula/go)
- [Kiro Documentation](https://docs.kiro.ai)
