#!/usr/bin/env bash
#
# Слепок-счёт перед прогоном E2E против рабочей среды.
#
# Что и зачем
# -----------
# E2E гоняется под тремя выделенными учётками (e2e-client@…, e2e-curator@…,
# e2e-admin@…), а не под личными аккаунтами живых людей — это сняло самую
# тяжёлую часть (восстановление чужого пароля и профиля). Но владелец
# продукта всё равно требует: после прогона среда обязана вернуться в то же
# состояние, в каком была до него. Прогон создаёт не только данные внутри
# трёх учёток — он заводит гостевые заявки (`e2e-lead-*`), веб-разговоры
# виджета поддержки и клиентов, которых заводит registration.spec.ts.
#
# Этот скрипт не восстанавливает ничего — он только считает. Он фиксирует:
#   1. отметку времени начала (по часам самой базы, не локальной машины —
#      иначе рассинхрон часов сдвинул бы окно и зачистка либо задела бы чужие
#      строки, либо пропустила бы свои);
#   2. три email из окружения (или ACCOUNT_EMAILS);
#   3. шаблоны гостевых email (что метит данные прогона, а не чужой трафик);
#   4. общее число строк «до» в таблицах, которые прогон способен изменить —
#      чтобы после зачистки было с чем сверить: числа обязаны совпасть.
#
# Слепок кладётся ВНЕ репозитория (по умолчанию ~/.burcev/e2e-cleanup) с
# правами 600. Он не сенситивен так, как был бы слепок с хэшем пароля — там
# только счётчики, email трёх тестовых (не человеческих) учёток и метка
# времени, — но каталог вне git и права 600 сохранены как защита по
# умолчанию, а не потому что там лежит что-то секретное.
#
# Список затрагиваемых таблиц не выдумывается заново: он читается из реестра
# `apps/api/internal/modules/account/erasure.go` (там уже есть полный список
# таблиц со ссылкой на users(id), и его полноту стережёт
# TestErasureCoversSchema). Свой список неизбежно разошёлся бы со схемой —
# этот его не дублирует, а разбирает.
#
# Использование:
#   DATABASE_URL=postgres://... \
#   E2E_CLIENT_EMAIL=e2e-client@burcev.team \
#   E2E_CURATOR_EMAIL=e2e-curator@burcev.team \
#   E2E_ADMIN_EMAIL=e2e-admin@burcev.team \
#   scripts/e2e-db-snapshot.sh [путь-к-файлу-слепка]
#
# Печатает путь к файлу слепка последней строкой в stdout (и ничего похожего
# на секрет ни туда, ни в диагностику на stderr).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ERASURE_GO="$REPO_ROOT/apps/api/internal/modules/account/erasure.go"

for bin in psql jq; do
    command -v "$bin" >/dev/null 2>&1 || {
        echo "нужен '$bin' в PATH" >&2
        exit 1
    }
done

: "${DATABASE_URL:?нужен DATABASE_URL — строка подключения к PostgreSQL (не печатается)}"

[ -f "$ERASURE_GO" ] || {
    echo "не нашёл реестр таблиц: $ERASURE_GO" >&2
    exit 1
}

# --- три учётки прогона ------------------------------------------------------
if [ -n "${ACCOUNT_EMAILS:-}" ]; then
    IFS=',' read -r -a ACCOUNTS <<<"$ACCOUNT_EMAILS"
else
    ACCOUNTS=()
    for var in E2E_CLIENT_EMAIL E2E_CURATOR_EMAIL E2E_ADMIN_EMAIL; do
        val="${!var:-}"
        if [ -z "$val" ]; then
            echo "предупреждение: $var не задан — слепок пойдёт без этой учётки" >&2
            continue
        fi
        ACCOUNTS+=("$val")
    done
fi

if [ "${#ACCOUNTS[@]}" -eq 0 ]; then
    echo "ни одна из трёх учётных записей не задана (E2E_CLIENT_EMAIL / E2E_CURATOR_EMAIL / E2E_ADMIN_EMAIL / ACCOUNT_EMAILS)" >&2
    exit 1
