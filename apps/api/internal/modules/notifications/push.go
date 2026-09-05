package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/burcev/api/internal/shared/apperrors"
)

// PushConfig is what a browser's push service demands before it will accept
// anything: both halves of the key pair and a way to contact whoever is
// sending.
type PushConfig struct {
	PublicKey  string
	PrivateKey string
	// Subject is a mailto: or https: address. A push service that finds a
	// problem with our messages needs somebody to tell.
	Subject string
}

// pushTTL is how long a push service keeps trying to hand a message to a
// browser that is offline. A day: longer, and somebody opening their laptop
// after a week is greeted by stale news.
const pushTTL = 24 * time.Hour

// maxPushFailures bounds how long a subscription that keeps failing without
// ever saying "gone" is kept.
const maxPushFailures = 5

// PushSubscription is one browser that has agreed to be interrupted.
type PushSubscription struct {
	Endpoint  string `json:"endpoint"`
	P256dh    string `json:"p256dh"`
	Auth      string `json:"auth"`
	UserAgent string `json:"userAgent,omitempty"`
}

// WithPush supplies the key pair. Without it the push channel reports itself
// unavailable rather than failing silently.
func (s *Service) WithPush(cfg PushConfig) *Service {
	s.push = cfg
	return s
}

// PushReady reports whether a push can be sent at all.
func (s *Service) PushReady() bool {
	return s.push.PublicKey != "" && s.push.PrivateKey != "" && s.push.Subject != ""
}

// PushPublicKey is what the browser needs to subscribe.
func (s *Service) PushPublicKey() string {
	return s.push.PublicKey
}

