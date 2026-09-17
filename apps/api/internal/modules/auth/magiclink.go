package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/email"
)

// MagicLinkTTL — сколько живёт ссылка входа. Достаточно дойти до почты, мало
// для письма, забытого в общем ящике.
const MagicLinkTTL = 15 * time.Minute

// RequestMagicLink выдаёт одноразовую ссылку входа на адрес.
//
// Ответ не зависит от того, есть ли аккаунт: различие превратило бы эндпоинт в
// проверялку наличия аккаунта. Различается только текст письма — и пока не
// различается даже он: один вариант письма для входа и для регистрации, до
// отдельной задачи, которая напишет два варианта и тест на них.
func (s *Service) RequestMagicLink(ctx context.Context, recipient string, consents *ConsentsInput, ip, ua string) error {
	if consents == nil || !consents.TermsOfService || !consents.PrivacyPolicy || !consents.DataProcessing {
		return apperrors.ErrValidation
	}

	var userID *int64
	var existing int64
	switch err := s.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE email = $1`, recipient).Scan(&existing); {
	case err == nil:
		userID = &existing
	case errors.Is(err, sql.ErrNoRows):
		// Аккаунта нет — переход по ссылке его создаст.
	default:
		return fmt.Errorf("look up account: %w", err)
	}

	plainToken, hashedToken, err := s.tokens.GenerateToken()
	if err != nil {
		return fmt.Errorf("generate magic link token: %w", err)
	}

	// Согласия нужны только когда аккаунта нет: существующему их не
	// перезаписывают, это вход, а не регистрация.
	var payload []byte
	if userID == nil {
		payload, err = json.Marshal(consents)
		if err != nil {
			return fmt.Errorf("encode consents: %w", err)
		}
	}

	expiresAt := time.Now().Add(MagicLinkTTL)
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO magic_links (token_hash, email, user_id, consents, expires_at, ip_address, user_agent)
		 VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
		hashedToken, recipient, userID, payload, expiresAt, ip, ua); err != nil {
		return fmt.Errorf("store magic link: %w", err)
	}

	if s.emailService == nil {
		// Почта — необязательная способность; без неё ссылку никуда не
		// доставить, и запрос отказывает, а не молча ничего не делает.
		return fmt.Errorf("magic link requires email: %w", apperrors.ErrEmailUnavailable)
	}

	origin := "https://" + s.cfg.AppDomain
	if s.cfg.AppDomain == "" {
		origin = "http://localhost:3069"
	}

	return s.emailService.SendMagicLink(ctx, email.MagicLinkEmailData{
		UserEmail:    recipient,
		MagicLinkURL: origin + "/auth/link/consume?token=" + url.QueryEscape(plainToken),
		ExpiresAt:    expiresAt,
		SupportEmail: "support@burcev.team",
	})
}
