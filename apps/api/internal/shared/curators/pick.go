// Package curators отвечает на единственный вопрос: кому отдать клиента.
package curators

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/burcev/api/internal/shared/testaccounts"
)

// RowQuerier — то общее, что есть у *sql.DB и у *sql.Tx. Выбор годится и
// внутри транзакции (понижение куратора переносит его клиентов одной), и вне
// её (регистрация).
type RowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// LeastLoaded возвращает координатора с наименьшим числом активных клиентов,
// которому можно отдать клиента с адресом clientEmail.
//
// Функция одна на оба места, где клиент обретает куратора: регистрация и
// понижение прежнего куратора. Раньше это были два одинаковых запроса в
// разных пакетах — и когда в первый добавили условия, второй остался прежним:
// понижение куратора по-прежнему раздавало его живых людей служебным учёткам
// и уходящим. Одинаковый запрос в двух местах расходится молча.
//
// Кого не выбираем:
//
//   - служебные учётки прогона — живому человеку. На проде они живут
//     постоянно и всегда пусты, то есть всегда первые в очереди за наименее
//     загруженным. Служебному клиенту служебный куратор, наоборот,
//     единственно возможный: в прогоне других нет;
//   - тех, кто уходит: учётка с запрошенным удалением деактивирована и через
//     30 дней исчезнет;
//   - удалённых;
//   - excludeID, если он не ноль, — того, кого прямо сейчас понижают.
//
// Отсутствие кандидата возвращается как sql.ErrNoRows: решать, отказ это или
// повод записать предупреждение, вызывающему.
func LeastLoaded(ctx context.Context, q RowQuerier, clientEmail string, excludeID int64) (int64, error) {
	var curatorID int64
	err := q.QueryRowContext(ctx, `
		SELECT u.id
		FROM users u
		LEFT JOIN curator_client_relationships ccr
			ON ccr.curator_id = u.id AND ccr.status = 'active'
		WHERE u.role = 'coordinator'
		  AND u.deleted_at IS NULL
		  AND u.deletion_requested_at IS NULL
		  AND ($2 = 0 OR u.id <> $2)
		  AND ($1 OR (
			LOWER(u.email) NOT LIKE '%@burcev.test'
			AND NOT (LOWER(u.email) LIKE 'e2e-%' AND LOWER(u.email) LIKE '%@burcev.team')
		  ))
		GROUP BY u.id
		ORDER BY COUNT(ccr.client_id) ASC
		LIMIT 1
	`, testaccounts.IsTest(clientEmail), excludeID).Scan(&curatorID)
	if err != nil {
		return 0, fmt.Errorf("подобрать куратора: %w", err)
	}
	return curatorID, nil
}