// Subscribe records where a browser can be reached.
//
// Keyed on the endpoint the push service issued, so the same browser
// re-subscribing replaces its row. Browsers rotate endpoints on their own, and
// a table that only ever grows is a table of addresses nobody can deliver to.
func (s *Service) Subscribe(ctx context.Context, userID int64, sub PushSubscription) error {
	if !s.PushReady() {
		return fmt.Errorf("web push: %w", apperrors.ErrEmailUnavailable)
	}
	if sub.Endpoint == "" || sub.P256dh == "" || sub.Auth == "" {
		return fmt.Errorf("incomplete push subscription: %w", apperrors.ErrValidation)
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (endpoint) DO UPDATE
		 SET user_id = EXCLUDED.user_id,
		     p256dh = EXCLUDED.p256dh,
		     auth = EXCLUDED.auth,
		     user_agent = EXCLUDED.user_agent,
		     failures = 0`,
		userID, sub.Endpoint, sub.P256dh, sub.Auth, nullIfEmpty(sub.UserAgent))
	if err != nil {
		return fmt.Errorf("store push subscription: %w", err)
	}
	return nil
}

// Unsubscribepush forgets one browser.
func (s *Service) UnsubscribePush(ctx context.Context, userID int64, endpoint string) error {
	if endpoint == "" {
		return fmt.Errorf("no endpoint given: %w", apperrors.ErrValidation)
	}
	// Scoped by user id: an endpoint is not a secret, and without this anybody
	// holding one could unsubscribe somebody else's browser.
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
		userID, endpoint); err != nil {
		return fmt.Errorf("delete push subscription: %w", err)
	}
	return nil
}

// pushPayload is what the service worker receives.
type pushPayload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url,omitempty"`
	Tag   string `json:"tag,omitempty"`
}

// SendDuePushes delivers every push that is due.
//
// Returns how many browsers were reached. A subscription the push service says
// is gone is deleted on the spot: keeping it would mean retrying an address
// that will never work again.
func (s *Service) SendDuePushes(ctx context.Context) (int, error) {
	if !s.PushReady() {
		return 0, fmt.Errorf("web push: %w", apperrors.ErrEmailUnavailable)
	}

	due, err := s.duePushes(ctx)
	if err != nil {
		return 0, err
	}

	delivered := 0
	for _, item := range due {
		subscriptions, err := s.subscriptionsFor(ctx, item.userID)
		if err != nil {
			return delivered, err
		}
		if len(subscriptions) == 0 {
			// Nobody to reach. Not a failure: the person turned push on once
			// and has since cleared their browser.
			if err := s.markDeliveries(ctx, []int64{item.deliveryID}, StatusSkipped, ""); err != nil {
				return delivered, err
			}
			continue
		}

		payload, err := json.Marshal(pushPayload{
			Title: item.title,
			Body:  item.content,
			URL:   item.actionURL,
			// Same notification, same tag: a browser that receives it twice
			// shows one banner rather than two.
			Tag: item.notificationID,
		})
		if err != nil {
			return delivered, fmt.Errorf("encode push payload: %w", err)
		}

		reached := false
		var lastErr error
		for _, subscription := range subscriptions {
			if err := s.sendOnePush(ctx, subscription, payload); err != nil {
				lastErr = err
				continue
			}
			reached = true
		}

		if reached {
			if err := s.markDeliveries(ctx, []int64{item.deliveryID}, StatusSent, ""); err != nil {
				return delivered, err
			}
			delivered++
			continue
		}

		message := "no subscription accepted the push"
		if lastErr != nil {
			message = lastErr.Error()
		}
		if err := s.markDeliveries(ctx, []int64{item.deliveryID}, "", message); err != nil {
			return delivered, err
		}
	}

	return delivered, nil
}

// duePush is one pending push delivery with the notification behind it.
type duePush struct {
	deliveryID     int64
	userID         int64
	notificationID string
	title          string
	content        string
	actionURL      string
}

func (s *Service) duePushes(ctx context.Context) ([]duePush, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT d.id, d.user_id, n.id, n.title, n.content, COALESCE(n.action_url, '')
		 FROM notification_deliveries d
		 JOIN notifications n ON n.id = d.notification_id
		 JOIN users u ON u.id = d.user_id
		 WHERE d.channel = $1
		   AND d.status = $2
		   AND d.not_before <= NOW()
		   AND d.attempts < $3
		   AND n.read_at IS NULL
		   AND u.deleted_at IS NULL
		   AND u.deletion_requested_at IS NULL
		 ORDER BY d.not_before`,
		ChannelPush, StatusPending, maxAttempts)
	if err != nil {
		return nil, fmt.Errorf("load due pushes: %w", err)
	}
	defer rows.Close()

	due := []duePush{}
	for rows.Next() {
		var item duePush
		if err := rows.Scan(&item.deliveryID, &item.userID, &item.notificationID,
			&item.title, &item.content, &item.actionURL); err != nil {
			return nil, fmt.Errorf("scan due push: %w", err)
		}
		due = append(due, item)
	}
	return due, rows.Err()
}

func (s *Service) subscriptionsFor(ctx context.Context, userID int64) ([]PushSubscription, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, userID)
	if err != nil {
		return nil, fmt.Errorf("load push subscriptions: %w", err)
	}
	defer rows.Close()

	subscriptions := []PushSubscription{}
	for rows.Next() {
		var sub PushSubscription
		if err := rows.Scan(&sub.Endpoint, &sub.P256dh, &sub.Auth); err != nil {
			return nil, fmt.Errorf("scan push subscription: %w", err)
		}
		subscriptions = append(subscriptions, sub)
	}
	return subscriptions, rows.Err()
}

// errSubscriptionGone marks a subscription the push service has retired.
var errSubscriptionGone = errors.New("push subscription is gone")

func (s *Service) sendOnePush(ctx context.Context, sub PushSubscription, payload []byte) error {
	response, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		Subscriber:      s.push.Subject,
		VAPIDPublicKey:  s.push.PublicKey,
		VAPIDPrivateKey: s.push.PrivateKey,
		TTL:             int(pushTTL.Seconds()),
		Urgency:         webpush.UrgencyNormal,
	})
	if err != nil {
		s.recordPushFailure(ctx, sub.Endpoint)
		return fmt.Errorf("send push: %w", err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, response.Body)
		_ = response.Body.Close()
	}()

	switch {
	case response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusGone:
		// The push service is telling us this browser is never coming back.
		// Keeping the row would mean retrying an address that cannot work.
		s.deleteSubscription(ctx, sub.Endpoint)
		return errSubscriptionGone
	case response.StatusCode >= 400:
		s.recordPushFailure(ctx, sub.Endpoint)
		return fmt.Errorf("push service answered %d", response.StatusCode)
	}

	if _, err := s.db.ExecContext(ctx,
		`UPDATE push_subscriptions SET last_used_at = NOW(), failures = 0 WHERE endpoint = $1`,
		sub.Endpoint); err != nil {
		s.log.WithError(err).Error("Failed to record a successful push")
	}
	return nil
}

func (s *Service) deleteSubscription(ctx context.Context, endpoint string) {
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM push_subscriptions WHERE endpoint = $1`, endpoint); err != nil {
		s.log.WithError(err).Error("Failed to delete a retired push subscription")
	}
}

func (s *Service) recordPushFailure(ctx context.Context, endpoint string) {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE push_subscriptions SET failures = failures + 1 WHERE endpoint = $1`,
		endpoint); err != nil {
		s.log.WithError(err).Error("Failed to record a push failure")
	}
}

// PurgeDeadSubscriptions drops browsers that have stopped answering.
//
// A subscription that has failed repeatedly without the push service ever
// saying "gone" is a browser that will not come back either; so is one that has
// never accepted anything since the day it was created.
func (s *Service) PurgeDeadSubscriptions(ctx context.Context, unusedFor time.Duration) (int64, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM push_subscriptions
		 WHERE failures >= $1
		    OR COALESCE(last_used_at, created_at) < $2`,
		maxPushFailures, time.Now().Add(-unusedFor))
	if err != nil {
		return 0, fmt.Errorf("purge push subscriptions: %w", err)
	}
	return result.RowsAffected()
}

func nullIfEmpty(value string) interface{} {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
