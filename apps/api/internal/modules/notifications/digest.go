package notifications

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
)

// UnsubscribeTTL bounds how long the link at the bottom of a digest works. Long
// enough that an old message in somebody's inbox still works, short enough that
// a leaked link stops being useful.
const UnsubscribeTTL = 180 * 24 * time.Hour

// DigestItem is one thing that happened, as it appears in the email.
type DigestItem struct {
	Title     string
	Content   string
	ActionURL string
	CreatedAt time.Time
}

// DigestSender sends the one email.
//
// A function rather than an interface: the mail package's own signature speaks
// in its own types, and a small adapter at the wiring point is honest about
// the conversion. It also means a test needs no mail server, only a closure.
type DigestSender func(ctx context.Context, to, name string, items []DigestItem, unsubscribeURL string) error

// WithDigest supplies what the digest job needs. Without it the job reports
// itself unavailable rather than failing every run: mail is optional, and a
// deployment without SMTP is a supported deployment.
func (s *Service) WithDigest(sender DigestSender, secret, appDomain string) *Service {
	s.digest = sender
	s.digestSecret = secret
	s.appDomain = strings.TrimRight(appDomain, "/")
	return s
}

// DigestReady reports whether digests can be sent at all.
func (s *Service) DigestReady() bool {
	return s.digest != nil && s.digestSecret != ""
}

// pendingDigest is one person's due mail.
type pendingDigest struct {
	userID      int64
	email       string
	name        string
	deliveryIDs []int64
	skippedIDs  []int64
	items       []DigestItem
}

// SendDueDigests assembles and sends one email per person for everything that
// was not read in time.
//
// Returns how many people were written to. A notification read before its wait
// expired is marked skipped rather than sent: the email existed to catch what
// the application missed, and it did not miss this one.
func (s *Service) SendDueDigests(ctx context.Context) (int, error) {
	if !s.DigestReady() {
		return 0, fmt.Errorf("digest email: %w", apperrors.ErrEmailUnavailable)
	}

	batches, err := s.dueDigests(ctx)
	if err != nil {
		return 0, err
	}

	sent := 0
	for _, batch := range batches {
		if len(batch.skippedIDs) > 0 {
			if err := s.markDeliveries(ctx, batch.skippedIDs, StatusSkipped, ""); err != nil {
				s.log.WithError(err).Error("Failed to mark read notifications as skipped",
					"user_id", batch.userID)
			}
		}
		if len(batch.items) == 0 {
			continue
		}

		token, err := s.UnsubscribeToken(batch.userID)
		if err != nil {
			return sent, err
		}
		unsubscribeURL := fmt.Sprintf("%s/unsubscribe?token=%s", s.appDomain, token)

		if err := s.digest(ctx, batch.email, batch.name, batch.items, unsubscribeURL); err != nil {
			// Recorded against the delivery, not swallowed: "we tried and the
			// server said no" is the answer to "why did nobody hear from us".
			if markErr := s.markDeliveries(ctx, batch.deliveryIDs, "", err.Error()); markErr != nil {
				s.log.WithError(markErr).Error("Failed to record delivery failure", "user_id", batch.userID)
			}
			s.log.WithError(err).Error("Failed to send notification digest", "user_id", batch.userID)
			continue
		}

		if err := s.markDeliveries(ctx, batch.deliveryIDs, StatusSent, ""); err != nil {
			return sent, err
		}
		sent++
	}

	return sent, nil
}

