package auth

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/logger"
)

// Отзыв доступа у Apple (apple-sign-in, Guideline 5.1.1(v)).
//
// Удаление аккаунта и отвязка Apple кладут сохранённый refresh-токен Apple
// в очередь apple_token_revocations — в той же транзакции, что стирает
// привязку, — и сразу пробуют отозвать. Удачный отзыв удаляет строку,
// неудачный оставляет её с отсрочкой, и строку повторяет фоновая задача
// auth.apple-revoke-retry. Удаление аккаунта от исхода не зависит: Apple
// недоступна — человек всё равно удалён, а доступ отзовётся позже.

// AppleRevoker revokes a sealed Apple refresh token; *oauth.Apple is one.
type AppleRevoker interface {
	Revoke(ctx context.Context, sealed string) error
}

// QueueAppleRevocationSQL moves a user's stored Apple refresh tokens into the
// revocation queue and returns the queue ids. Run it inside the transaction
// that deletes the identity, before the delete: the token must not vanish
// with the row and leave nothing to revoke. $1 is the user id.
const QueueAppleRevocationSQL = `
	INSERT INTO apple_token_revocations (token_enc)
	SELECT provider_refresh_token_enc FROM external_identities
	 WHERE user_id = $1 AND provider = 'apple' AND provider_refresh_token_enc IS NOT NULL
	RETURNING id`

// appleRevocationBackoff is the delay after the given failed attempt:
// a minute, doubling, at most a day. Apple being down for hours is not
// unheard of; retrying every minute through it is pointless.
func appleRevocationBackoff(attempt int) time.Duration {
	delay := time.Minute
	for i := 1; i < attempt && delay < 24*time.Hour; i++ {
		delay *= 2
	}
	if delay > 24*time.Hour {
		delay = 24 * time.Hour
	}
	return delay
}

// AppleRevocations drains the queue.
type AppleRevocations struct {
	db    *sql.DB
	apple AppleRevoker
	log   *logger.Logger
}

// NewAppleRevocations creates the drainer.
func NewAppleRevocations(db *sql.DB, apple AppleRevoker, log *logger.Logger) *AppleRevocations {
	return &AppleRevocations{db: db, apple: apple, log: log}
}

// Attempt tries the given queue rows now. Failures stay queued for the job;
// nothing is returned because nothing upstream may fail on them.
func (r *AppleRevocations) Attempt(ctx context.Context, ids []int64) {
	if r == nil || len(ids) == 0 {
		return
	}
	if _, err := r.process(ctx, `
		SELECT id, token_enc, attempts FROM apple_token_revocations
		 WHERE id = ANY($1) ORDER BY id`, ids); err != nil {
		r.log.Errorw("Failed to revoke Apple tokens; the retry job will", "error", err)
	}
}

// RetryDue retries every queued revocation whose time has come. Reports how
// many were revoked.
func (r *AppleRevocations) RetryDue(ctx context.Context) (int, error) {
	return r.process(ctx, `
		SELECT id, token_enc, attempts FROM apple_token_revocations
		 WHERE next_attempt_at <= NOW() ORDER BY next_attempt_at LIMIT 100`)
}

func (r *AppleRevocations) process(ctx context.Context, query string, args ...any) (int, error) {
	due, err := r.loadDue(ctx, query, args...)
	if err != nil {
		return 0, err
	}

	revoked := 0
	for _, item := range due {
		if err := r.apple.Revoke(ctx, item.token); err != nil {
			attempt := item.attempts + 1
			r.log.Warnw("Apple token revocation failed, will retry",
				"revocation_id", item.id, "attempt", attempt, "error", err)
			if _, uerr := r.db.ExecContext(ctx, `
				UPDATE apple_token_revocations
				   SET attempts = $2, last_error = $3, next_attempt_at = NOW() + $4::interval
				 WHERE id = $1`,
				item.id, attempt, err.Error(),
				fmt.Sprintf("%d seconds", int(appleRevocationBackoff(attempt).Seconds()))); uerr != nil {
				return revoked, fmt.Errorf("record apple revocation failure: %w", uerr)
			}
			continue
		}
		if _, err := r.db.ExecContext(ctx, `DELETE FROM apple_token_revocations WHERE id = $1`, item.id); err != nil {
			return revoked, fmt.Errorf("forget revoked apple token: %w", err)
		}
		revoked++
	}
	return revoked, nil
}

// loadDue reads the revocations whose turn has come.
func (r *AppleRevocations) loadDue(ctx context.Context, query string, args ...any) ([]appleRevocationRow, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("load apple revocations: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var due []appleRevocationRow
	for rows.Next() {
		var item appleRevocationRow
		if err := rows.Scan(&item.id, &item.token, &item.attempts); err != nil {
			return nil, fmt.Errorf("scan apple revocation: %w", err)
		}
		due = append(due, item)
	}
	return due, rows.Err()
}

type appleRevocationRow struct {
	id       int64
	token    string
	attempts int
}
