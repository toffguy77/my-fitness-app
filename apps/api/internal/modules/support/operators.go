package support

import (
	"context"
	"fmt"

	"github.com/burcev/api/internal/modules/notifications"
)

// Telling the people who answer.
//
// A conversation the bot could not handle used to sit in the admin queue until
// somebody happened to look. Now it reaches operators the same way everything
// else reaches anybody in this product: as a notification, which their own
// preferences then carry to email or push if that is how they have asked to be
// told. No new channel, and nothing to configure separately.

// OperatorNotifier creates the notice operators see.
//
// Narrow on purpose: the support module needs to raise a notification, not to
// know how notifications work.
type OperatorNotifier interface {
	CreateNotification(ctx context.Context, notification *notifications.Notification) error
	LanguageOf(ctx context.Context, userID int64) string
}

// WithOperatorNotices attaches the notifier. Without it escalation still works
// and the conversation still appears in the queue — it is simply not announced.
func (s *Service) WithOperatorNotices(notifier OperatorNotifier) *Service {
	s.operators = notifier
	return s
}

// notifyOperators tells every operator that a conversation needs a person.
//
// Failures are logged, not returned: the escalation itself has already
// happened, and the person waiting in Telegram has already been told somebody
// will answer. Undoing that because a notification could not be written would
// be the wrong trade.
func (s *Service) notifyOperators(ctx context.Context, conversationID, reason string) {
	if s.operators == nil {
		return
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT id FROM users
		 WHERE role = 'super_admin' AND deleted_at IS NULL AND deletion_requested_at IS NULL`)
	if err != nil {
		s.log.Error("Could not list operators to notify", "error", err)
		return
	}
	defer func() { _ = rows.Close() }()

	var operatorIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			s.log.Error("Could not read an operator id", "error", err)
			return
		}
		operatorIDs = append(operatorIDs, id)
	}
	if err := rows.Err(); err != nil {
		s.log.Error("Could not read the operator list", "error", err)
		return
	}

	if len(operatorIDs) == 0 {
		// Worth saying out loud: an escalation nobody is told about is an
		// escalation nobody answers.
		s.log.Warn("A support conversation was escalated and there are no operators to tell",
			"conversation_id", conversationID)
		return
	}

	actionURL := "/admin/support"
	for _, operatorID := range operatorIDs {
		title, content := notifications.Text(
			s.operators.LanguageOf(ctx, operatorID),
			notifications.TextSupportEscalated,
			map[string]string{"reason": reason})

		if err := s.operators.CreateNotification(ctx, &notifications.Notification{
			UserID:    operatorID,
			Category:  notifications.CategoryMain,
			Type:      notifications.TypeSupportEscalated,
			Title:     title,
			Content:   content,
			ActionURL: &actionURL,
		}); err != nil {
			s.log.Error("Could not tell an operator about an escalation",
				"error", fmt.Sprint(err), "operator_id", operatorID, "conversation_id", conversationID)
		}
	}
}
