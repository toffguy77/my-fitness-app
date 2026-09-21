#!/usr/bin/env bash
#
# Зачистка того, что прогон E2E оставил в рабочей среде.
#
# Что удаляется и почему так
# ---------------------------
# 1. Учётные записи прогона — целиком, вместе со всем, что на них
#    ссылается: дневник, заявки, разговоры, назначения куратора, сессии,
#    ссылки для входа, выгрузки. Адреса берутся из слепка, сколько бы их там
#    ни оказалось: перечень учёток живёт в скрипте слепка, а не здесь.
#
#    Какие таблицы ссылаются на users(id), скрипт спрашивает у САМОЙ схемы
#    (information_schema) в момент запуска — тем же способом, каким это
#    делает `TestErasureCoversSchema` в apps/api/internal/modules/account:
#    для каждой такой колонки строки, ссылающиеся на удаляемые id, сначала
#    удаляются явно, а затем удаляется сама учётная запись. Список НЕ
#    переписан руками с реестра `internal/modules/account/erasure.go` — если
#    бы список просто копировал реестр, ошибка в реестре (забытая таблица)
#    была бы invisible и для удаления, и для проверки после: оба читали бы
#    один и тот же неполный список. Спрашивая схему напрямую, скрипт остаётся
#    верным, даже если реестр в erasure.go однажды разойдётся с ней.
#
#    Реестр erasure.go всё же используется — но только за одним: какие
#    таблицы ПОМЕЧЕНЫ Keep (`leads.handled_by`, `support_messages.operator_id`,
#    агрегаты `curator_daily_snapshots`/`curator_weekly_snapshots` и т.д.) —
#    это сознательное решение оставить чужие данные как есть, и здесь оно
#    уважается. Всё остальное, что ссылается на users(id) — удаляется, вне
#    зависимости от того, как это названо в erasure.go (Delete или Anonymize):
#    обезличивать там некого, учётки одноразовые.
#
# 2. Удаление и проверка каждой такой колонки происходят В ОДНОМ шаге, внутри
#    транзакции, а не «удалить всё — потом сверить». Это не перестраховка: у
#    части этих колонок внешний ключ — SET NULL, а не CASCADE
#    (`support_conversations.user_id`, `analytics_events.user_id`). Если бы
#    проверка ждала COMMIT и потом смотрела на текущее значение колонки, она
#    бы ничего не увидела в ровно том случае, который важно ловить: строку не
#    удалили, а `DELETE FROM users` всё равно прошёл и просто обнулил
#    колонку каскадом — связь с прогоном стёрлась молча, а строка осталась.
#    Захватывать вместо этого первичный ключ строки заранее тоже не вариант:
#    не у каждой таблицы здесь единственная колонка "id" (где-то составной
#    ключ, где-то ключ с другим именем — например, `analytics_identities`
#    ключуется по `visitor_id`). Поэтому проверка — тут же, пока транзакция
#    открыта и ничего ещё не успело переписать колонку: не удалилось —
#    `RAISE EXCEPTION` откатывает всю транзакцию целиком, тем же принципом
#    «всё или ничего», что и при обрыве процесса (см. «Идемпотентность» ниже).
#
# 3. То, что прогон создаёт БЕЗ привязки к трём учёткам: гостевые заявки
#    (`leads`, email по шаблону) — по отметке времени начала (из слепка) и по
#    email-шаблону одновременно. Только по времени нельзя: рядом с прогоном на
#    настоящем проде идёт настоящий трафик, и «удалить всё, что появилось
#    после Т» задело бы живых посетителей.
#
#    Веб-разговоры виджета поддержки (`support_conversations`, channel =
#    'web', без user_id) чистятся ТЕМ ЖЕ принципом, но строже: признаком
#    служит не «гость и в окне» (ровно так же выглядит настоящий анонимный
#    посетитель виджета на живом проде), а привязанная к разговору заявка
#    (`lead_id`), чей email совпал с гостевым шаблоном. Разговор гостя, который
#    так и не оставил контакт, этим скриптом не трогается — надёжного способа
#    отличить его от настоящего анонимного посетителя в данных нет. Это
#    сознательный пробел, а не недосмотр — см. отчёт.
#
# Идемпотентность
# ----------------
# Всё удаление — ОДНА транзакция (BEGIN..COMMIT). Оборвался процесс
# (SIGKILL, авария) до COMMIT — Postgres сам откатывает всё как единое
# целое: базе всё равно, погибнет скрипт на первой строке транзакции или на
# последней, снаружи это неотличимо от «ничего не начиналось». Поэтому
# повторный запуск с тем же слепком — не «доделать», а просто «начать
# заново»: цели ищутся заново (по email, по времени), уже удалённое не
# находится, и все операторы становятся no-op. Это же делает скрипт
# безопасным для повторного запуска после успеха.
#
# Проверка после
# ---------------
# Три линии проверки, не одна, и все — ДО COMMIT, внутри той же транзакции.
# Проверять постфактум, после COMMIT, по значению FK-колонки — уже поздно для
# части из них: SET NULL-колонки к тому моменту могут быть обнулены каскадом
# от `DELETE FROM users`, и живое значение ничего не покажет (см. п. 2 выше).
# Поэтому все три ловят расхождение, пока правда ещё видна:
#   1. по каждой найденной в схеме колонке — сразу после её собственного
#      удаления (п. 2 выше);
#   2. независимым повторным запросом к схеме — прямо перед удалением самих
#      учёток (см. «Независимая подстраховка» в скрипте);
#   3. по самим учёткам и по гостевым заявкам/разговорам по шаблону — в самом
#      конце транзакции.
# Не сошлось хоть где-то — RAISE EXCEPTION откатывает всю транзакцию целиком,
# psql возвращает ненулевой код, и обёртка (`e2e-run-with-cleanup.sh`) обязана
# заявить об этом громко.
#
# Использование:
#   DATABASE_URL=postgres://... scripts/e2e-db-cleanup.sh <путь-к-слепку>
#
# Ничего похожего на пароль, хэш или строку подключения в вывод не идёт —
# только имена таблиц и числа.

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

