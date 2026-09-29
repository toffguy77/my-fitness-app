//go:build integration

package database_test

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"testing"

	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/require"
)

// Два свойства схемы, которые снимком не поймать.
//
// Снимок schema.golden фиксирует, какие индексы есть. Он не говорит, нужны ли
// они и не пропущен ли нужный — обновить его можно одной командой, и лишний
// индекс уезжает в него так же тихо, как появился. Эти тесты проверяют не
// состав, а смысл.
//
// Запускать:
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 ./internal/shared/database/

// Внешний ключ без индекса по ссылающейся стороне.
//
// Postgres индексирует только сторону, на которую ссылаются. Без индекса на
// ссылающейся удаление родительской строки читает дочернюю таблицу целиком,
// под блокировкой, — и так на каждый такой ключ. Удаление аккаунта проходит
// по трём десяткам таблиц сразу, поэтому пропущенный индекс стоит там дороже
// всего.
func TestEveryForeignKeyHasALeadingIndex(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "fk_index")

	rows, err := db.QueryContext(context.Background(), `
		SELECT c.conrelid::regclass::text, a.attname, c.confrelid::regclass::text
		FROM pg_constraint c
		JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON k.ord = 1
		JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
		WHERE c.contype = 'f'
		  AND c.connamespace = current_schema()::regnamespace
		  AND NOT EXISTS (
		      SELECT 1 FROM pg_index i
		      WHERE i.indrelid = c.conrelid
		        AND i.indkey[0] = k.attnum
		        -- Частичный индекс засчитывается, только если его условие —
		        -- ровно «колонка IS NOT NULL». Проверка ключа ищет
		        -- «колонка = $1», что это условие влечёт, поэтому такой индекс
		        -- её покрывает; с любым другим предикатом — не покрывает, и
		        -- засчитать его значило бы оставить дыру, выглядящую закрытой.
		        AND (
		            i.indpred IS NULL
		            OR pg_get_expr(i.indpred, i.indrelid) = '(' || a.attname || ' IS NOT NULL)'
		        )
		  )
		ORDER BY 1, 2`)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	var missing []string
	for rows.Next() {
		var child, column, parent string
		require.NoError(t, rows.Scan(&child, &column, &parent))
		missing = append(missing, fmt.Sprintf("  %s.%s -> %s", child, column, parent))
	}
	require.NoError(t, rows.Err())

	require.Empty(t, missing,
		"внешние ключи без индекса по ссылающейся стороне:\n%s\n\n"+
			"Удаление родительской строки прочитает эти таблицы целиком. "+
			"Добавьте индекс по ведущей колонке ключа в миграции.",
		strings.Join(missing, "\n"))
}

// Индекс, который дословно повторяет соседний или является его левым
// префиксом, не ускоряет ни одного чтения, но его обязаны обновить все записи
// в таблицу. Направление сортировки здесь роли не играет: B-tree читается в
// обе стороны, поэтому (user_id, date) и (user_id, date DESC) для планировщика
// один и тот же индекс.
func TestNoIndexIsRedundant(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "idx_redundant")

	// indkey — ведущие колонки индекса. Приведение int2vector::int2[] даёт
	// массив с нулевой базой индексации, и срез [1:n] по нему молча берёт не
	// тот кусок; через string_to_array получается обычный массив с единицы.
	//
	// Частичные и функциональные индексы сравниваются только с такими же по
	// предикату и выражению, иначе «префикс» ничего не значит.
	rows, err := db.QueryContext(context.Background(), `
		WITH idx AS (
		    SELECT i.indrelid::regclass::text AS tbl,
		           i.indexrelid::regclass::text AS name,
		           string_to_array(i.indkey::text, ' ')::int[] AS cols,
		           i.indisunique AS uniq,
		           am.amname AS method,
		           COALESCE(pg_get_expr(i.indpred, i.indrelid), '') AS predicate,
		           COALESCE(pg_get_expr(i.indexprs, i.indrelid), '') AS expression
		    FROM pg_index i
		    JOIN pg_class c ON c.oid = i.indexrelid
		    JOIN pg_am am ON am.oid = c.relam
		    WHERE c.relnamespace = current_schema()::regnamespace
		)
		SELECT a.tbl, a.name, b.name
		FROM idx a
		JOIN idx b
		  ON a.name <> b.name
		 AND a.tbl = b.tbl
		 AND a.method = b.method
		 AND a.predicate = b.predicate
		 AND a.expression = b.expression
		 AND b.cols[1:array_length(a.cols, 1)] = a.cols
		 -- Уникальный индекс несёт ограничение, а не только ускорение:
		 -- он остаётся, даже когда его перекрывает более широкий.
		 AND NOT a.uniq
		 AND (
		      -- Строгий префикс: лишний тот, что уже.
		      array_length(a.cols, 1) < array_length(b.cols, 1)
		      -- Дословный повтор уникального: лишний обычный.
		      OR b.uniq
		      -- Два одинаковых обычных: лишним считается один, не оба.
		      OR a.name > b.name
		 )
		ORDER BY 1, 2`)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	var redundant []string
	for rows.Next() {
		var tbl, name, covering string
		require.NoError(t, rows.Scan(&tbl, &name, &covering))
		redundant = append(redundant, fmt.Sprintf("  %s: %s перекрыт %s", tbl, name, covering))
	}
	require.NoError(t, rows.Err())
	sort.Strings(redundant)

	require.Empty(t, redundant,
		"индексы, не дающие ничего сверх соседнего:\n%s\n\n"+
			"Каждый из них обновляется на любой записи в таблицу и не "+
			"обслуживает ни одного чтения, которое не обслужил бы перекрывающий.",
		strings.Join(redundant, "\n"))
}
