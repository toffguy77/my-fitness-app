// Package curatoraccess отвечает на единственный вопрос: есть ли у клиента
// право на работу с куратором.
//
// Право выражается активной связью в curator_client_relationships и её
// предельной датой. Отдельная сущность подписки не заводится: два независимых
// признака права расходятся, и тогда непонятно, какой из них правдив.
//
// Здесь нарочно два разных вопроса, и путать их нельзя:
//
//   - «есть ли право» — спрашивает платный доступ: отправка сообщения,
//     состояние карточки куратора, состав чек-листа. Таких мест немного, и они
//     сверяют и статус, и дату, потому что право обязано кончиться ровно с
//     наступлением дня после предельной даты, а не тогда, когда до строки
//     доберётся задача;
//   - «активна ли связь» — спрашивают десятки существующих запросов о работе
//     куратора с клиентом. Они по-прежнему смотрят только на статус. Задача
//     прекращения приводит статус в соответствие с датой, и они сходятся сами.
//
// Обратное решение — сверять дату в каждом запросе — потребовало бы правки
// каждого места фильтрации по статусу, а забытое место означало бы утечку
// платного доступа, которую никто не заметит.
package curatoraccess

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// Moscow — пояс, по которому кончается последний оплаченный день. Пояс
// объявлен в публичной оферте: не объявленный, он делает момент прекращения
// доступа неизвестным тому, кто заплатил.
const Moscow = "Europe/Moscow"

// Статусы связи, значимые для права. `pending` правом не является.
const (
	StatusActive   = "active"
	StatusInactive = "inactive"
)

// RowQuerier — то общее, что есть у *sql.DB и у *sql.Tx: право проверяется и
// внутри транзакции выдачи, и вне её.
type RowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// State — связь клиента с куратором и срок её действия.
//
// Нулевое значение означает, что куратора у клиента никогда не было, — это не
// то же самое, что истёкшее право, и различать их обязательно: первому нужно
// предложение купить, второму — предложение продлить и доступ к прежней
// переписке.
type State struct {
	CuratorID int64
	Status    string
	// ExpiresAt — последний день действия права. nil означает бессрочное
	// право: так живут служебные учётные записи прогона.
	ExpiresAt *time.Time
}

// Assigned сообщает, закреплён ли за клиентом куратор — хоть бы и с истёкшим
// правом.
func (s State) Assigned() bool { return s.CuratorID != 0 }

// Perpetual сообщает, что право бессрочно.
func (s State) Perpetual() bool { return s.Assigned() && s.ExpiresAt == nil }

// Allowed — есть ли право прямо сейчас.
func (s State) Allowed() bool { return s.AllowedOn(Today()) }

// AllowedOn — есть ли право в указанный день по московскому времени.
//
// Последний день действует целиком: право кончается, когда наступил день
// ПОСЛЕ предельной даты. Ошибка здесь стоит денег тому, кто заплатил.
func (s State) AllowedOn(day time.Time) bool {
	if s.Status != StatusActive {
		return false
	}
	if s.ExpiresAt == nil {
		return true
	}
	return !DateOf(day).After(DateOf(*s.ExpiresAt))
}

// Expired — право было и кончилось. Отличается от отсутствия куратора.
func (s State) Expired() bool { return s.Assigned() && !s.Allowed() }

// Today — текущая дата по московскому времени.
func Today() time.Time { return DateOf(time.Now().In(location())) }

// DateOf отбрасывает время суток и зону: предельная дата — именно дата, у неё
// нет времени суток, и сравнивать её нужно с датой.
func DateOf(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func location() *time.Location {
	loc, err := time.LoadLocation(Moscow)
	if err != nil {
		// Образ прода несёт tzdata; если её нет, UTC отличается от московского
		// времени на три часа в пользу клиента — право проживёт чуть дольше.
		return time.UTC
	}
	return loc
}

// Of возвращает состояние права клиента.
//
// Строк связи у клиента может быть несколько — ограничение уникальности стоит
// на паре куратор-клиент, а не на клиенте. Действующая связь важнее прочих, а
// среди недействующих важнее последняя: именно её куратор вёл человека.
func Of(ctx context.Context, q RowQuerier, clientID int64) (State, error) {
	var (
		state   State
		expires sql.NullTime
	)
	err := q.QueryRowContext(ctx, `
		SELECT curator_id, status, access_expires_at
		  FROM curator_client_relationships
		 WHERE client_id = $1
		 ORDER BY (status = 'active') DESC, updated_at DESC NULLS LAST
		 LIMIT 1`, clientID).Scan(&state.CuratorID, &state.Status, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		return State{}, nil
	}
	if err != nil {
		return State{}, fmt.Errorf("состояние права на куратора: %w", err)
	}
	if expires.Valid {
		day := DateOf(expires.Time)
		state.ExpiresAt = &day
	}
	return state, nil
}

// Allowed — сокращение для мест, которым нужен только ответ «да или нет».
func Allowed(ctx context.Context, q RowQuerier, clientID int64) (bool, error) {
	state, err := Of(ctx, q, clientID)
	if err != nil {
		return false, err
	}
	return state.Allowed(), nil
}