SNAPSHOT_FILE="${1:?использование: e2e-db-cleanup.sh <путь-к-слепку>}"
[ -f "$SNAPSHOT_FILE" ] || {
    echo "слепок не найден: $SNAPSHOT_FILE" >&2
    exit 1
}
[ -r "$ERASURE_GO" ] || {
    echo "не нашёл реестр таблиц: $ERASURE_GO" >&2
    exit 1
}

WINDOW_START="$(jq -r '.window_start' "$SNAPSHOT_FILE")"
KNOWN_EMAILS_CSV="$(jq -r '.accounts | join(",")' "$SNAPSHOT_FILE")"
GUEST_PATTERNS_CSV="${E2E_GUEST_EMAIL_PATTERNS:-$(jq -r '.guest_patterns | join(",")' "$SNAPSHOT_FILE")}"

if [ -z "$KNOWN_EMAILS_CSV" ] && [ -z "$GUEST_PATTERNS_CSV" ]; then
    echo "в слепке нет ни учёток, ни гостевых шаблонов — нечего чистить" >&2
    exit 1
fi

# psql подставляет :'var' только за пределами долларового квотирования ($$...$$
# в DO-блоках его не видит — там это буквальный текст, и сервер спотыкается на
# ":") — проверено. Поэтому значения подставляются как SQL-литералы уже здесь,
# в bash, а не через `psql -v`.
sql_quote_literal() {
    printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

sql_text_array() {
    local csv="$1" out="ARRAY[" first=1 item
    IFS=',' read -r -a _items <<<"$csv"
    for item in "${_items[@]}"; do
        [ -z "$item" ] && continue
        if [ "$first" -eq 1 ]; then first=0; else out+=","; fi
        out+="$(sql_quote_literal "$item")"
    done
    out+="]::text[]"
    printf '%s' "$out"
}

WINDOW_START_SQL="$(sql_quote_literal "$WINDOW_START")::timestamptz"
KNOWN_EMAILS_ARRAY_SQL="$(sql_text_array "$KNOWN_EMAILS_CSV")"
GUEST_PATTERNS_ARRAY_SQL="$(sql_text_array "$GUEST_PATTERNS_CSV")"

# --- реестр erasure.go: только чтобы знать, что помечено Keep ---------------
mapfile -t STRATEGY_ROWS < <(
    grep -E '^\s*\{Table: "' "$ERASURE_GO" |
        sed -E 's/.*Table: "([^"]*)".*Column: "([^"]*)".*Strategy: (Strategy[A-Za-z]+).*/\1|\2|\3/'
)

is_keep_pair() {
    local table="$1" col="$2" row t c s
    for row in "${STRATEGY_ROWS[@]}"; do
        IFS='|' read -r t c s <<<"$row"
        if [ "$t" = "$table" ] && [ "$c" = "$col" ] && [ "$s" = "StrategyKeep" ]; then
            return 0
        fi
    done
    return 1
}

# --- какие колонки ссылаются на users(id) — спрашиваем саму схему, не реестр,
# так расхождение реестра со схемой не может тихо выключить ни удаление, ни
# проверку. Тот же запрос, что и в TestErasureCoversSchema (Go), только по
# сети через psql, а не в тесте.
mapfile -t FK_ROWS < <(
    psql "$DATABASE_URL" -Atq -F'|' -c "
      SELECT DISTINCT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'users'
        AND tc.table_schema = 'public'
        AND tc.table_name <> 'users'
      ORDER BY 1, 2;"
)

TARGET_PAIRS=()
for row in "${FK_ROWS[@]}"; do
    [ -z "$row" ] && continue
    IFS='|' read -r table col <<<"$row"
    if is_keep_pair "$table" "$col"; then
        continue # сознательно оставляем — см. Reason в erasure.go
    fi
    TARGET_PAIRS+=("${table}:${col}")
done

# Для независимой подстраховки внутри транзакции (см. ниже): список того, что
# сознательно пропускается, в виде SQL-массива "table:col".
KEEP_PAIRS_LIST=()
for row in "${STRATEGY_ROWS[@]}"; do
    IFS='|' read -r t c s <<<"$row"
    [ -z "$c" ] && continue
    [ "$s" = "StrategyKeep" ] || continue
    KEEP_PAIRS_LIST+=("${t}:${c}")
done
KEEP_PAIRS_ARRAY_SQL="$(sql_text_array "$(
    IFS=,
    echo "${KEEP_PAIRS_LIST[*]}"
)")"

SQL_FILE="$(mktemp -t e2e-db-cleanup.XXXXXX.sql)"
trap 'rm -f "$SQL_FILE"' EXIT

{
    echo '\set ON_ERROR_STOP on'
    echo
    echo 'CREATE TEMP TABLE e2e_cleanup_report (item text, rows_affected bigint);'
    echo
    cat <<'EOCOMMENT'
-- Цели по трём учёткам прогона: точное совпадение email из слепка,
-- плюс всё, что похоже на клиента, заведённого прогоном (registration.spec.ts
-- и другие спеки создают одноразовых клиентов на @burcev.test) — по времени
-- И по шаблону одновременно, чтобы не задеть параллельный настоящий трафик.
EOCOMMENT
    cat <<EOF
CREATE TEMP TABLE e2e_target_ids AS
SELECT id FROM users WHERE email = ANY(${KNOWN_EMAILS_ARRAY_SQL})
UNION
SELECT id FROM users
 WHERE created_at >= ${WINDOW_START_SQL}
   AND email LIKE ANY(${GUEST_PATTERNS_ARRAY_SQL});

EOF

    cat <<'EOCOMMENT'
-- Захватывается ДО удаления: у support_conversations.lead_id стоит
-- ON DELETE SET NULL, и если заявку удалить раньше, связь с ней потеряется
-- прежде, чем проверка после зачистки успеет её увидеть. Список id
-- зафиксирован один раз здесь и используется и для удаления, и для сверки.
EOCOMMENT
    cat <<EOF
CREATE TEMP TABLE e2e_target_conversation_ids AS
SELECT sc.id
FROM support_conversations sc
JOIN leads l ON l.id = sc.lead_id
WHERE sc.channel = 'web'
  AND sc.user_id IS NULL
  AND sc.created_at >= ${WINDOW_START_SQL}
  AND l.created_at >= ${WINDOW_START_SQL}
  AND l.email LIKE ANY(${GUEST_PATTERNS_ARRAY_SQL});

BEGIN;

EOF

    for pair in "${TARGET_PAIRS[@]}"; do
        table="${pair%%:*}"
        col="${pair##*:}"
        cat <<EOF
-- Удаление и проверка — в ОДНОМ PL/pgSQL-блоке, пока транзакция ещё открыта
-- и ничто другое (например, каскадный SET NULL от DELETE FROM users ниже)
-- не успело переписать колонку. Проверять после COMMIT по значению этой же
-- колонки было бы поздно и небезопасно: часть таких колонок (например,
-- support_conversations.user_id, analytics_events.user_id) — SET NULL, а не
-- CASCADE, и после каскада строка осталась бы в базе с уже обнулённой
-- колонкой — молча, мимо любой проверки по значению колонки постфактум.
-- Захватывать вместо этого первичный ключ строки заранее тоже не вариант:
-- не у каждой таблицы здесь единственный столбец "id" (у некоторых составной
-- ключ или ключ с другим именем) — а проверка прямо здесь этого не требует.
-- Если что-то не удалилось — RAISE EXCEPTION откатывает ВСЮ транзакцию
-- целиком: это тот же принцип «всё или ничего», что и при обрыве процесса.
DO \$\$
DECLARE
  affected bigint;
  leftover bigint;
BEGIN
  DELETE FROM ${table} WHERE ${col} IN (SELECT id FROM e2e_target_ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    INSERT INTO e2e_cleanup_report VALUES ('${table}.${col}', affected);
  END IF;

  SELECT COUNT(*) INTO leftover FROM ${table} WHERE ${col} IN (SELECT id FROM e2e_target_ids);
  IF leftover > 0 THEN
    RAISE EXCEPTION 'ЗАЧИСТКА НЕ ПОЛНАЯ: % строк(и) в ${table}.${col} не удалены', leftover;
  END IF;
END \$\$;
EOF
    done

    cat <<EOF
-- Независимая подстраховка, ДО удаления самих учёток (то есть пока живо всё,
-- что каскад/SET NULL от DELETE FROM users ниже мог бы переписать). Список
-- TARGET_PAIRS выше собран в bash одним конкретным запросом к
-- information_schema. Если этот запрос однажды сломать (например, случайно
-- исключить таблицу при правке) — колонка выпадет и из удаления, и из
-- построчной проверки, что шла вместе с ним, и обе они этого не заметят: им
-- нечего сравнивать, если цель никогда не попадала в список. Поэтому здесь
-- схема спрашивается ЕЩЁ РАЗ, заново, независимым запросом — если он не
-- сломан тем же способом, он увидит то, что упустил первый. Проверять это
-- уже ПОСЛЕ COMMIT нельзя: колонка к тому времени может быть уже обнулена
-- каскадом (SET NULL), и живое значение ничего не покажет — поэтому это
-- здесь, внутри той же транзакции: не сошлось — RAISE EXCEPTION откатывает
-- всё целиком.
DO \$\$
DECLARE
  r RECORD;
  leftover bigint;
  keep_pairs text[] := ${KEEP_PAIRS_ARRAY_SQL};
BEGIN
  FOR r IN
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'users'
      AND tc.table_schema = 'public'
      AND tc.table_name <> 'users'
  LOOP
    IF (r.table_name || ':' || r.column_name) = ANY(keep_pairs) THEN
      CONTINUE; -- сознательно оставляем, как и выше
    END IF;
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE %I IN (SELECT id FROM e2e_target_ids)',
                    r.table_name, r.column_name) INTO leftover;
    IF leftover > 0 THEN
      RAISE EXCEPTION 'ЗАЧИСТКА НЕ ПОЛНАЯ (независимая проверка): % строк(и) в %.% не удалены — таблица не была учтена основным проходом', leftover, r.table_name, r.column_name;
    END IF;
  END LOOP;
END \$\$;

-- Сами учётки.
DO \$\$
DECLARE
  affected bigint;
BEGIN
  DELETE FROM users WHERE id IN (SELECT id FROM e2e_target_ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    INSERT INTO e2e_cleanup_report VALUES ('users', affected);
  END IF;
END \$\$;

EOF

    cat <<EOF
-- Веб-разговоры виджета без пользователя (гость): у них нет user_id, поэтому
-- не входят в TARGET_PAIRS выше. Безопасный признак «это разговор прогона» —
-- только один: к разговору привязана заявка (lead_id), оставленная гостем, и
-- у этой заявки email по гостевому шаблону. Просто «веб-разговор без
-- пользователя в этом окне» — НЕ признак: ровно так же выглядит настоящий
-- анонимный посетитель на живом проде. Порядок здесь важен: сперва разговор
-- (пока lead_id ещё жив), потом сама заявка — у lead_id ON DELETE SET NULL.
DO \$\$
DECLARE
  affected bigint;
BEGIN
  DELETE FROM support_conversations WHERE id IN (SELECT id FROM e2e_target_conversation_ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    INSERT INTO e2e_cleanup_report VALUES ('support_conversations (веб-гости)', affected);
  END IF;
END \$\$;

DO \$\$
DECLARE
  affected bigint;
BEGIN
  DELETE FROM leads
   WHERE created_at >= ${WINDOW_START_SQL}
     AND email LIKE ANY(${GUEST_PATTERNS_ARRAY_SQL});
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    INSERT INTO e2e_cleanup_report VALUES ('leads (гостевые)', affected);
  END IF;
END \$\$;

COMMIT;

-- Фактический вывод: что и сколько удалено в этом запуске (0 строк — если
-- запускали повторно после успеха, это и есть идемпотентность).
\echo '--- удалено в этом запуске ---'
SELECT item, rows_affected FROM e2e_cleanup_report ORDER BY item;

EOF

    cat <<EOF
-- Колонки из TARGET_PAIRS уже сверены построчно ВНУТРИ транзакции (см. выше)
-- — если бы там что-то не удалилось, транзакция откатилась бы целиком и до
-- этой строки скрипт бы не дошёл. Здесь — финальное подтверждение по тому,
-- что проверяется независимо от списка колонок: сами учётки и гостевые
-- заявки/разговоры.
DO \$\$
DECLARE
  leftover bigint;
BEGIN
  SELECT COUNT(*) INTO leftover FROM users WHERE id IN (SELECT id FROM e2e_target_ids);
  IF leftover > 0 THEN
    RAISE EXCEPTION 'ЗАЧИСТКА НЕ ПОЛНАЯ: % учётных записей прогона не удалены', leftover;
  END IF;

  SELECT COUNT(*) INTO leftover FROM leads
   WHERE created_at >= ${WINDOW_START_SQL}
     AND email LIKE ANY(${GUEST_PATTERNS_ARRAY_SQL});
  IF leftover > 0 THEN
    RAISE EXCEPTION 'ЗАЧИСТКА НЕ ПОЛНАЯ: % гостевых заявок(и) прогона всё ещё в базе', leftover;
  END IF;

  SELECT COUNT(*) INTO leftover FROM support_conversations
   WHERE id IN (SELECT id FROM e2e_target_conversation_ids);
  IF leftover > 0 THEN
    RAISE EXCEPTION 'ЗАЧИСТКА НЕ ПОЛНАЯ: % веб-разговор(ов) виджета прогона всё ещё в базе', leftover;
  END IF;
END \$\$;

\echo '--- проверка после зачистки: расхождений не найдено ---'
EOF
} >"$SQL_FILE"

set +e
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
STATUS=$?
set -e

if [ "$STATUS" -ne 0 ]; then
    echo "!!! ЗАЧИСТКА НЕ ЗАВЕРШЕНА ЧИСТО — см. вывод psql выше, база требует ручной проверки !!!" >&2
fi

# --- информационное сравнение с "до" (вторично: реальный параллельный трафик
# на проде может законно изменить общие числа; авторитетна только проверка
# выше, привязанная к конкретным id и шаблонам) --------------------------------
if command -v jq >/dev/null 2>&1; then
    echo "--- для справки: числа "до" из слепка (не авторитетно на проде при параллельном трафике) ---" >&2
    jq -r '.counts_before | to_entries[] | "\(.key)=\(.value)"' "$SNAPSHOT_FILE" >&2
fi

exit "$STATUS"
