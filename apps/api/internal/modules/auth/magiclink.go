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
	defer rows.Close()

	var matches []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("look up account: %w", err)
		}
		matches = append(matches, id)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("look up account: %w", err)
	}

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

// ConsumeMagicLink обменивает ссылку на сессию.
//
// Погашение — один запрос с условием, а не чтение с последующей записью:
// UPDATE ... WHERE consumed_at IS NULL AND expires_at > NOW() RETURNING ...
// сам решает, кто выигрывает гонку. Две вкладки, открытые из одного письма,
// обязаны разойтись на уровне базы — проверка перед записью для этого не
// годится ни в каком виде, читающие соединения её не видят друг у друга.
//
// Второе значение — true, если аккаунт был создан этим вызовом.
func (s *Service) ConsumeMagicLink(ctx context.Context, token, ip, ua string) (*LoginResult, bool, error) {
	hash := s.tokens.HashToken(token)

	var recipient string
	var userID *int64
	var consents []byte
	err := s.db.QueryRowContext(ctx, `
		UPDATE magic_links
		   SET consumed_at = NOW()
		 WHERE token_hash = $1
		   AND consumed_at IS NULL
		   AND expires_at > NOW()
		RETURNING email, user_id, consents`, hash).
		Scan(&recipient, &userID, &consents)
	if errors.Is(err, sql.ErrNoRows) {
		// Истёкшая, уже погашенная и поддельная ссылка отвечают одинаково:
		// разница сказала бы, что такой токен когда-то существовал.
		return nil, false, fmt.Errorf("magic link not redeemable: %w", apperrors.ErrTokenInvalid)
	}
	if err != nil {
		return nil, false, fmt.Errorf("consume magic link: %w", err)
	}

	if userID != nil {
		result, err := s.issueTokensForUser(ctx, *userID, ip, ua)
		return result, false, err
	}

	result, err := s.createAccountFromMagicLink(ctx, recipient, consents, ip, ua)
	return result, true, err
}

// createAccountFromMagicLink создаёт аккаунт по адресу и согласиям,
// сохранённым при выдаче ссылки, и сразу выдаёт сессию.
//
// Заглушка: создание аккаунта — отдельная задача (4), ещё не сделанная.
// Возвращает отказ на любой вызов. Наружу это не торчит: маршрут погашения
// ещё не зарегистрирован (задача 6), а тесты этой задачи погашают только
// ссылки с уже существующим user_id и сюда не заходят. Перенос заявки на
// нового пользователя (leadToken) — дело обработчика, не этой функции: сервис
// auth о заявках не знает.
func (s *Service) createAccountFromMagicLink(ctx context.Context, recipient string, consents []byte, ip, ua string) (*LoginResult, error) {
	return nil, fmt.Errorf("создание аккаунта по ссылке входа ещё не реализовано")
}
