package notifications

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
)

// Transports of the push channel.
const (
	transportWebPush = "webpush"
	transportAPNs    = "apns"
)

// pushRetryDelay spaces the attempts of one addressee. APNs answering 503 is
// rarely fixed in the fifteen seconds between two runs of the sender.
const pushRetryDelay = time.Minute

// badgeInterval is the most often one iPhone receives a silent badge update.
const badgeInterval = time.Minute

// maxDuePushes bounds one run of the sender; the rest waits for the next.
const maxDuePushes = 500

// Presence says whether a person has the application open right now — a live
// WebSocket connection on this instance. A chat message to somebody who is
// looking at it needs no push.
//
// One instance today; with more, this moves to a shared registry (design.md,
// Risks).
type Presence interface {
	IsConnected(userID int64) bool
}

// WithPresence connects the WebSocket hub. Without it every recipient counts as
// absent.
func (s *Service) WithPresence(presence Presence) *Service {
	s.presence = presence
	return s
}

// pushSource is what a push is about: a notification or a chat message.
type pushSource struct {
	notificationID string
	chatMessageID  string
}

// queuePushes records one push job per Web Push subscription and per active
// iPhone of the recipient. Returns how many it queued.
//
// Web Push in quiet hours waits until they end. An iPhone does not wait: it is
// sent at once, silently (see pushMessage.passive).
func (s *Service) queuePushes(ctx context.Context, q execQueryer, source pushSource, userID int64, r *recipient, now time.Time) (int, error) {
	var subscriptionIDs []int64
	if s.PushReady() {
		ids, err := idsOf(ctx, q, `SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY id`, userID)
		if err != nil {
			return 0, fmt.Errorf("load push subscriptions: %w", err)
		}
		subscriptionIDs = ids
	}
	var devices []pushDevice
	if s.APNSReady() {
		list, err := s.devicesFor(ctx, q, userID)
		if err != nil {
			return 0, err
		}
		devices = list
	}

	notificationID := nullIfEmpty(source.notificationID)
	chatMessageID := nullIfEmpty(source.chatMessageID)
	webPushAt := r.afterQuietHours(now)
	for _, id := range subscriptionIDs {
		if _, err := q.ExecContext(ctx,
			`INSERT INTO push_deliveries (notification_id, chat_message_id, user_id, transport, subscription_id, not_before)
			 VALUES ($1, $2, $3, 'webpush', $4, $5)`,
			notificationID, chatMessageID, userID, id, webPushAt); err != nil {
			return 0, fmt.Errorf("queue web push: %w", err)
		}
	}
	for _, device := range devices {
		if _, err := q.ExecContext(ctx,
			`INSERT INTO push_deliveries (notification_id, chat_message_id, user_id, transport, device_id, not_before)
			 VALUES ($1, $2, $3, 'apns', $4, $5)`,
			notificationID, chatMessageID, userID, device.id, now); err != nil {
			return 0, fmt.Errorf("queue APNs push: %w", err)
		}
	}
	return len(subscriptionIDs) + len(devices), nil
}

