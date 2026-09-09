#!/usr/bin/env bash
#
# Те же проверки, что гонял CI Pipeline, только здесь.
#
# Workflow'ы CI Pipeline, E2E и Deploy отключены вручную (gh workflow disable).
# Пока это так, единственное, что стоит между ошибкой и веткой, — этот скрипт.
# Поэтому он повторяет джобы ci.yml командой в команду, а не «примерно то же».
#
# ВАЖНО: CI Pipeline даёт четыре проверки, которые ruleset требует для слияния
# в main — CI Pipeline, Performance Analysis, Comprehensive Security Scan,
# Container Security Scan. Пока он отключён, PR на прод покажет «готов к
# слиянию» и «заблокирован» одновременно, без единой упавшей проверки. Перед
# релизом: gh workflow enable 222915356 и дождаться зелёного.
#
# Не покрыто здесь: сборка образов и интеграционные тесты с настоящей
# PostgreSQL — им нужен движок контейнеров, который поднимается не всегда.
# Интеграционные гоняются отдельно: make -C apps/api test-integration.
#
# Использование:
#   scripts/ci-local.sh          все проверки
#   scripts/ci-local.sh fast     без тестов: только статика, типы, линтеры

set -uo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-all}"
FAILED=()

step() {
    local name="$1"; shift
    printf '\n\033[1m── %s\033[0m\n' "$name"
    if "$@"; then
        printf '\033[32m   ок\033[0m\n'
    else
        printf '\033[31m   ОШИБКА\033[0m\n'
        FAILED+=("$name")
    fi
}

# --- Статические проверки (джоба static-checks) -----------------------------
step "Контракт API между фронтендом и бэкендом" node scripts/check-api-contract.mjs
step "Целостность кодовой базы"                 node scripts/check-codebase-integrity.mjs
step "Переводы"                                 node scripts/check-i18n.mjs
step "TypeScript"                               npm run type-check
step "ESLint"                                   npm run lint:web

# --- Бэкенд (джобы backend-tests, backend-lint) -----------------------------
gofmt_check() {
    local unformatted
    unformatted="$(cd apps/api && gofmt -l .)"
    if [ -n "$unformatted" ]; then
        echo "Файлы не отформатированы:"
        echo "$unformatted"
        return 1
    fi
}
step "gofmt" gofmt_check
step "go vet" bash -c 'cd apps/api && go vet ./...'

if [ "$MODE" != "fast" ]; then
    # -race обязателен: хаб веб-сокетов делится между горутинами, а аналитика
    # куратора расходится через errgroup. Эти гонки видны только под детектором.
    step "Тесты бэкенда с детектором гонок" bash -c 'cd apps/api && go test -race ./...'
    step "Тесты фронтенда"                  bash -c 'cd apps/web && npx jest --silent'
fi

# --- Итог -------------------------------------------------------------------
printf '\n'
if [ ${#FAILED[@]} -eq 0 ]; then
    printf '\033[32mВсё зелёное.\033[0m\n'
    exit 0
fi

printf '\033[31mУпало (%d):\033[0m\n' "${#FAILED[@]}"
for name in "${FAILED[@]}"; do
    printf '  · %s\n' "$name"
done
exit 1
