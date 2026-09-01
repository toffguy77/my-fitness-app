package analytics

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"database/sql"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
)

// Retention bounds how long raw events are kept. Long enough for a cohort to
// mature, short enough that the table does not become the largest thing in the
// database.
const Retention = 180 * 24 * time.Hour

// MaxBatch bounds one request. A browser that has been offline sends what it
// accumulated; a client that sends more than this is not a browser.
const MaxBatch = 50

// Event is one thing that happened.
type Event struct {
	Name       string         `json:"name"`
	OccurredAt *time.Time     `json:"occurred_at,omitempty"`
	Properties map[string]any `json:"properties,omitempty"`
}

// Batch is what a browser sends.
type Batch struct {
	VisitorID  string  `json:"visitor_id" binding:"required,uuid"`
	Platform   string  `json:"platform"`
	AppVersion string  `json:"app_version"`
	Events     []Event `json:"events" binding:"required"`
}

// Service stores events and links visitors to accounts.
type Service struct {
	db  *sql.DB
	log *logger.Logger
}

// NewService creates the service.
func NewService(db *sql.DB, log *logger.Logger) *Service {
	return &Service{db: db, log: log}
}

// Validate checks one event against the dictionary.
//
// Refusing an unknown name is the point: free-form names become a heap of typos
// and synonyms within a month, and extending the dictionary is a deliberate act.
func Validate(event Event, fromClient bool) error {
	definition, known := Dictionary[event.Name]
	if !known {
		return fmt.Errorf("unknown event %q: %w", event.Name, apperrors.ErrValidation)
	}
	if fromClient && definition.ServerOnly {
		// A browser claiming "registered" is either broken or lying; the fact
		// comes from where it happened.
		return fmt.Errorf("event %q is server-only: %w", event.Name, apperrors.ErrValidation)
	}

	allowed := make(map[string]struct{}, len(definition.Required)+len(definition.Optional))
	for _, property := range definition.Required {
		allowed[property] = struct{}{}
	}
	for _, property := range definition.Optional {
		allowed[property] = struct{}{}
	}

	for property := range event.Properties {
		if IsForbidden(property) {
			return fmt.Errorf("property %q may never be sent: %w", property, apperrors.ErrValidation)
		}
		if _, ok := allowed[property]; !ok {
			return fmt.Errorf("property %q is not declared for %q: %w",
				property, event.Name, apperrors.ErrValidation)
		}
	}

	for _, property := range definition.Required {
		if _, present := event.Properties[property]; !present {
			return fmt.Errorf("event %q requires %q: %w",
				event.Name, property, apperrors.ErrValidation)
		}
	}

	return nil
}

// Record stores a batch from a browser.
func (s *Service) Record(ctx context.Context, batch Batch, userID *int64) error {
	if len(batch.Events) == 0 {
		return nil
	}
	if len(batch.Events) > MaxBatch {
		return fmt.Errorf("batch of %d exceeds %d: %w", len(batch.Events), MaxBatch, apperrors.ErrValidation)
	}

	for _, event := range batch.Events {
		if err := Validate(event, true); err != nil {
			return err
		}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin analytics batch: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	for _, event := range batch.Events {
		if err := insertEvent(ctx, tx, event, batch, userID); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// RecordServerEvent stores a fact, from the place it happened.
//
// Best effort by design: analytics must never be the reason a registration or a
// report fails, so the caller logs and carries on.
func (s *Service) RecordServerEvent(ctx context.Context, name string, userID int64, properties map[string]any) {
	event := Event{Name: name, Properties: properties}
	if err := Validate(event, false); err != nil {
		s.log.Error("Refused a server analytics event", "error", err, "event", name)
		return
	}

	payload, err := json.Marshal(properties)
	if err != nil {
		s.log.Error("Failed to encode analytics properties", "error", err, "event", name)
		return
	}
	if properties == nil {
		payload = []byte("{}")
	}

	// The visitor identifier of a server event is the account's own: there is
	// no browser behind it, and the reports join on user_id anyway.
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO analytics_events (name, visitor_id, user_id, platform, properties)
		VALUES ($1, COALESCE((SELECT visitor_id FROM analytics_identities WHERE user_id = $2 LIMIT 1),
		                     gen_random_uuid()), $2, 'server', $3::jsonb)`,
		name, userID, string(payload)); err != nil {
		s.log.Error("Failed to record server analytics event", "error", err, "event", name)
	}
}

// LinkVisitor ties a browser to the account it produced.
//
// Without this the funnel breaks exactly where it is most interesting: at the
// point an anonymous visitor becomes a user.
func (s *Service) LinkVisitor(ctx context.Context, visitorID string, userID int64) error {
	if visitorID == "" {
		return nil
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO analytics_identities (visitor_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT (visitor_id) DO UPDATE SET user_id = EXCLUDED.user_id, linked_at = NOW()`,
		visitorID, userID); err != nil {
		return fmt.Errorf("link visitor: %w", err)
	}

	// Everything this browser did before registering belongs to the same
	// person as everything it does after.
	if _, err := s.db.ExecContext(ctx,
		`UPDATE analytics_events SET user_id = $2 WHERE visitor_id = $1 AND user_id IS NULL`,
		visitorID, userID); err != nil {
		return fmt.Errorf("attribute earlier events: %w", err)
	}

	return nil
}

// PurgeExpired drops events past the retention period.
func (s *Service) PurgeExpired(ctx context.Context) (int, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM analytics_events WHERE occurred_at <= NOW() - $1::interval`,
		fmt.Sprintf("%d seconds", int(Retention.Seconds())))
	if err != nil {
		return 0, fmt.Errorf("purge analytics events: %w", err)
	}
	affected, _ := result.RowsAffected()
	return int(affected), nil
}

func insertEvent(ctx context.Context, tx *sql.Tx, event Event, batch Batch, userID *int64) error {
	properties := event.Properties
	if properties == nil {
		properties = map[string]any{}
	}
	payload, err := json.Marshal(properties)
	if err != nil {
		return fmt.Errorf("encode analytics properties: %w", err)
	}

	occurredAt := time.Now()
	if event.OccurredAt != nil {
		occurredAt = *event.OccurredAt
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO analytics_events
			(name, occurred_at, visitor_id, user_id, platform, app_version, properties)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), $7::jsonb)`,
		event.Name, occurredAt, batch.VisitorID, userID,
		batch.Platform, batch.AppVersion, string(payload)); err != nil {
		return fmt.Errorf("record analytics event: %w", err)
	}
	return nil
}
