#!/usr/bin/env bash
#
# Выполняет читающий SQL к базе приложения.
#
#   ./db.sh "SELECT count(*) FROM analytics_events"
#   ./db.sh -f запрос.sql
#   BURCEV_DB_ENV=prod ./db.sh "..."
#
# По умолчанию — база dev: на ней проверяют сам запрос. Настоящие числа живут
# на проде, туда нужно просить явно.
#
# ## Почему только чтение и как оно обеспечено
#
# Сессия открывается с `default_transaction_read_only=on`. Это ограничение
# самого Postgres: любая запись отклоняется сервером, чем бы её ни выразили.
# Проверка по ключевым словам ниже тоже есть, но она — вежливое сообщение
# заранее, а не граница безопасности: список слов обходится `MERGE`,
# `DO $$ ... $$`, `CALL` и десятком других способов, и полагаться на него
# нельзя.
#
# ## Почему прод считается через SSH, а не отсюда
#
# Учётные данные прод-базы лежат только в окружении Dokploy, а его API отвечает
# по **http**. Забирать оттуда пароль базы значит гонять его по сети открытым.
# Поэтому на проде psql запускается на самом сервере: параметры берутся из уже
# работающего контейнера и машину не покидают, а наружу идёт только результат
# запроса — внутри SSH.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ENV_NAME="${BURCEV_DB_ENV:-dev}"
PG_IMAGE="postgres:18-alpine"

# Та же мажорная версия, что в Yandex Cloud: на другой psql иначе печатает
# ограничения, и сравнение схем показывает расхождения, которых нет.

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

# Ранняя подсказка, чтобы не идти в базу за предсказуемым отказом. Настоящую
# защиту даёт read-only транзакция ниже.
if printf '%s' "$SQL" | grep -iqE '\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy|merge|call|do)\b'; then
    echo "Похоже, запрос меняет данные. Этот скрипт только читает." >&2
    echo "Если слово попало случайно — переформулируйте; сервер всё равно откажет." >&2
    exit 1
fi

ERR="$(mktemp)"
trap 'rm -f "$ERR"' EXIT

# -c вместо интерактива, ON_ERROR_STOP чтобы молчаливых полуответов не было.
PSQL_ARGS=(-v ON_ERROR_STOP=1 --pset=pager=off)

if [[ "$ENV_NAME" == "prod" ]]; then
    # Всё происходит на сервере: и чтение настроек, и запрос. Пароль не
    # покидает хост, по SSH идёт только текст запроса и результат.
    #
    # --env-file с файлом на 600, а не -e в аргументах: значение не попадает в
    # список процессов сервера. Файл живёт секунды и снимается по выходу.
    ssh -o BatchMode=yes dokploy "
        set -euo pipefail
        env_file=\$(mktemp); chmod 600 \"\$env_file\"
        trap 'rm -f \"\$env_file\"' EXIT
        api=\$(sudo docker ps --format '{{.Names}}' | grep -- '-api-1' | grep -v mdmsg0 | head -1)
        [ -n \"\$api\" ] || { echo 'не нашёлся контейнер api прода' >&2; exit 1; }
        sudo docker exec \"\$api\" printenv \
            | grep -E '^DB_(HOST|PORT|USER|PASSWORD|NAME|SSL_MODE)=' > \"\$env_file\"
        sudo docker run --rm -i --env-file \"\$env_file\" \
            -e PGOPTIONS='-c default_transaction_read_only=on' \
            $PG_IMAGE sh -c '
                # psql читает PGPASSWORD и PGSSLMODE, а контейнер получил
                # DB_*: переименовываем внутри, чтобы наружу ничего не
                # выносить. Кластер требует SSL и без sslmode отказывает.
                export PGPASSWORD=\"\$DB_PASSWORD\" PGSSLMODE=\"\${DB_SSL_MODE:-require}\"
                psql -h \"\${DB_HOST%%,*}\" -p \"\$DB_PORT\" -U \"\$DB_USER\" -d \"\$DB_NAME\" \
                     -v ON_ERROR_STOP=1 --pset=pager=off -f -
            '
    " <<<"$SQL" 2>"$ERR" && exit 0
else
    [[ -f "$REPO/apps/api/.env" ]] || { echo "Нет $REPO/apps/api/.env" >&2; exit 1; }
    get() { grep -m1 "^$1=" "$REPO/apps/api/.env" | cut -d= -f2- | tr -d '\r'; }

    # Экспортом, а не аргументом -e: значение в argv видно в списке процессов
    # любому на машине.
    export PGPASSWORD; PGPASSWORD="$(get DB_PASSWORD)"
    export PGOPTIONS='-c default_transaction_read_only=on'

    DB_HOST_RAW="$(get DB_HOST)"; DB_PORT="$(get DB_PORT)"
    DB_USER="$(get DB_USER)";     DB_NAME="$(get DB_NAME)"

    # Хостов два — основной и реплика. Роли меняются после переключения,
    # поэтому порядок ничего не гарантирует: берём первый ответивший.
    for HOST in $(printf '%s' "$DB_HOST_RAW" | tr ',' ' '); do
        if docker run --rm -i --env PGPASSWORD --env PGOPTIONS "$PG_IMAGE" \
            psql -h "$HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            "${PSQL_ARGS[@]}" -f - <<<"$SQL" 2>"$ERR"; then
            exit 0
        fi
        # Отказ доступа или синтаксиса повторится и на втором хосте.
        grep -qiE 'authentication|syntax|does not exist|permission|read-only' "$ERR" && break
    done
fi

echo "Запрос не выполнен ($ENV_NAME):" >&2
cat "$ERR" >&2
exit 1
