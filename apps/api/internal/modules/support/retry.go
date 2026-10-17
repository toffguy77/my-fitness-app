package support

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
)

// ErrDeliveryFailed: Telegram did not accept the message. It is a failure of
// the transport, not of this service, and the handler answers it with 502 —
// unlike a database error, which stays 500.
var ErrDeliveryFailed = errors.New("telegram did not accept the message")

// RetryDelivery sends an undelivered outgoing message again.
//
// Answers are written before they are sent, so a refused send leaves the text
// in the thread without a delivery mark. Retrying resends that same text to the
// same chat and, on success, sets the mark on the same row: a second row would
// show the person the answer twice in the operator's thread and once — or
// never — in Telegram.
//
// Refused with ErrConflict where a retry has no meaning: an incoming message
// (there is nowhere to deliver it), one already delivered (the person would
// get it twice), and a web conversation (the visitor fetches answers with
// their own token; there is no transport that could have refused).
func (s *Service) RetryDelivery(ctx context.Context, conversationID, messageID string) (*Message, error) {
	conversation, err := s.byID(ctx, conversationID)
	if err != nil {
		return nil, err
	}
	if conversation.Channel == ChannelWeb {
		return nil, fmt.Errorf("web conversations have no delivery to retry: %w", apperrors.ErrConflict)
	}

	// Строка держится заблокированной до конца попытки: два оператора, нажавшие
	// «Повторить» одновременно, иначе оба прошли бы проверку delivered_at и
	// человек получил бы ответ дважды. Второй дождётся первого и увидит отметку.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin retry: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var m Message
	var deliveredAt sql.NullTime
	var unknown bool
	err = tx.QueryRowContext(ctx, `
		SELECT id, author, text, created_at, delivered_at, delivery_unknown FROM support_messages
		WHERE id = $1::uuid AND conversation_id = $2::uuid
		FOR UPDATE`, messageID, conversation.ID).
		Scan(&m.ID, &m.Author, &m.Text, &m.CreatedAt, &deliveredAt, &unknown)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("support message not found: %w", apperrors.ErrNotFound)
	}
	if err != nil {
		return nil, fmt.Errorf("load support message: %w", err)
	}

	if m.Author == "user" {
		return nil, fmt.Errorf("incoming messages are not delivered: %w", apperrors.ErrConflict)
	}
	if deliveredAt.Valid {
		return nil, fmt.Errorf("message already delivered: %w", apperrors.ErrConflict)
	}
	// До миграции 065 доставку не записывали: пустая отметка не значит, что
	// ответ не дошёл, и повтор скорее отправил бы его второй раз.
	if unknown {
		return nil, fmt.Errorf("delivery of this message was never tracked: %w", apperrors.ErrConflict)
	}

	if err := s.sender.SendMessage(ctx, conversation.ChatID, m.Text); err != nil {
		s.log.Warn("Retrying a support message failed again",
			"conversation_id", conversation.ID, "message_id", m.ID, "error", err)
		delivered := false
		m.Delivered = &delivered
		return &m, fmt.Errorf("%w: %v", ErrDeliveryFailed, err)
	}

	// Как и у первой попытки: ответ, который дошёл, — это и есть подключение.
	if _, err := s.db.ExecContext(ctx,
		`UPDATE support_conversations SET answered_at = COALESCE(answered_at, NOW())
		  WHERE id = $1::uuid`, conversation.ID); err != nil {
		s.log.Error("Could not record that a person answered",
			"conversation_id", conversation.ID, "error", err)
	}

	// Не markDelivered: тот глотает ошибку. Здесь ответ «доставлено» при
	// строке без отметки разошёлся бы с тем, что увидит следующий оператор,
	// открыв переписку, — поэтому отказ отметки доходит до вызывающего.
	if _, err := tx.ExecContext(ctx,
		`UPDATE support_messages SET delivered_at = $2 WHERE id = $1::uuid`,
		m.ID, time.Now()); err != nil {
		return nil, fmt.Errorf("mark retried message delivered: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit retry: %w", err)
	}

	delivered := true
	m.Delivered = &delivered
	return &m, nil
}
