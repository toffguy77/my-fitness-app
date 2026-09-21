#!/usr/bin/env bash
#
# Обёртка, которая гарантирует зачистку рабочей среды после прогона E2E —
# независимо от того, чем он кончился.
#
# Владелец продукта требует: после прогона среда обязана вернуться в то же
# состояние, что была до него, даже если процесс прогона упал или его
# прервали. Обычный «вызов уборки в конце скрипта» этого не даёт: если
# прогон падает раньше той строки — уборка просто не происходит. Поэтому
# здесь `trap` на EXIT/INT/TERM, а не вызов после команды.
#
# Что делает:
#   1. Снимает слепок-счёт (scripts/e2e-db-snapshot.sh) до прогона.
#   2. Ставит зачистку (scripts/e2e-db-cleanup.sh) на trap — она выполнится
#      при любом исходе: тесты прошли, тесты упали, процесс убили сигналом.
#   3. Запускает переданную команду как есть (обычно `npm run test:e2e`) и
#      выходит с её кодом — если сама зачистка после этого найдёт
#      расхождение, это отдельная громкая ошибка, а не тихая подмена кода
#      выхода тестов.
#
# Использование:
#   DATABASE_URL=postgres://... \
#   E2E_CLIENT_EMAIL=... E2E_CURATOR_EMAIL=... E2E_ADMIN_EMAIL=... \
#   scripts/e2e-run-with-cleanup.sh npm run test:e2e
#
#   scripts/e2e-run-with-cleanup.sh npx playwright test support-widget.spec.ts

set -uo pipefail # не -e: код завершения обёрнутой команды нужен целым, даже ненулевой

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$#" -eq 0 ]; then
    echo "использование: $0 <команда прогона e2e> [аргументы...]" >&2
    exit 1
fi

: "${DATABASE_URL:?нужен DATABASE_URL — строка подключения к PostgreSQL (не печатается)}"

echo "→ снимаю слепок-счёт перед прогоном..." >&2
SNAPSHOT_FILE="$("$REPO_ROOT/scripts/e2e-db-snapshot.sh")"
SNAPSHOT_STATUS=$?
if [ "$SNAPSHOT_STATUS" -ne 0 ] || [ -z "$SNAPSHOT_FILE" ]; then
    echo "!!! не удалось снять слепок — прогон не запускается, зачищать после него нечем !!!" >&2
    exit 1
fi

CLEANUP_DONE=0
CLEANUP_STATUS=0

run_cleanup() {
    if [ "$CLEANUP_DONE" -eq 1 ]; then
        return
    fi
    CLEANUP_DONE=1
    echo "→ зачищаю данные прогона (слепок: $SNAPSHOT_FILE)..." >&2
    "$REPO_ROOT/scripts/e2e-db-cleanup.sh" "$SNAPSHOT_FILE"
    CLEANUP_STATUS=$?
    if [ "$CLEANUP_STATUS" -ne 0 ]; then
        echo "!!! ЗАЧИСТКА ПОСЛЕ E2E НЕ ЗАВЕРШИЛАСЬ ЧИСТО (код $CLEANUP_STATUS) — рабочая среда может отличаться от состояния до прогона. Требуется ручная проверка базы по слепку $SNAPSHOT_FILE !!!" >&2
    else
        echo "→ зачистка завершена, расхождений с состоянием до прогона не найдено" >&2
    fi
}

# EXIT покрывает нормальное завершение и падение; INT/TERM — обрыв сигналом.
# На INT/TERM обработчик сам себя не вызовет дважды: EXIT сработает следом за
# ними в любом случае, а CLEANUP_DONE не даёт зачистке пойти дважды подряд.
trap run_cleanup EXIT INT TERM

echo "→ запускаю: $*" >&2
"$@"
RUN_STATUS=$?

trap - EXIT INT TERM
run_cleanup

if [ "$RUN_STATUS" -ne 0 ]; then
    exit "$RUN_STATUS"
fi
exit "$CLEANUP_STATUS"
