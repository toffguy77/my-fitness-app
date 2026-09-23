package testaccounts

import (
	"context"
	"database/sql"
	"fmt"
)

// ServingRealClients возвращает служебных кураторов, за которыми сейчас
// числятся живые клиенты, и число таких клиентов у каждого.
//
// Не «служебная учётка с ролью»: такие на проде живут по решению владельца,
// прогон без них невозможен, и предупреждение о них кричало бы при каждом
// запуске — то есть не читалось бы вовсе. Вред начинается не с роли, а с
// живого человека, закреплённого за учёткой, которая никогда не ответит.
//
// Назначение такую пару больше не создаёт, но создать её можно иначе:
// правкой в базе, переносом клиента куратором, строкой, оставшейся с
// прежних времён. Поэтому смотрим на то, что в таблице на самом деле,
// а не на то, что должен был сделать код.
//
// Служебный клиент у служебного куратора — норма прогона и в счёт не идёт.
func ServingRealClients(ctx context.Context, db *sql.DB) (map[string]int, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT u.email, c.email
		  FROM curator_client_relationships r
		  JOIN users u ON u.id = r.curator_id
		  JOIN users c ON c.id = r.client_id
		 WHERE r.status = 'active'
		   AND u.deleted_at IS NULL
		   AND c.deleted_at IS NULL`)
	if err != nil {
		return nil, fmt.Errorf("связки кураторов и клиентов: %w", err)
	}
	defer func() { _ = rows.Close() }()

	found := map[string]int{}
	for rows.Next() {
		var curator, client string
		if err := rows.Scan(&curator, &client); err != nil {
			return nil, fmt.Errorf("чтение связки: %w", err)
		}
		if IsTest(curator) && !IsTest(client) {
			found[curator]++
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("обход связок: %w", err)
	}
	return found, nil
}