// dueDigests reads everything that is ready to be mailed, grouped by person.
func (s *Service) dueDigests(ctx context.Context) ([]pendingDigest, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT d.id, d.user_id, u.email, COALESCE(u.name, ''),
		        n.title, n.content, COALESCE(n.action_url, ''), n.created_at,
		        n.read_at IS NOT NULL AS already_read
		 FROM notification_deliveries d
		 JOIN notifications n ON n.id = d.notification_id
		 JOIN users u ON u.id = d.user_id
		 WHERE d.channel = $1
		   AND d.status = $2
		   AND d.not_before <= NOW()
		   AND d.attempts < $3
		   AND u.email_unsubscribed_at IS NULL
		   AND u.deleted_at IS NULL
		   AND u.deletion_requested_at IS NULL
		 ORDER BY d.user_id, n.created_at`,
		ChannelEmail, StatusPending, maxAttempts)
	if err != nil {
		return nil, fmt.Errorf("load due digests: %w", err)
	}
	defer rows.Close()

	byUser := map[int64]*pendingDigest{}
	order := []int64{}

	for rows.Next() {
		var (
			deliveryID  int64
			userID      int64
			userEmail   string
			name        string
			item        DigestItem
			alreadyRead bool
		)
		if err := rows.Scan(&deliveryID, &userID, &userEmail, &name,
			&item.Title, &item.Content, &item.ActionURL, &item.CreatedAt, &alreadyRead); err != nil {
			return nil, fmt.Errorf("scan due digest: %w", err)
		}

		batch, ok := byUser[userID]
		if !ok {
			batch = &pendingDigest{userID: userID, email: userEmail, name: name}
			byUser[userID] = batch
			order = append(order, userID)
		}

		if alreadyRead {
			batch.skippedIDs = append(batch.skippedIDs, deliveryID)
			continue
		}
		batch.deliveryIDs = append(batch.deliveryIDs, deliveryID)
		if item.ActionURL != "" && strings.HasPrefix(item.ActionURL, "/") {
			item.ActionURL = s.appDomain + item.ActionURL
		}
		batch.items = append(batch.items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	batches := make([]pendingDigest, 0, len(order))
	for _, userID := range order {
		batches = append(batches, *byUser[userID])
	}
	return batches, nil
}

// markDeliveries records the outcome. An empty status with an error message
// means "attempt made, did not work": the row stays pending until it runs out
// of attempts, and then fails for good.
func (s *Service) markDeliveries(ctx context.Context, ids []int64, status, failure string) error {
	if len(ids) == 0 {
		return nil
	}

	placeholders := make([]string, len(ids))
	args := make([]interface{}, 0, len(ids)+1)
	for i, id := range ids {
		placeholders[i] = "$" + strconv.Itoa(i+1)
		args = append(args, id)
	}

	var query string
	if status != "" {
		args = append(args, status)
		query = fmt.Sprintf(
			`UPDATE notification_deliveries
			 SET status = $%d, attempts = attempts + 1, updated_at = NOW()
			 WHERE id IN (%s)`,
			len(args), strings.Join(placeholders, ", "))
	} else {
		args = append(args, failure, maxAttempts)
		query = fmt.Sprintf(
			`UPDATE notification_deliveries
			 SET attempts = attempts + 1,
			     last_error = $%d,
			     status = CASE WHEN attempts + 1 >= $%d THEN 'failed' ELSE status END,
			     updated_at = NOW()
			 WHERE id IN (%s)`,
			len(args)-1, len(args), strings.Join(placeholders, ", "))
	}

	if _, err := s.db.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("record delivery outcome: %w", err)
	}
	return nil
}

// UnsubscribeToken signs "<user id>.<expiry>" so the link works without a
// session. An unsubscribe that demands a password is not an unsubscribe.
func (s *Service) UnsubscribeToken(userID int64) (string, error) {
	if s.digestSecret == "" {
		return "", fmt.Errorf("unsubscribe token: %w", apperrors.ErrEmailUnavailable)
	}
	payload := strconv.FormatInt(userID, 10) + "." +
		strconv.FormatInt(time.Now().Add(UnsubscribeTTL).Unix(), 10)
	return payload + "." + signDigest(s.digestSecret, payload), nil
}

// Unsubscribe turns off every email for the person the token names.
func (s *Service) Unsubscribe(ctx context.Context, token string) error {
	userID, err := s.userForUnsubscribeToken(token)
	if err != nil {
		return err
	}

	result, err := s.db.ExecContext(ctx,
		`UPDATE users SET email_unsubscribed_at = NOW()
		 WHERE id = $1 AND email_unsubscribed_at IS NULL`, userID)
	if err != nil {
		return fmt.Errorf("record unsubscribe: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		// Already unsubscribed, or no such account. Either way the person's
		// wish is satisfied, and saying which it was would leak whether an
		// address is registered.
		return nil
	}

	// Anything queued stops here. Somebody who has just said "no more email"
	// should not receive the one that was already waiting.
	if _, err := s.db.ExecContext(ctx,
		`UPDATE notification_deliveries SET status = $1, updated_at = NOW()
		 WHERE user_id = $2 AND channel = $3 AND status = $4`,
		StatusSkipped, userID, ChannelEmail, StatusPending); err != nil {
		return fmt.Errorf("cancel queued email: %w", err)
	}

	s.log.LogBusinessEvent("email_unsubscribed", map[string]interface{}{"user_id": userID})
	return nil
}

func (s *Service) userForUnsubscribeToken(token string) (int64, error) {
	if s.digestSecret == "" {
		return 0, fmt.Errorf("unsubscribe token: %w", apperrors.ErrEmailUnavailable)
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, fmt.Errorf("malformed unsubscribe token: %w", apperrors.ErrTokenInvalid)
	}

	payload := parts[0] + "." + parts[1]
	// Constant time: an early return tells a forger how much of a signature
	// was right.
	if !hmac.Equal([]byte(signDigest(s.digestSecret, payload)), []byte(parts[2])) {
		return 0, fmt.Errorf("unsubscribe token signature mismatch: %w", apperrors.ErrTokenInvalid)
	}

	expiry, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("malformed unsubscribe token expiry: %w", apperrors.ErrTokenInvalid)
	}
	if time.Now().After(time.Unix(expiry, 0)) {
		return 0, fmt.Errorf("unsubscribe token expired: %w", apperrors.ErrTokenExpired)
	}

	userID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("malformed unsubscribe token subject: %w", apperrors.ErrTokenInvalid)
	}
	return userID, nil
}

func signDigest(secret, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// PurgeDeliveries drops delivery history that no longer answers a question.
func (s *Service) PurgeDeliveries(ctx context.Context, olderThan time.Duration) (int64, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM notification_deliveries
		 WHERE status <> $1 AND updated_at < $2`,
		StatusPending, time.Now().Add(-olderThan))
	if err != nil {
		return 0, fmt.Errorf("purge deliveries: %w", err)
	}
	return result.RowsAffected()
}
