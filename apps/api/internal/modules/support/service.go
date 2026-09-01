package support

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/openrouter"
)

// Retention bounds how long a support conversation is kept.
const Retention = 90 * 24 * time.Hour

// perChatWindow and perChatLimit bound how fast one chat can ask.
//
// The webhook is public and every question costs a model call, so a chat that
// asks faster than a person could type is answered with a refusal rather than
// a bill.
const (
	perChatWindow = time.Minute
	perChatLimit  = 5
)

// LeadResolver turns the payload of a deep link into the lead it names.
//
// Only the identifier crosses the boundary: what the lead holds is read from
// the database here, so the two modules share a string rather than a type.
type LeadResolver interface {
	LeadIDForToken(ctx context.Context, token string) (string, error)
}

// LeadSummary is what an operator needs to see: who, and where they stopped.
type LeadSummary struct {
	ID       string
	Email    string
	Name     string
	LastStep string
	Summary  string
}

// Answerer produces an answer to a question behind a cached prefix.
type Answerer interface {
	Ask(ctx context.Context, cachedPrefix, question string, history []openrouter.Turn) (string, error)
}

// Sender delivers a message back to the chat it came from.
type Sender interface {
	SendMessage(ctx context.Context, chatID int64, text string) error
}

// Service answers questions and hands the difficult ones to a person.
type Service struct {
	db       *sql.DB
	log      *logger.Logger
	answerer Answerer
	sender   Sender
	leads    LeadResolver

	// dailyLimit caps model calls across every chat: a public entrance in
	// front of a paid model needs a ceiling that one abusive chat cannot lift.
	dailyLimit int

	mu        sync.Mutex
	callsDay  time.Time
	callCount int
	// chatSeen bounds one chat's rate. In memory rather than in the database:
	// it is a throttle, not a record, and losing it on restart costs nothing.
	chatSeen map[int64][]time.Time

	prefixOnce sync.Once
	prefix     string
	prefixErr  error
}

// NewService creates the service.
func NewService(db *sql.DB, log *logger.Logger, answerer Answerer, sender Sender, leads LeadResolver, dailyLimit int) *Service {
	return &Service{
		db:         db,
		log:        log,
		answerer:   answerer,
		sender:     sender,
		leads:      leads,
		dailyLimit: dailyLimit,
		chatSeen:   make(map[int64][]time.Time),
	}
}

// Replies the bot gives without asking the model at all.
const (
	greeting = "Здравствуйте! Я отвечаю на вопросы о сервисе BURCEV: как устроен дневник питания, " +
		"что делает куратор, что происходит с вашими данными. Спрашивайте.\n\n" +
		"Если я не знаю ответа — передам вопрос человеку."

	escalationReply = "Не нашёл ответа в документации и не буду придумывать. " +
		"Передал ваш вопрос человеку — ответят здесь же."

	rateLimitedReply = "Слишком много вопросов подряд. Подождите минуту, пожалуйста — " +
		"или напишите «оператор», и вам ответит человек."

	busyReply = "Сейчас не могу ответить сам. Передал ваш вопрос человеку — ответят здесь же."

	signedInReply = "Вы уже зарегистрированы. Всё, что касается вашего плана, питания и прогресса, " +
		"лучше обсудить с куратором в чате приложения — там он видит вашу историю."
)

// HandleMessage is the whole conversation loop for one incoming message.
func (s *Service) HandleMessage(ctx context.Context, in IncomingMessage) error {
	conversation, err := s.conversationFor(ctx, in)
	if err != nil {
		return err
	}

	text := strings.TrimSpace(in.Text)
	if err := s.recordMessage(ctx, conversation.ID, "user", text, nil); err != nil {
		return err
	}

	// /start, with or without a deep-link payload carrying their saved lead.
	if strings.HasPrefix(text, "/start") {
		s.attachLead(ctx, conversation, strings.TrimSpace(strings.TrimPrefix(text, "/start")))
		return s.reply(ctx, conversation, greeting)
	}

	// Asking for a person is always granted; nobody has to argue with a bot.
	if wantsHuman(text) {
		return s.escalate(ctx, conversation, "по просьбе пользователя")
	}

	if !s.allowChat(in.ChatID) {
		return s.reply(ctx, conversation, rateLimitedReply)
	}
	if !s.allowModelCall() {
		// The daily ceiling is reached: a person answers rather than nobody.
		return s.escalate(ctx, conversation, "исчерпан дневной лимит обращений к модели")
	}

	prefix, err := s.cachedPrefix()
	if err != nil {
		s.log.Error("Support knowledge base unavailable", "error", err)
		return s.escalate(ctx, conversation, "база знаний недоступна")
	}

	history, err := s.recentTurns(ctx, conversation.ID)
	if err != nil {
		return err
	}

	answer, err := s.answerer.Ask(ctx, prefix, s.question(conversation, text), history)
	if err != nil {
		s.log.Error("Support model call failed", "error", err)
		return s.escalate(ctx, conversation, "ошибка обращения к модели")
	}

	// The model was told to say exactly this when the corpus has no answer. A
	// made-up answer about money or health data costs more than no answer.
	if strings.Contains(answer, EscalationMarker) {
		return s.escalate(ctx, conversation, "ответа нет в документации")
	}

	return s.reply(ctx, conversation, answer)
}

