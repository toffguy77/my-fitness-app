package curatoraccess

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// Expiration — связь, у которой право кончилось.
type Expiration struct {
	ClientID  int64
	CuratorID int64
	ExpiredOn time.Time
}

// Querier — то общее, что нужно прекращению: запрос множества строк.
type Querier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// Expire снимает право у связей, чья предельная дата осталась позади
// указанного дня, и возвращает затронутые пары.
//
// Возвращает именно пары, а не число: о прекращении нужно уведомить и клиента,
// и куратора — куратор, не знающий о прекращении, продолжит работу, за которую
// больше не платят.
//
// Связи без предельной даты не затрагиваются никогда.
func Expire(ctx context.Context, q Querier, day time.Time) ([]Expiration, error) {
	rows, err := q.QueryContext(ctx, `
		UPDATE curator_client_relationships
		   SET status = $1, updated_at = now()
		 WHERE status = $2
		   AND access_expires_at IS NOT NULL
		   AND access_expires_at < $3
		RETURNING client_id, curator_id, access_expires_at`,
		StatusInactive, StatusActive, DateOf(day))
	if err != nil {
		return nil, fmt.Errorf("снять истёкшие права: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var expired []Expiration
	for rows.Next() {
		var e Expiration
		if err := rows.Scan(&e.ClientID, &e.CuratorID, &e.ExpiredOn); err != nil {
			return nil, fmt.Errorf("чтение снятого права: %w", err)
		}
		expired = append(expired, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("обход снятых прав: %w", err)
	}
	return expired, nil
}

// Expiring возвращает связи, право которых кончается ровно через through дней
// от указанного дня, — те, о чьём приближающемся истечении пора предупредить.
//
// Ровно через, а не «не позже чем через»: иначе предупреждение уходило бы
// каждый день до самого конца срока.
func Expiring(ctx context.Context, q Querier, day time.Time, through int) ([]Expiration, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT client_id, curator_id, access_expires_at
		  FROM curator_client_relationships
		 WHERE status = $1
		   AND access_expires_at = $2`,
		StatusActive, DateOf(day).AddDate(0, 0, through))
	if err != nil {
		return nil, fmt.Errorf("права на исходе: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var soon []Expiration
	for rows.Next() {
		var e Expiration
		if err := rows.Scan(&e.ClientID, &e.CuratorID, &e.ExpiredOn); err != nil {
			return nil, fmt.Errorf("чтение права на исходе: %w", err)
		}
		soon = append(soon, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("обход прав на исходе: %w", err)
	}
	return soon, nil
}

// Overdue возвращает число связей, оставшихся активными при истёкшей предельной
// дате.
//
// Истина о праве — статус, а меняет его задача. Значит отказ задачи означает
// бесплатный платный доступ, и узнать о нём иначе нечем: история запусков
// отвечает на вопрос «запускалась ли задача», а не «остался ли кто-то с
// истёкшим правом» — задача может завершиться успешно и пропустить строку.
func Overdue(ctx context.Context, q RowQuerier, day time.Time) (int, error) {
	var count int
	err := q.QueryRowContext(ctx, `
		SELECT COUNT(*)
		  FROM curator_client_relationships
		 WHERE status = $1
		   AND access_expires_at IS NOT NULL
		   AND access_expires_at < $2`, StatusActive, DateOf(day)).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("просроченные права: %w", err)
	}
	return count, nil
}
