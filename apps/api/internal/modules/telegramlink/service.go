// Package telegramlink привязывает числовой Telegram chat_id к учётной записи.
//
// Существует по одной причине: **бот не может написать первым**. Bot API
// принимает числовой `chat_id`, а получить его можно единственным способом —
// человек сам открыл бота. В профиле хранится `telegram_username`, по которому
// частному лицу отправить нельзя: попытка не возвращает ошибку, она просто
// ничего не доставляет.
//
// Отсюда билет: человек переходит по ссылке `t.me/<бот>?start=<билет>`, бот
// узнаёт из неё учётную запись и запоминает chat_id, с которого пришли.
package telegramlink

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
)

// TTL — сколько живёт билет привязки.
//
// Достаточно, чтобы открыть Telegram и нажать «Start»; мало, чтобы утёкшая в
// журнал ссылка что-то значила к моменту, когда её кто-то прочтёт.
const TTL = 15 * time.Minute

// Service выдаёт и гасит билеты, хранит и снимает привязки.
type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// Issue выдаёт билет привязки.
//
// Возвращается сам билет; в базу уходит его хэш. Утечка таблицы не должна
// давать возможность привязаться: билет — это право получать чужие
// уведомления.
func (s *Service) Issue(ctx context.Context, userID int64) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate link ticket: %w", err)
	}
	// base64url: 32 байта дают 43 символа и проходят по ограничению Telegram на
	// параметр `start` — не более 64 символов из A-Za-z0-9_-.
	ticket := base64.RawURLEncoding.EncodeToString(raw)

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO telegram_link_tickets (token_hash, user_id, expires_at)
		VALUES ($1, $2, NOW() + $3::interval)`,
		hashTicket(ticket), userID, fmt.Sprintf("%d seconds", int(TTL.Seconds()))); err != nil {
		return "", fmt.Errorf("store link ticket: %w", err)
	}

	// Просроченные убираются по мере накопления, а не работой: таблица держит
	// минуты трафика. Образец тот же, что у ws_tickets.
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM telegram_link_tickets WHERE expires_at < NOW() - INTERVAL '1 hour'`); err != nil {
		// Не повод отказывать в выдаче: билет уже есть и он рабочий.
		_ = err
	}

	return ticket, nil
}

// Redeem гасит билет и привязывает chat_id к названной им учётной записи.
//
// Пометка и чтение — одним запросом. Разнесённые проверка и пометка дали бы две
// успешные привязки при двух одновременных переходах по одной ссылке, а вторая
// привязка — это чужой Telegram на месте вашего.
func (s *Service) Redeem(ctx context.Context, ticket string, chatID int64, username string) (int64, error) {
	if ticket == "" {
		return 0, fmt.Errorf("no link ticket: %w", apperrors.ErrTokenInvalid)
	}

	var userID int64
	err := s.db.QueryRowContext(ctx, `
		UPDATE telegram_link_tickets SET used_at = NOW()
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
		RETURNING user_id`, hashTicket(ticket)).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		// Неизвестный, просроченный и уже использованный — один и тот же ответ
		// тому, кто держит билет в руках. Разные ответы рассказали бы ему, какие
		// билеты существуют.
		return 0, fmt.Errorf("link ticket not redeemable: %w", apperrors.ErrTokenInvalid)
	}
	if err != nil {
		return 0, fmt.Errorf("redeem link ticket: %w", err)
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO telegram_links (user_id, chat_id, username)
		VALUES ($1, $2, NULLIF($3, ''))
		ON CONFLICT (user_id) DO UPDATE SET
			chat_id = EXCLUDED.chat_id,
			username = EXCLUDED.username,
			linked_at = NOW()`, userID, chatID, username); err != nil {
		return 0, fmt.Errorf("store telegram link: %w", err)
	}

	return userID, nil
}

// ChatID возвращает chat_id привязанного Telegram, если привязка есть.
//
// Второе возвращаемое значение отличает «не привязан» от «ошибка»: первое —
// обычное положение дел и не повод никому ничего сообщать.
func (s *Service) ChatID(ctx context.Context, userID int64) (int64, bool, error) {
	var chatID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT chat_id FROM telegram_links WHERE user_id = $1`, userID).Scan(&chatID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("look up telegram link: %w", err)
	}
	return chatID, true, nil
}

// Link описывает привязку для показа в профиле.
type Link struct {
	Username string    `json:"username,omitempty"`
	LinkedAt time.Time `json:"linked_at"`
}

// Of возвращает привязку человека или nil, если её нет.
//
// Состояние определяется наличием строки здесь, а не заполненностью
// `user_settings.telegram_username`: имя в профиле человек вписывает сам, и оно
// ничего не говорит о том, может ли бот ему написать.
func (s *Service) Of(ctx context.Context, userID int64) (*Link, error) {
	var link Link
	var username sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT username, linked_at FROM telegram_links WHERE user_id = $1`,
		userID).Scan(&username, &link.LinkedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("look up telegram link: %w", err)
	}
	link.Username = username.String
	return &link, nil
}

// Unlink снимает привязку. Отсутствие привязки — не ошибка.
func (s *Service) Unlink(ctx context.Context, userID int64) error {
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM telegram_links WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("remove telegram link: %w", err)
	}
	return nil
}

func hashTicket(ticket string) string {
	sum := sha256.Sum256([]byte(ticket))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