type execQueryer interface {
	queryer
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func idsOf(ctx context.Context, q queryer, query string, args ...any) ([]int64, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ChatMessageSent queues a push about a new chat message for the other
// participant (chat-message-push).
//
// Nothing is queued when the recipient has the application open — the message
// arrives over the socket — or has turned push off for chat messages. No row
// goes into notifications: the chat has its own feed and unread counter.
//
// Best effort: the message is already saved, and a push that cannot be queued
// must not fail the person sending it. Errors go to the log.
func (s *Service) ChatMessageSent(ctx context.Context, messageID string) {
	if err := s.queueChatPush(ctx, messageID); err != nil {
		s.log.Warn("Failed to queue a chat message push", "message_id", messageID, "error", err)
	}
}

func (s *Service) queueChatPush(ctx context.Context, messageID string) error {
	if !s.anyPushReady() {
		return nil
	}
	var recipientID int64
	var leaving bool
	err := s.db.QueryRowContext(ctx,
		`SELECT u.id, u.deletion_requested_at IS NOT NULL OR u.deleted_at IS NOT NULL
		 FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 JOIN users u ON u.id = CASE WHEN m.sender_id = c.client_id THEN c.curator_id ELSE c.client_id END
		 WHERE m.id = $1 AND c.anonymized_at IS NULL`, messageID).Scan(&recipientID, &leaving)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("find chat recipient: %w", err)
	}
	if leaving {
		return nil
	}

	// The unread count changed either way; a phone in somebody's pocket
	// should show it even while they read in the browser.
	s.UnreadChanged(ctx, recipientID)

	if s.presence != nil && s.presence.IsConnected(recipientID) {
		return nil
	}

	r, err := s.loadRecipient(ctx, s.db, recipientID)
	if err != nil {
		return err
	}
	if !r.allows(TypeChatMessage, ChannelPush) {
		return nil
	}
	_, err = s.queuePushes(ctx, s.db, pushSource{chatMessageID: messageID}, recipientID, r, time.Now())
	return err
}

// UnreadChanged marks the person's iPhones as showing a stale badge. The
// sender follows with a silent update, at most once a minute per phone.
func (s *Service) UnreadChanged(ctx context.Context, userID int64) {
	if !s.APNSReady() {
		return
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE push_devices SET badge_dirty_at = NOW()
		 WHERE user_id = $1 AND disabled_at IS NULL`, userID); err != nil {
		s.log.Warn("Failed to mark the badge stale", "user_id", userID, "error", err)
	}
}

// badgeFor is what the app icon shows: unread notifications of the main
// category plus unread chat messages. Content does not count — a new article
// is not a reason for the icon to turn red.
//
// The chat half mirrors chat.Service.GetUnreadCount; a module import would run
// the wrong way (chat already reaches notifications).
func (s *Service) badgeFor(ctx context.Context, userID int64) (int, error) {
	var badge int
	err := s.db.QueryRowContext(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM notifications
		    WHERE user_id = $1 AND category = 'main' AND read_at IS NULL)
		+ (SELECT COUNT(*)
		     FROM conversations c
		     JOIN messages m ON m.conversation_id = c.id
		    WHERE (c.client_id = $1 OR c.curator_id = $1)
		      AND m.sender_id != $1
		      AND m.created_at > COALESCE(
		          (SELECT last_read_at FROM message_read_status
		            WHERE conversation_id = c.id AND user_id = $1),
		          '1970-01-01'::timestamptz))`, userID).Scan(&badge)
	if err != nil {
		return 0, fmt.Errorf("count badge: %w", err)
	}
	return badge, nil
}

// duePush is one addressee's job with what is needed to reach it.
type duePush struct {
	id             int64
	userID         int64
	transport      string
	notificationID string
	chatMessageID  string
	leaving        bool
	subscription   PushSubscription
	device         pushDevice
	deviceDisabled bool
	// foreign: the browser or phone now belongs to somebody else.
	foreign bool
}

func (s *Service) duePushes(ctx context.Context) ([]duePush, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT p.id, p.user_id, p.transport,
		        COALESCE(p.notification_id::text, ''), COALESCE(p.chat_message_id::text, ''),
		        u.deleted_at IS NOT NULL OR u.deletion_requested_at IS NOT NULL,
		        COALESCE(s.endpoint, ''), COALESCE(s.p256dh, ''), COALESCE(s.auth, ''),
		        COALESCE(d.id, 0), COALESCE(d.token, ''), COALESCE(d.environment, ''),
		        d.disabled_at IS NOT NULL,
		        COALESCE(d.user_id <> p.user_id, FALSE) OR COALESCE(s.user_id <> p.user_id, FALSE)
		 FROM push_deliveries p
		 JOIN users u ON u.id = p.user_id
		 LEFT JOIN push_subscriptions s ON s.id = p.subscription_id
		 LEFT JOIN push_devices d ON d.id = p.device_id
		 WHERE p.status = $1 AND p.not_before <= NOW() AND p.attempts < $2
		 ORDER BY p.not_before, p.id
		 LIMIT $3`, StatusPending, maxAttempts, maxDuePushes)
	if err != nil {
		return nil, fmt.Errorf("load due pushes: %w", err)
	}
	defer rows.Close()
	due := []duePush{}
	for rows.Next() {
		var d duePush
		if err := rows.Scan(&d.id, &d.userID, &d.transport, &d.notificationID, &d.chatMessageID, &d.leaving,
			&d.subscription.Endpoint, &d.subscription.P256dh, &d.subscription.Auth,
			&d.device.id, &d.device.token, &d.device.environment, &d.deviceDisabled, &d.foreign); err != nil {
			return nil, fmt.Errorf("scan due push: %w", err)
		}
		due = append(due, d)
	}
	return due, rows.Err()
}

// errPushStale marks a job whose subject was read before it was sent.
var errPushStale = errors.New("already read")

// pushRun caches what one run of the sender reads more than once.
type pushRun struct {
	recipients map[int64]*recipient
	badges     map[int64]int
	messages   map[string]pushMessage
}

// SendDuePushes delivers every push job that is due, then the silent badge
// updates.
//
// Each addressee is its own job: a browser reached is not reached again when
// the phone's attempt is retried. The notification's push row in
// notification_deliveries is the summary — sent once any addressee got it.
//
// Returns how many addressees were reached.
func (s *Service) SendDuePushes(ctx context.Context) (int, error) {
	if !s.anyPushReady() {
		return 0, fmt.Errorf("push: %w", apperrors.ErrFeatureUnavailable)
	}
	due, err := s.duePushes(ctx)
	if err != nil {
		return 0, err
	}

	run := &pushRun{recipients: map[int64]*recipient{}, badges: map[int64]int{}, messages: map[string]pushMessage{}}
	summaries := map[string]bool{}
	reached := 0
	for _, item := range due {
		if item.notificationID != "" {
			summaries[item.notificationID] = true
		}
		ok, err := s.deliverPush(ctx, run, item)
		if err != nil {
			return reached, err
		}
		if ok {
			reached++
		}
	}
	for notificationID := range summaries {
		if err := s.summarisePush(ctx, notificationID); err != nil {
			return reached, err
		}
	}
	if _, err := s.SendBadgeUpdates(ctx); err != nil {
		return reached, err
	}
	return reached, nil
}

// deliverPush sends one job and records the outcome. The error is for the
// database only; a refusal by a push service is an outcome, not an error.
func (s *Service) deliverPush(ctx context.Context, run *pushRun, item duePush) (bool, error) {
	// A phone or browser that changed hands since the job was queued: the
	// text was written for the previous owner. Registration cancels these
	// already; this is the second lock.
	if item.leaving || item.foreign {
		return false, s.markPush(ctx, item.id, StatusCancelled, "")
	}
	if item.transport == transportAPNs && (item.deviceDisabled || !s.APNSReady()) {
		return false, s.markPush(ctx, item.id, StatusSkipped, "")
	}
	if item.transport == transportWebPush && !s.PushReady() {
		return false, s.markPush(ctx, item.id, StatusSkipped, "")
	}

	message, err := s.messageFor(ctx, run, item)
	if errors.Is(err, errPushStale) {
		// Read in the browser, or anywhere, before the push went out: a banner
		// about something already seen is noise.
		return false, s.markPush(ctx, item.id, StatusCancelled, "")
	}
	if err != nil {
		return false, err
	}

	if item.transport == transportWebPush {
		payload, err := newWebPushPayload(message)
		if err != nil {
			return false, fmt.Errorf("encode web push: %w", err)
		}
		if err := s.sendOnePush(ctx, item.subscription, payload); err != nil {
			if errors.Is(err, errSubscriptionGone) {
				// The subscription row is gone and the job with it (cascade).
				return false, nil
			}
			return false, s.retryPush(ctx, item.id, err.Error())
		}
		return true, s.markPush(ctx, item.id, StatusSent, "")
	}

	payload, err := newAPNSPayload(message)
	if err != nil {
		return false, fmt.Errorf("encode APNs payload: %w", err)
	}
	result, err := s.apns.send(ctx, item.device, apnsMessage{payload: payload, collapseID: message.notificationID})
	switch {
	case err != nil:
		s.recordDeviceFailure(ctx, item.device.id)
		return false, s.retryPush(ctx, item.id, err.Error())
	case result.status == http.StatusOK:
		// The push carried the badge counted a moment ago: the phone is up to
		// date unless something changed since.
		if _, err := s.db.ExecContext(ctx,
			`UPDATE push_devices
			 SET last_used_at = NOW(), failures = 0,
			     badge_dirty_at = CASE WHEN badge_dirty_at <= $2 THEN NULL ELSE badge_dirty_at END
			 WHERE id = $1`, item.device.id, message.countedAt); err != nil {
			s.log.WithError(err).Error("Failed to record a successful APNs push")
		}
		return true, s.markPush(ctx, item.id, StatusSent, "")
	case result.gone():
		// The app was removed, or the token belongs to another environment
		// or app: no retry can work, and nothing more goes to this device
		// until it registers again.
		s.disableDevice(ctx, item.device.id)
		return false, s.markPush(ctx, item.id, StatusFailed, fmt.Sprintf("APNs: %d %s", result.status, result.reason))
	default:
		s.recordDeviceFailure(ctx, item.device.id)
		return false, s.retryPush(ctx, item.id, fmt.Sprintf("APNs answered %d %s", result.status, result.reason))
	}
}

// messageFor builds what the push says, from the notification or the chat
// message behind the job, with the badge and quiet hours of its recipient.
func (s *Service) messageFor(ctx context.Context, run *pushRun, item duePush) (pushMessage, error) {
	key := item.notificationID + item.chatMessageID + ":" + strconv.FormatInt(item.userID, 10)
	message, cached := run.messages[key]
	if !cached {
		var err error
		if item.notificationID != "" {
			message, err = s.notificationMessage(ctx, item.notificationID)
		} else {
			message, err = s.chatMessage(ctx, run, item.chatMessageID, item.userID)
		}
		if err != nil {
			return pushMessage{}, err
		}
		badge, ok := run.badges[item.userID]
		if !ok {
			if badge, err = s.badgeFor(ctx, item.userID); err != nil {
				return pushMessage{}, err
			}
			run.badges[item.userID] = badge
		}
		message.badge = badge
		message.countedAt = time.Now()
		r, err := s.recipientFor(ctx, run, item.userID)
		if err != nil {
			return pushMessage{}, err
		}
		message.passive, _, _ = r.inQuietHours(time.Now())
		run.messages[key] = message
	}
	return message, nil
}

func (s *Service) recipientFor(ctx context.Context, run *pushRun, userID int64) (*recipient, error) {
	if r, ok := run.recipients[userID]; ok {
		return r, nil
	}
	r, err := s.loadRecipient(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	run.recipients[userID] = r
	return r, nil
}

func (s *Service) notificationMessage(ctx context.Context, notificationID string) (pushMessage, error) {
	var m pushMessage
	var read bool
	err := s.db.QueryRowContext(ctx,
		`SELECT id, type, title, content, COALESCE(action_url, ''), target, read_at IS NOT NULL
		 FROM notifications WHERE id = $1`, notificationID).
		Scan(&m.notificationID, &m.notificationType, &m.title, &m.body, &m.actionURL, &m.target, &read)
	if errors.Is(err, sql.ErrNoRows) {
		return pushMessage{}, errPushStale
	}
	if err != nil {
		return pushMessage{}, fmt.Errorf("load pushed notification: %w", err)
	}
	if read {
		return pushMessage{}, errPushStale
	}
	return m, nil
}

// chatMessage builds the push about a chat message for its recipient, or
// errPushStale if they have read the conversation since it was sent.
func (s *Service) chatMessage(ctx context.Context, run *pushRun, messageID string, recipientID int64) (pushMessage, error) {
	var (
		conversationID, messageType, content, senderName string
		senderID, clientID                               int64
		read                                             bool
	)
	err := s.db.QueryRowContext(ctx,
		`SELECT m.conversation_id::text, m.sender_id, c.client_id, m.type, COALESCE(m.content, ''),
		        COALESCE(NULLIF(TRIM(u.name), ''), ''),
		        EXISTS (SELECT 1 FROM message_read_status r
		                 WHERE r.conversation_id = m.conversation_id AND r.user_id = $2
		                   AND r.last_read_at >= m.created_at)
		 FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 JOIN users u ON u.id = m.sender_id
		 WHERE m.id = $1`, messageID, recipientID).
		Scan(&conversationID, &senderID, &clientID, &messageType, &content, &senderName, &read)
	if errors.Is(err, sql.ErrNoRows) {
		return pushMessage{}, errPushStale
	}
	if err != nil {
		return pushMessage{}, fmt.Errorf("load pushed chat message: %w", err)
	}
	if read {
		return pushMessage{}, errPushStale
	}
	r, err := s.recipientFor(ctx, run, recipientID)
	if err != nil {
		return pushMessage{}, err
	}

	title := senderName
	if title == "" {
		title = chatUnnamed
	}
	// The web path for the browser: a client has one conversation, a curator
	// opens it by client.
	actionURL := "/chat"
	if recipientID != clientID {
		actionURL = "/curator/chat/" + strconv.FormatInt(clientID, 10)
	}
	return pushMessage{
		notificationType: TypeChatMessage,
		title:            title,
		body:             chatBody(messageType, content, title, r.showMessageText),
		actionURL:        actionURL,
		target: Target{Kind: TargetChat, IDs: IDs{
			"conversation_id": conversationID,
			"participant_id":  strconv.FormatInt(senderID, 10),
		}},
	}, nil
}

// markPush records a final outcome.
func (s *Service) markPush(ctx context.Context, id int64, status, failure string) error {
	attempts := 0
	if status == StatusSent || status == StatusFailed {
		attempts = 1
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE push_deliveries
		 SET status = $2, attempts = attempts + $3, last_error = COALESCE(NULLIF($4, ''), last_error), updated_at = NOW()
		 WHERE id = $1`, id, status, attempts, failure); err != nil {
		return fmt.Errorf("record push outcome: %w", err)
	}
	return nil
}

