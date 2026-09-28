package leads

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/burcev/api/internal/shared/apperrors"
)

// Точки, из которых зарегистрированный человек просит куратора.
//
// Перечислены, а не свободны: очередь заявок группируется по этому полю, и
// опечатка дала бы строку, которой не соответствует ни один отчёт.
const (
	CaptureCuratorOfferChat      = "curator_offer_chat"
	CaptureCuratorOfferDashboard = "curator_offer_dashboard"
)

// ErrUnknownCaptureSource: точка захвата не из перечисленных.
var ErrUnknownCaptureSource = fmt.Errorf("unknown capture source: %w", apperrors.ErrValidation)

// CreateCuratorRequest заводит заявку на куратора от зарегистрированного
// человека.
//
// Заявка попадает в ту же очередь, что и заявки гостей: у оператора должно быть
// одно место, куда он смотрит. Отдельный путь обработки означал бы второе
// место, о котором однажды забудут.
//
// Адрес и имя берутся из учётной записи, а не из тела запроса: человек уже
// вошёл, и спрашивать у него адрес заново — предлагать опечатку.
//
// Согласия: на обработку данных и на связь — да, и вот почему это не подлог.
// Заявка не несёт данных о здоровье вовсе (параметры остаются пустыми), а само
// нажатие кнопки «оставить заявку» и есть просьба связаться. Основанием для
// хранения адреса служит уже существующая учётная запись.
//
// Повторная заявка обновляет необработанную, а не заводит вторую: человек,
// нажавший дважды, не два человека, а очередь с дубликатами перестаёт читаться.
// Сделано поиском, а не ON CONFLICT: уникального индекса по адресу у таблицы
// нет и быть не должно — гостя захватывают и по нескольку раз. Одновременные
// нажатия в теории дадут две строки; оператор увидит две одинаковые заявки, и
// это безобиднее блокировки на горячем пути.
func (s *Service) CreateCuratorRequest(ctx context.Context, userID int64, captureSource string) (*Lead, error) {
	switch captureSource {
	case CaptureCuratorOfferChat, CaptureCuratorOfferDashboard:
	default:
		return nil, ErrUnknownCaptureSource
	}

	var (
		email string
		name  sql.NullString
	)
	err := s.db.QueryRowContext(ctx,
		`SELECT email, name FROM users WHERE id = $1 AND deleted_at IS NULL`, userID).Scan(&email, &name)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("заявка на куратора: %w", apperrors.ErrNotFound)
	}
	if err != nil {
		return nil, fmt.Errorf("учётная запись для заявки на куратора: %w", err)
	}
	email = strings.ToLower(strings.TrimSpace(email))

	lead := &Lead{Email: email, Name: name.String, LastStep: "curator_request", Source: "product"}

	err = s.db.QueryRowContext(ctx, `
		UPDATE leads
		   SET capture_source = $2, last_step = 'curator_request', contact_consent = true,
		       updated_at = now()
		 WHERE email = $1 AND handled_at IS NULL
		RETURNING id, created_at, updated_at`,
		email, captureSource,
	).Scan(&lead.ID, &lead.CreatedAt, &lead.UpdatedAt)
	switch {
	case err == nil:
		s.log.Infow("Curator request updated an open lead",
			"user_id", userID, "lead_id", lead.ID, "capture_source", captureSource)
		return lead, nil
	case !errors.Is(err, sql.ErrNoRows):
		return nil, fmt.Errorf("обновить заявку на куратора: %w", err)
	}

	err = s.db.QueryRowContext(ctx, `
		INSERT INTO leads (email, name, last_step, source, data_consent, contact_consent, capture_source)
		VALUES ($1, $2, 'curator_request', 'product', true, true, $3)
		RETURNING id, created_at, updated_at`,
		email, nullIfEmpty(name.String), captureSource,
	).Scan(&lead.ID, &lead.CreatedAt, &lead.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("сохранить заявку на куратора: %w", err)
	}

	s.log.Infow("Curator request saved", "user_id", userID, "capture_source", captureSource)
	return lead, nil
}
