package supportbridge

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// PlatformDelivery кладёт ответ куратора в переписку платформы.
//
// Ответ, написанный из Telegram, должен быть виден в приложении так же, как
// написанный там: иначе у клиента переписка распадается на две половины, и
// половину он не найдёт.
type PlatformDelivery struct {
	db *sql.DB
}

func NewPlatformDelivery(db *sql.DB) *PlatformDelivery {
	return &PlatformDelivery{db: db}
}

// ToPlatform записывает сообщение в беседу клиента с его куратором.
func (p *PlatformDelivery) ToPlatform(ctx context.Context, clientID, curatorID int64, text string) error {
	if curatorID == 0 {
		// Автора не установили — берём куратора клиента: беседа всё равно его.
		err := p.db.QueryRowContext(ctx,
			`SELECT curator_id FROM curator_client_relationships
			  WHERE client_id = $1 AND status = 'active' LIMIT 1`, clientID).Scan(&curatorID)
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("у клиента %d нет активного куратора", clientID)
		}
		if err != nil {
			return fmt.Errorf("resolve curator: %w", err)
		}
	}

	// Условие частичного индекса названо намеренно: без него Postgres индекс не
	// подберёт, и вставка упадёт вместо того, чтобы обновить. На это есть
	// охранник TestConversationUpsertsTargetThePartialIndex — он и поймал.
	var conversationID string
	err := p.db.QueryRowContext(ctx, `
		INSERT INTO conversations (client_id, curator_id)
		VALUES ($1, $2)
		ON CONFLICT (client_id, curator_id) WHERE anonymized_at IS NULL
		DO UPDATE SET updated_at = NOW()
		RETURNING id`, clientID, curatorID).Scan(&conversationID)
	if err != nil {
		return fmt.Errorf("resolve conversation: %w", err)
	}

	if _, err := p.db.ExecContext(ctx, `
		INSERT INTO messages (conversation_id, sender_id, type, content)
		VALUES ($1::uuid, $2, 'text', $3)`, conversationID, curatorID, text); err != nil {
		return fmt.Errorf("store the curator's reply: %w", err)
	}
	return nil
}

// CuratorByTelegram находит учётную запись по привязанному Telegram.
type CuratorByTelegram struct {
	db *sql.DB
}

func NewCuratorByTelegram(db *sql.DB) *CuratorByTelegram {
	return &CuratorByTelegram{db: db}
}

// ByTelegramChat возвращает учётную запись, к которой привязан этот Telegram.
//
// Без привязки автор ответа неизвестен — и это не ошибка: куратор мог не
// подключать Telegram к аккаунту, а отвечать из группы всё равно может.
func (c *CuratorByTelegram) ByTelegramChat(ctx context.Context, telegramUserID int64) (int64, bool, error) {
	var userID int64
	err := c.db.QueryRowContext(ctx,
		`SELECT user_id FROM telegram_links WHERE chat_id = $1`, telegramUserID).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("look up curator by telegram: %w", err)
	}
	return userID, true, nil
}

// Attach кладёт вложение в переписку клиента с куратором.
func (p *PlatformDelivery) Attach(ctx context.Context, clientID int64, messageType, key, caption string) error {
	var curatorID int64
	err := p.db.QueryRowContext(ctx,
		`SELECT curator_id FROM curator_client_relationships
		  WHERE client_id = $1 AND status = 'active' LIMIT 1`, clientID).Scan(&curatorID)
	if errors.Is(err, sql.ErrNoRows) {
		// Некуда класть: у человека нет куратора. Не ошибка — он ещё увидит
		// вложение в обращении.
		return nil
	}
	if err != nil {
		return fmt.Errorf("resolve curator: %w", err)
	}

	var conversationID string
	if err := p.db.QueryRowContext(ctx, `
		INSERT INTO conversations (client_id, curator_id)
		VALUES ($1, $2)
		ON CONFLICT (client_id, curator_id) WHERE anonymized_at IS NULL
		DO UPDATE SET updated_at = NOW()
		RETURNING id`, clientID, curatorID).Scan(&conversationID); err != nil {
		return fmt.Errorf("resolve conversation: %w", err)
	}

	if _, err := p.db.ExecContext(ctx, `
		INSERT INTO messages (conversation_id, sender_id, type, content, metadata)
		VALUES ($1::uuid, $2, $3, $4, jsonb_build_object('key', $5::text))`,
		conversationID, clientID, messageType, caption, key); err != nil {
		return fmt.Errorf("store the attachment: %w", err)
	}
	return nil
}