// retryPush records a failed attempt. The job is tried again a minute later,
// and gives up after maxAttempts, as every channel does.
func (s *Service) retryPush(ctx context.Context, id int64, failure string) error {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE push_deliveries
		 SET attempts = attempts + 1,
		     last_error = $2,
		     status = CASE WHEN attempts + 1 >= $3 THEN 'failed' ELSE status END,
		     not_before = NOW() + $4::interval,
		     updated_at = NOW()
		 WHERE id = $1`,
		id, failure, maxAttempts, fmt.Sprintf("%d seconds", int(pushRetryDelay.Seconds()))); err != nil {
		return fmt.Errorf("record push failure: %w", err)
	}
	return nil
}

// summarisePush brings the notification's push row in notification_deliveries
// up to date with its addressees: sent once any of them got the push, pending
// while any is still due, skipped when every job was cancelled or skipped,
// failed otherwise.
func (s *Service) summarisePush(ctx context.Context, notificationID string) error {
	return summarisePush(ctx, s.db, notificationID)
}

func summarisePush(ctx context.Context, q execQueryer, notificationID string) error {
	if _, err := q.ExecContext(ctx, `
		UPDATE notification_deliveries d
		SET status = CASE
		        WHEN EXISTS (SELECT 1 FROM push_deliveries p WHERE p.notification_id = d.notification_id AND p.status = 'sent') THEN 'sent'
		        WHEN EXISTS (SELECT 1 FROM push_deliveries p WHERE p.notification_id = d.notification_id AND p.status = 'pending') THEN 'pending'
		        WHEN EXISTS (SELECT 1 FROM push_deliveries p WHERE p.notification_id = d.notification_id AND p.status = 'failed') THEN 'failed'
		        ELSE 'skipped'
		    END,
		    attempts = COALESCE((SELECT MAX(p.attempts) FROM push_deliveries p WHERE p.notification_id = d.notification_id), d.attempts),
		    last_error = COALESCE((SELECT p.last_error FROM push_deliveries p
		                            WHERE p.notification_id = d.notification_id AND p.last_error IS NOT NULL
		                            ORDER BY p.updated_at DESC LIMIT 1), d.last_error),
		    updated_at = NOW()
		WHERE d.notification_id = $1 AND d.channel = 'push' AND d.status = 'pending'`, notificationID); err != nil {
		return fmt.Errorf("summarise push delivery: %w", err)
	}
	return nil
}

type staleDevice struct {
	device pushDevice
	userID int64
}

func (s *Service) staleBadges(ctx context.Context) ([]staleDevice, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT d.id, d.user_id, d.token, d.environment
		 FROM push_devices d
		 JOIN users u ON u.id = d.user_id
		 WHERE d.badge_dirty_at IS NOT NULL AND d.disabled_at IS NULL
		   AND (d.badge_pushed_at IS NULL OR d.badge_pushed_at <= NOW() - $1::interval)
		   AND u.deleted_at IS NULL AND u.deletion_requested_at IS NULL
		 ORDER BY d.badge_dirty_at
		 LIMIT $2`, fmt.Sprintf("%d seconds", int(badgeInterval.Seconds())), maxDuePushes)
	if err != nil {
		return nil, fmt.Errorf("load stale badges: %w", err)
	}
	defer rows.Close()
	stale := []staleDevice{}
	for rows.Next() {
		var d staleDevice
		if err := rows.Scan(&d.device.id, &d.userID, &d.device.token, &d.device.environment); err != nil {
			return nil, fmt.Errorf("scan stale badge: %w", err)
		}
		stale = append(stale, d)
	}
	return stale, rows.Err()
}