// question frames the user's message for the model, adding only what changes
// the answer — and only after the cache point.
func (s *Service) question(conversation *Conversation, text string) string {
	if conversation.UserID != nil {
		return "Этот человек уже зарегистрирован.\n\nВопрос: " + text
	}
	return "Вопрос: " + text
}

func wantsHuman(text string) bool {
	lowered := strings.ToLower(text)
	for _, phrase := range []string{"оператор", "человек", "поддержк", "менеджер", "живой"} {
		if strings.Contains(lowered, phrase) {
			return true
		}
	}
	return false
}

// escalate marks the conversation for a person and tells the user so.
func (s *Service) escalate(ctx context.Context, conversation *Conversation, reason string) error {
	if _, err := s.db.ExecContext(ctx, `
		UPDATE support_conversations
		SET status = 'escalated', escalation_reason = $2, escalated_at = COALESCE(escalated_at, NOW())
		WHERE id = $1 AND status <> 'escalated'`, conversation.ID, reason); err != nil {
		return fmt.Errorf("escalate conversation: %w", err)
	}

	s.log.Info("Support conversation escalated", "conversation_id", conversation.ID, "reason", reason)

	message := escalationReply
	if conversation.UserID != nil {
		message = signedInReply + "\n\n" + escalationReply
	}
	return s.reply(ctx, conversation, message)
}

// reply records what the bot said and sends it.
func (s *Service) reply(ctx context.Context, conversation *Conversation, text string) error {
	if err := s.recordMessage(ctx, conversation.ID, "bot", text, nil); err != nil {
		return err
	}
	return s.sender.SendMessage(ctx, conversation.ChatID, text)
}

// AnswerAsOperator delivers a person's reply into the same chat.
func (s *Service) AnswerAsOperator(ctx context.Context, conversationID string, operatorID int64, text string) error {
	conversation, err := s.byID(ctx, conversationID)
	if err != nil {
		return err
	}

	if err := s.recordMessage(ctx, conversation.ID, "operator", text, &operatorID); err != nil {
		return err
	}
	return s.sender.SendMessage(ctx, conversation.ChatID, text)
}

// Close ends a conversation once it has been dealt with.
func (s *Service) Close(ctx context.Context, conversationID string, operatorID int64) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE support_conversations
		SET status = 'closed', closed_at = NOW(), closed_by = $2
		WHERE id = $1`, conversationID, operatorID)
	if err != nil {
		return fmt.Errorf("close conversation: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return fmt.Errorf("conversation not found: %w", apperrors.ErrNotFound)
	}
	return nil
}

// PurgeOld deletes conversations nobody has touched for the retention period.
func (s *Service) PurgeOld(ctx context.Context) (int, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM support_conversations WHERE last_message_at <= NOW() - $1::interval`,
		fmt.Sprintf("%d seconds", int(Retention.Seconds())))
	if err != nil {
		return 0, fmt.Errorf("purge support conversations: %w", err)
	}
	affected, _ := result.RowsAffected()
	return int(affected), nil
}

// cachedPrefix builds the corpus once per process.
func (s *Service) cachedPrefix() (string, error) {
	s.prefixOnce.Do(func() {
		s.prefix, s.prefixErr = buildPrefix()
	})
	return s.prefix, s.prefixErr
}

// allowChat throttles one chat.
func (s *Service) allowChat(chatID int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	kept := s.chatSeen[chatID][:0]
	for _, at := range s.chatSeen[chatID] {
		if now.Sub(at) < perChatWindow {
			kept = append(kept, at)
		}
	}
	if len(kept) >= perChatLimit {
		s.chatSeen[chatID] = kept
		return false
	}
	s.chatSeen[chatID] = append(kept, now)
	return true
}

