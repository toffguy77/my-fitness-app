#!/usr/bin/env bash
#
# Выполняет SQL к базе приложения и печатает результат.
#
# psql на машине не установлен, зато есть Docker: контейнер с клиентом той же
# мажорной версии, что и база в Yandex Cloud, избавляет от установки и от
# расхождений в выводе.
#
# Учётные данные берутся из apps/api/.env — того же файла, которым пользуется
# локальный стенд. Он смотрит в базу **dev**, и это верно для проверки самого
# запроса. Для настоящих цифр нужен прод: BURCEV_DB_ENV=prod, и тогда
# параметры читаются из окружения Dokploy.
#
#   ./db.sh "SELECT count(*) FROM analytics_events"
#   ./db.sh -f запрос.sql
#   BURCEV_DB_ENV=prod ./db.sh "..."
#
# Только чтение: запрос, меняющий данные, отклоняется. Аналитика не должна
# уметь испортить то, что измеряет.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ENV_NAME="${BURCEV_DB_ENV:-dev}"

if [[ $# -eq 0 ]]; then
    echo "Использование: $0 \"SQL\"  |  $0 -f файл.sql" >&2
    exit 2
fi

if [[ "$1" == "-f" ]]; then
    [[ -f "${2:-}" ]] || { echo "Нет такого файла: ${2:-}" >&2; exit 2; }
    SQL="$(cat "$2")"
else
    SQL="$1"
fi

# Отклоняем всё, кроме чтения. Проверка грубая и намеренно строгая: пропустить
# лишнее здесь дороже, чем переписать запрос.
if printf '%s' "$SQL" | grep -iqE '\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy)\b'; then
    echo "Отказ: запрос меняет данные. Этот скрипт только читает." >&2
    exit 1
fi

if [[ "$ENV_NAME" == "prod" ]]; then
    KEY="$(grep -oP '(?<=\*\*API Key\*\*: `)[^`]+' "$REPO/.claude/CLAUDE.local.md")"
    ENV_BLOB="$(curl -fsS -H "x-api-key: $KEY" \
        "http://5.178.3.32:3000/api/trpc/compose.one?input=%7B%22json%22%3A%7B%22composeId%22%3A%22BUHm2MytH3YwSdnhEhfP4%22%7D%7D" \
        | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["data"]["json"]["env"])')"
    get() { printf '%s\n' "$ENV_BLOB" | grep -m1 "^$1=" | cut -d= -f2-; }
else
    [[ -f "$REPO/apps/api/.env" ]] || { echo "Нет $REPO/apps/api/.env" >&2; exit 1; }
    get() { grep -m1 "^$1=" "$REPO/apps/api/.env" | cut -d= -f2- | tr -d '\r'; }
fi

DB_HOST_RAW="$(get DB_HOST)"
DB_PORT="$(get DB_PORT)"
DB_USER="$(get DB_USER)"
DB_PASSWORD="$(get DB_PASSWORD)"
DB_NAME="$(get DB_NAME)"

# Хостов в конфигурации два: кластер из основного и реплики. Для чтения годится
# любой, но роли меняются после переключения, поэтому не полагаемся на порядок
# и просто берём первый достижимый.
for HOST in $(printf '%s' "$DB_HOST_RAW" | tr ',' ' '); do
    if docker run --rm -e PGPASSWORD="$DB_PASSWORD" postgres:18-alpine \
        psql -h "$HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 --pset=pager=off -c "$SQL" 2>/tmp/burcev-db-err; then
        exit 0
    fi
    LAST_ERR="$(cat /tmp/burcev-db-err)"
    # Отказ авторизации или синтаксиса на втором хосте повторится — не пробуем.
    if printf '%s' "$LAST_ERR" | grep -qiE 'authentication|syntax|does not exist|permission'; then
        break
    fi
done

echo "Запрос не выполнен ($ENV_NAME):" >&2
printf '%s\n' "${LAST_ERR:-хост недостижим}" >&2
exit 1