fi

# --- шаблоны гостевых данных --------------------------------------------------
DEFAULT_GUEST_PATTERNS="e2e-lead-%,widget-e2e-%,%@burcev.test"
GUEST_PATTERNS_CSV="${E2E_GUEST_EMAIL_PATTERNS:-$DEFAULT_GUEST_PATTERNS}"
IFS=',' read -r -a GUEST_PATTERNS <<<"$GUEST_PATTERNS_CSV"

# --- таблицы, которые прогон способен изменить -------------------------------
# Table|Column|Strategy — тот же разбор реестра, что использует cleanup-скрипт.
# Keep и пустая колонка не считаем: там либо нет прямой ссылки на человека
# (article_audience, oauth_pending_links), либо таблицы не существует под этим
# именем (coach_client_relationships переименована миграцией 010).
mapfile -t STRATEGY_ROWS < <(
    grep -E '^\s*\{Table: "' "$ERASURE_GO" |
        sed -E 's/.*Table: "([^"]*)".*Column: "([^"]*)".*Strategy: (Strategy[A-Za-z]+).*/\1|\2|\3/'
)

TABLES=(users leads support_conversations)
for row in "${STRATEGY_ROWS[@]}"; do
    IFS='|' read -r table col strategy <<<"$row"
    [ -z "$col" ] && continue
    [ "$strategy" = "StrategyKeep" ] && continue
    TABLES+=("$table")
done
# убрать дубликаты, сохранив порядок
mapfile -t TABLES < <(printf '%s\n' "${TABLES[@]}" | awk '!seen[$0]++')

# --- часы самой базы, не локальной машины ------------------------------------
WINDOW_START="$(psql "$DATABASE_URL" -Atqc 'SELECT NOW();')"

# --- счётчики "до" -------------------------------------------------------------
declare -A COUNTS
for table in "${TABLES[@]}"; do
    exists="$(psql "$DATABASE_URL" -Atqc "SELECT to_regclass('public.${table}') IS NOT NULL;")"
    if [ "$exists" != "t" ]; then
        continue # таблица переименована/не существует — не считаем то, чего нет
    fi
    count="$(psql "$DATABASE_URL" -Atqc "SELECT COUNT(*) FROM ${table};")"
    COUNTS["$table"]="$count"
done

# --- запись слепка -------------------------------------------------------------
STATE_DIR="${E2E_CLEANUP_STATE_DIR:-$HOME/.burcev/e2e-cleanup}"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
SNAPSHOT_FILE="${1:-$STATE_DIR/snapshot-$TS.json}"

{
    ACCOUNTS_JSON="$(printf '%s\n' "${ACCOUNTS[@]}" | jq -R . | jq -s .)"
    GUEST_JSON="$(printf '%s\n' "${GUEST_PATTERNS[@]}" | jq -R . | jq -s .)"

    COUNTS_JSON="{}"
    for table in "${!COUNTS[@]}"; do
        COUNTS_JSON="$(echo "$COUNTS_JSON" | jq --arg t "$table" --argjson v "${COUNTS[$table]}" '. + {($t): $v}')"
    done

    jq -n \
        --arg window_start "$WINDOW_START" \
        --arg created_at "$(date -u +%FT%TZ)" \
        --argjson accounts "$ACCOUNTS_JSON" \
        --argjson guest_patterns "$GUEST_JSON" \
        --argjson counts_before "$COUNTS_JSON" \
        '{window_start: $window_start, created_at: $created_at, accounts: $accounts, guest_patterns: $guest_patterns, counts_before: $counts_before}'
} >"$SNAPSHOT_FILE"

chmod 600 "$SNAPSHOT_FILE"

{
    echo "слепок записан: $SNAPSHOT_FILE (права 600, вне репозитория)"
    echo "окно начинается: $WINDOW_START (часы базы)"
    echo "учёток в слепке: ${#ACCOUNTS[@]}"
    echo "таблиц посчитано: ${#COUNTS[@]}"
} >&2

echo "$SNAPSHOT_FILE"
