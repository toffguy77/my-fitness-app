package support

// Файл web.go — всё, что отличает веб-канал от Telegram.
//
// Отличий ровно два: чем опознаётся собеседник и как до него доходит ответ.
// Всё остальное — ответ по базе знаний, эскалация, потолок вызовов, привязка
// заявки — общее, и именно поэтому веб и Telegram не могут разойтись.

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/burcev/api/internal/shared/apperrors"
)

// hashWebToken — то, что хранится вместо токена. Токен — доступ к переписке
// незнакомца, и в базе он лежит так же, как лежал бы пароль: необратимо.
func hashWebToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// StartWebConversation заводит разговор из браузера и выдаёт предъявительский
// токен. Токен читает только наш собственный код на наших же страницах —
// поэтому он передаётся явно, а не cookie: cookie прикладывалась бы и к
// запросам пользователя с сессией, где сервер обязан был бы её игнорировать.
func (s *Service) StartWebConversation(ctx context.Context) (string, string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", fmt.Errorf("generate web token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)

	var id string
	if err := s.db.QueryRowContext(ctx,
		`INSERT INTO support_conversations (web_token_hash, channel)
		 VALUES ($1, $2) RETURNING id`,
		hashWebToken(token), ChannelWeb).Scan(&id); err != nil {
		return "", "", fmt.Errorf("create web conversation: %w", err)
	}

	return id, token, nil
}

// WebConversationByToken находит разговор по предъявленному токену. Поддельный
// и чужой токен неразличимы наружу — оба отвечают apperrors.ErrNotFound.
func (s *Service) WebConversationByToken(ctx context.Context, token string) (*Conversation, error) {
	if token == "" {
		return nil, apperrors.ErrNotFound
	}
	conversation, err := s.byWebTokenHash(ctx, hashWebToken(token))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperrors.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load web conversation: %w", err)
	}
	return conversation, nil
}

// byWebTokenHash читает разговор по хэшу токена. chat_id у веб-разговора
// всегда NULL (миграция 076: ровно один из chat_id/web_token_hash заполнен),
// поэтому сканируется через sql.NullInt64, а не напрямую в Conversation.ChatID.
func (s *Service) byWebTokenHash(ctx context.Context, hash string) (*Conversation, error) {
	var conversation Conversation
	var chatID sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT id, chat_id, lead_id, user_id, status, channel
		FROM support_conversations WHERE web_token_hash = $1`,
		hash).
		Scan(&conversation.ID, &chatID, &conversation.LeadID,
			&conversation.UserID, &conversation.Status, &conversation.Channel)
	if err != nil {
		return nil, err
	}
	if chatID.Valid {
		conversation.ChatID = chatID.Int64
	}
	return &conversation, nil
}

// enforceWebMessageCap bounds how long one web conversation may run — not
// abuse of a single request (MaxWebMessageRunes and the route's rate limiter
// cover that), but a conversation kept alive well past any question it could
// plausibly still be asking. Every turn is a paid model call, and the token
// stays valid for as long as the caller wants to hold onto it.
//
// apperrors.ErrRateLimited is reused deliberately, following the precedent in
// account/export.go: this is not "wait a second and retry" so much as "this
// conversation has reached its ceiling", but the client-facing shape (429,
// try something else) is the same one the codebase already has a name for.
func (s *Service) enforceWebMessageCap(ctx context.Context, conversationID string) error {
	var count int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM support_messages WHERE conversation_id = $1`,
		conversationID).Scan(&count); err != nil {
		return fmt.Errorf("count web conversation messages: %w", err)
	}
	if count >= MaxWebMessagesPerConversation {
		return apperrors.ErrRateLimited
	}
	return nil
}
