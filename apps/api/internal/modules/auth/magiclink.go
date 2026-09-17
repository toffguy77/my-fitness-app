package auth

import (
	"context"
	"encoding/json"
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

	// LOWER(email) = LOWER($1): email в базе регистрозависим (TEXT UNIQUE, не
	// CITEXT), а человек может набрать адрес не в том регистре, в каком
	// регистрировался — особенно на телефоне, где автоподстановка ставит
	// заглавную первую букву. Ищем без учёта регистра, чтобы не завести
	// такому человеку второй аккаунт на тот же почтовый ящик.
	//
	// Читаем через QueryContext и считаем строки, а не QueryRowContext: схема
	// уже сегодня допускает пару аккаунтов, различающихся только регистром
	// письма. Если совпало больше одного, QueryRowContext молча вернул бы
	// один из них произвольно — то есть выдал бы ссылку входа в аккаунт,
	// который, возможно, не тот, о ком речь. Это хуже, чем не найти вовсе, и
	// угадывать здесь нельзя: при неоднозначности отказываемся, не пишем
	// строку и не шлём письмо, но отвечаем вызывающему тем же nil, что и при
	// обычном успехе — иначе ответ выдал бы существование двойника.
	rows, err := s.db.QueryContext(ctx,
		`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, recipient)
	if err != nil {
		return fmt.Errorf("look up account: %w", err)
	}
	var matches []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return fmt.Errorf("look up account: %w", err)
		}
		matches = append(matches, id)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("look up account: %w", err)
	}
	rows.Close()

	var userID *int64
	switch len(matches) {
	case 0:
		// Аккаунта нет — переход по ссылке его создаст.
	case 1:
		userID = &matches[0]
	default:
		return nil
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

	// recipient — как человек его набрал, без приведения регистра: нормализация
	// нужна только для поиска аккаунта, а не для того, что хранится.
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
