package support

import (
	"context"
	"fmt"
	"time"

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
func (s *Service) notifyOperators(ctx context.Context, conversationID string, clientID *int64, reason string) {
	if s.operators == nil {
		return
	}

	operatorIDs, err := s.recipientsFor(ctx, clientID)
	if err != nil {
		s.log.Error("Could not list operators to notify", "error", err)
		return
	}

	if len(operatorIDs) == 0 {
		// Worth saying out loud: an escalation nobody is told about is an
		// escalation nobody answers.
		s.log.Warn("A support conversation was escalated and there are no operators to tell",
			"conversation_id", conversationID)
		return
	}

	actionURL := "/curator/support"
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

// recipientsFor выбирает, кого звать на обращение.
//
// Куратора клиента — он ведёт этого человека, видит его дневник и переписку.
// Суперадминов — только когда куратора нет: обращение пришло от незнакомца
// (человек пишет боту до регистрации) либо у клиента нет активной связи.
//
// Выбор делается в момент эскалации, а не при создании обращения: между первым
// вопросом и передачей человеку куратор может смениться, и звать надо того, кто
// ведёт клиента сейчас.
func (s *Service) recipientsFor(ctx context.Context, clientID *int64) ([]int64, error) {
	if clientID != nil {
		curators, err := s.query(ctx,
			`SELECT curator_id FROM curator_client_relationships
			  WHERE client_id = $1 AND status = 'active'`, *clientID)
		if err != nil {
			return nil, fmt.Errorf("look up the client's curator: %w", err)
		}
		if len(curators) > 0 {
			return curators, nil
		}
	}

	return s.query(ctx,
		`SELECT id FROM users
		  WHERE role = 'super_admin' AND deleted_at IS NULL AND deletion_requested_at IS NULL`)
}

func (s *Service) query(ctx context.Context, sql string, args ...any) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ReescalationAfter — сколько ждать ответа куратора, прежде чем звать
// суперадминов.
//
// Тридцать минут: решение владельца продукта. Значение по умолчанию, а не
// закон — пересматривать по первым живым обращениям.
const ReescalationAfter = 30 * time.Minute

// RaiseUnanswered поднимает на суперадминов обращения, до которых не дошли руки.
//
// Подключением считается отправленный ответ (`answered_at`), а не просмотр
// очереди: обращение, на которое «посмотрели», для человека неотличимо от
// забытого.
//
// Поднимается один раз на обращение — отсюда `reescalated_at`. Очередь, которая
// кричит на каждом проходе, перестаёт что-либо значить.
//
// Клиенту при этом ничего не пишется: он уже услышал, что человек подключится, а
// «зовём другого» звучит как отказ, а не как забота.
func (s *Service) RaiseUnanswered(ctx context.Context, after time.Duration) (int, error) {
	if s.operators == nil {
		return 0, nil
	}

	rows, err := s.db.QueryContext(ctx, `
		UPDATE support_conversations
		   SET reescalated_at = NOW()
		 WHERE status = 'escalated'
		   AND answered_at IS NULL
		   AND reescalated_at IS NULL
		   AND escalated_at < NOW() - $1::interval
		RETURNING id, COALESCE(escalation_reason, '')`,
		fmt.Sprintf("%d seconds", int(after.Seconds())))
	if err != nil {
		return 0, fmt.Errorf("find unanswered escalations: %w", err)
	}
	defer func() { _ = rows.Close() }()

	type pending struct{ id, reason string }
	var raised []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.reason); err != nil {
			return 0, fmt.Errorf("read an unanswered escalation: %w", err)
		}
		raised = append(raised, p)
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("read unanswered escalations: %w", err)
	}

	for _, p := range raised {
		// Сознательно без клиента: это уже второй заход, и он именно к
		// суперадминам, кто бы ни был куратором.
		s.notifyOperators(ctx, p.id, nil, "куратор не ответил: "+p.reason)
	}
	return len(raised), nil
}