// allowModelCall enforces the daily ceiling across every chat.
func (s *Service) allowModelCall() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	today := time.Now().UTC().Truncate(24 * time.Hour)
	if !s.callsDay.Equal(today) {
		s.callsDay = today
		s.callCount = 0
	}
	if s.dailyLimit > 0 && s.callCount >= s.dailyLimit {
		return false
	}
	s.callCount++
	return true
}

// attachLead links the chat to a saved onboarding attempt, if the deep link
// carried a valid one.
func (s *Service) attachLead(ctx context.Context, conversation *Conversation, payload string) {
	if payload == "" || s.leads == nil {
		return
	}

	leadID, err := s.leads.LeadIDForToken(ctx, payload)
	if err != nil {
		// A stale or forged payload is not the visitor's problem: they still
		// get a conversation, just without their earlier answers attached.
		s.log.Info("Support deep link carried no usable lead", "error", err)
		return
	}

	if _, err := s.db.ExecContext(ctx,
		`UPDATE support_conversations SET lead_id = $2 WHERE id = $1`,
		conversation.ID, leadID); err != nil {
		s.log.Error("Failed to attach lead to support conversation", "error", err)
		return
	}
	conversation.LeadID = &leadID
}

func (s *Service) recentTurns(ctx context.Context, conversationID string) ([]openrouter.Turn, error) {
	// Enough for a follow-up question to make sense, short enough that the
	// variable part of the request stays small.
	rows, err := s.db.QueryContext(ctx, `
		SELECT author, text FROM (
			SELECT author, text, created_at FROM support_messages
			WHERE conversation_id = $1 AND author IN ('user', 'bot')
			ORDER BY created_at DESC LIMIT 7
		) recent ORDER BY created_at ASC`, conversationID)
	if err != nil {
		return nil, fmt.Errorf("load conversation history: %w", err)
	}
	defer rows.Close()

	turns := make([]openrouter.Turn, 0, 7)
	for rows.Next() {
		var author, text string
		if err := rows.Scan(&author, &text); err != nil {
			return nil, fmt.Errorf("scan conversation history: %w", err)
		}
		role := "user"
		if author == "bot" {
			role = "assistant"
		}
		turns = append(turns, openrouter.Turn{Role: role, Text: text})
	}
	// The last row is the message being answered; it is added by the caller.
	if len(turns) > 0 {
		turns = turns[:len(turns)-1]
	}
	return turns, rows.Err()
}

func (s *Service) recordMessage(ctx context.Context, conversationID, author, text string, operatorID *int64) error {
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO support_messages (conversation_id, author, text, operator_id)
		VALUES ($1, $2, $3, $4)`, conversationID, author, text, operatorID); err != nil {
		return fmt.Errorf("record support message: %w", err)
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE support_conversations SET last_message_at = NOW() WHERE id = $1`,
		conversationID); err != nil {
		return fmt.Errorf("touch support conversation: %w", err)
	}
	return nil
}