// SendBadgeUpdates sends the silent badge update to every iPhone whose badge
// went stale, at most once a minute per phone. A phone updated less than a
// minute ago keeps its mark and is picked up by a later run.
func (s *Service) SendBadgeUpdates(ctx context.Context) (int, error) {
	if !s.APNSReady() {
		return 0, nil
	}
	stale, err := s.staleBadges(ctx)
	if err != nil {
		return 0, err
	}

	sent := 0
	for _, d := range stale {
		countedAt := time.Now()
		badge, err := s.badgeFor(ctx, d.userID)
		if err != nil {
			return sent, err
		}
		payload, err := newBadgePayload(badge)
		if err != nil {
			return sent, err
		}
		result, err := s.apns.send(ctx, d.device, apnsMessage{payload: payload, background: true})
		switch {
		case err != nil:
			// Left stale: the next run tries again.
			s.log.Warn("Silent badge update failed", "device_id", d.device.id, "error", err)
			continue
		case result.gone():
			s.disableDevice(ctx, d.device.id)
			continue
		case result.status != http.StatusOK:
			s.log.Warn("APNs refused a silent badge update",
				"device_id", d.device.id, "status", result.status, "reason", result.reason)
			continue
		}
		if _, err := s.db.ExecContext(ctx,
			`UPDATE push_devices
			 SET badge_pushed_at = NOW(),
			     badge_dirty_at = CASE WHEN badge_dirty_at <= $2 THEN NULL ELSE badge_dirty_at END
			 WHERE id = $1`, d.device.id, countedAt); err != nil {
			return sent, fmt.Errorf("record badge update: %w", err)
		}
		sent++
	}
	return sent, nil
}