func (s *Service) conversationFor(ctx context.Context, in IncomingMessage) (*Conversation, error) {
	var conversation Conversation
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO support_conversations (chat_id, telegram_username, telegram_name)
		VALUES ($1, NULLIF($2, ''), NULLIF($3, ''))
		ON CONFLICT (chat_id) DO UPDATE SET
			telegram_username = COALESCE(EXCLUDED.telegram_username, support_conversations.telegram_username),
			telegram_name = COALESCE(EXCLUDED.telegram_name, support_conversations.telegram_name),
			-- A closed conversation reopens when the person writes again.
			status = CASE WHEN support_conversations.status = 'closed' THEN 'open'
			              ELSE support_conversations.status END
		RETURNING id, chat_id, lead_id, user_id, status`,
		in.ChatID, in.Username, in.Name).
		Scan(&conversation.ID, &conversation.ChatID, &conversation.LeadID,
			&conversation.UserID, &conversation.Status)
	if err != nil {
		return nil, fmt.Errorf("open support conversation: %w", err)
	}
	return &conversation, nil
}

func (s *Service) byID(ctx context.Context, conversationID string) (*Conversation, error) {
	var conversation Conversation
	err := s.db.QueryRowContext(ctx,
		`SELECT id, chat_id, lead_id, user_id, status FROM support_conversations WHERE id = $1`,
		conversationID).
		Scan(&conversation.ID, &conversation.ChatID, &conversation.LeadID,
			&conversation.UserID, &conversation.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("conversation not found: %w", apperrors.ErrNotFound)
	}
	if err != nil {
		return nil, fmt.Errorf("load support conversation: %w", err)
	}
	return &conversation, nil
}

// ListConversations returns the operator's queue: escalated first, then by
// recency, so the thing somebody is waiting for is at the top.
func (s *Service) ListConversations(ctx context.Context, status string, limit, offset int) ([]Conversation, int, error) {
	where := ""
	args := []any{limit, offset}
	if status != "" {
		where = "WHERE status = $3"
		args = append(args, status)
	}

	var total int
	countQuery := "SELECT COUNT(*) FROM support_conversations"
	if status != "" {
		countQuery += " WHERE status = $1"
		if err := s.db.QueryRowContext(ctx, countQuery, status).Scan(&total); err != nil {
			return nil, 0, fmt.Errorf("count support conversations: %w", err)
		}
	} else if err := s.db.QueryRowContext(ctx, countQuery).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count support conversations: %w", err)
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, chat_id, lead_id, user_id, status,
		       COALESCE(telegram_username, ''), COALESCE(telegram_name, ''),
		       COALESCE(escalation_reason, ''), escalated_at, last_message_at, created_at
		FROM support_conversations `+where+`
		ORDER BY (status = 'escalated') DESC, last_message_at DESC
		LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list support conversations: %w", err)
	}
	defer rows.Close()

	conversations := make([]Conversation, 0, limit)
	for rows.Next() {
		var c Conversation
		var escalatedAt sql.NullTime
		if err := rows.Scan(&c.ID, &c.ChatID, &c.LeadID, &c.UserID, &c.Status,
			&c.Username, &c.Name, &c.EscalationReason, &escalatedAt,
			&c.LastMessageAt, &c.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan support conversation: %w", err)
		}
		if escalatedAt.Valid {
			c.EscalatedAt = &escalatedAt.Time
		}
		conversations = append(conversations, c)
	}
	return conversations, total, rows.Err()
}

// Thread returns one conversation with its messages and, when the chat came
// from a saved onboarding attempt, what that attempt held.
func (s *Service) Thread(ctx context.Context, conversationID string) (*Conversation, []Message, *LeadSummary, error) {
	var c Conversation
	var escalatedAt sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT id, chat_id, lead_id, user_id, status,
		       COALESCE(telegram_username, ''), COALESCE(telegram_name, ''),
		       COALESCE(escalation_reason, ''), escalated_at, last_message_at, created_at
		FROM support_conversations WHERE id = $1`, conversationID).
		Scan(&c.ID, &c.ChatID, &c.LeadID, &c.UserID, &c.Status, &c.Username, &c.Name,
			&c.EscalationReason, &escalatedAt, &c.LastMessageAt, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, nil, fmt.Errorf("conversation not found: %w", apperrors.ErrNotFound)
	}
	if err != nil {
		return nil, nil, nil, fmt.Errorf("load support conversation: %w", err)
	}
	if escalatedAt.Valid {
		c.EscalatedAt = &escalatedAt.Time
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT id, author, text, created_at FROM support_messages
		 WHERE conversation_id = $1 ORDER BY created_at ASC`, conversationID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("load support messages: %w", err)
	}
	defer rows.Close()

	messages := make([]Message, 0)
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.Author, &m.Text, &m.CreatedAt); err != nil {
			return nil, nil, nil, fmt.Errorf("scan support message: %w", err)
		}
		messages = append(messages, m)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, nil, err
	}

	var lead *LeadSummary
	if c.LeadID != nil {
		summary, err := s.leadSummary(ctx, *c.LeadID)
		if err != nil {
			// The conversation is still worth showing without it.
			s.log.Error("Failed to load lead for support conversation", "error", err)
		} else {
			lead = summary
		}
	}

	return &c, messages, lead, nil
}

func (s *Service) leadSummary(ctx context.Context, leadID string) (*LeadSummary, error) {
	var summary LeadSummary
	var goal, step sql.NullString
	var calories sql.NullFloat64
	err := s.db.QueryRowContext(ctx, `
		SELECT id, email, COALESCE(name, ''), goal, last_step, calories
		FROM leads WHERE id = $1`, leadID).
		Scan(&summary.ID, &summary.Email, &summary.Name, &goal, &step, &calories)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("lead not found: %w", apperrors.ErrNotFound)
	}
	if err != nil {
		return nil, fmt.Errorf("load lead summary: %w", err)
	}

	summary.LastStep = step.String
	parts := make([]string, 0, 2)
	if goal.Valid && goal.String != "" {
		parts = append(parts, "цель: "+goal.String)
	}
	if calories.Valid {
		parts = append(parts, fmt.Sprintf("расчёт: %.0f ккал", calories.Float64))
	}
	summary.Summary = strings.Join(parts, ", ")
	return &summary, nil
}
