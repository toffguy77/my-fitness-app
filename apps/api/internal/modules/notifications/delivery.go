package notifications

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// Channel is a way of reaching somebody.
type Channel string

const (
	// ChannelApp is the notification list inside the application. It cannot be
	// turned off: it is the record of what happened, not a way of interrupting
	// anybody.
	ChannelApp Channel = "app"
	// ChannelEmail is the digest. One message covering everything that went
	// unread, not one message per event.
	ChannelEmail Channel = "email"
	// ChannelPush reaches a browser that agreed to be interrupted. It is the
	// immediate channel: it exists to arrive before somebody opens the
	// application, so unlike email it does not wait.
	ChannelPush Channel = "push"
)

// Delivery statuses.
const (
	StatusPending = "pending"
	StatusSent    = "sent"
	StatusFailed  = "failed"
	StatusSkipped = "skipped"
)

// defaultEmailDelay is how long a notification is given to be read in the
// application before it is worth an email. Somebody who is using the app right
// now has already seen it, and mail they did not need is how a sender loses the
// reputation its password resets depend on.
//
// Adjustable, because the right wait depends on how people use the product —
// and because a test cannot spend half an hour finding out whether the mail
// ever leaves.
const defaultEmailDelay = 30 * time.Minute

// EmailDelay is the wait this service uses.
func (s *Service) EmailDelay() time.Duration {
	if s.emailDelay <= 0 {
		return defaultEmailDelay
	}
	return s.emailDelay
}

// WithEmailDelay overrides how long a notification waits before it is mailed.
func (s *Service) WithEmailDelay(delay time.Duration) *Service {
	s.emailDelay = delay
	return s
}

// maxAttempts bounds retries of one delivery. A message that has failed three
// times is failing for a reason that another attempt will not fix.
const maxAttempts = 3

// defaultChannels says which channels an event type may use when the person has
// expressed no preference.
//
// The rule behind the table: mail is for something that has a deadline or that
// somebody else is waiting on. Everything else waits until they next open the
// application, because it can.
var defaultChannels = map[NotificationType][]Channel{
	// Somebody is waiting for an answer.
	TypeTrainerFeedback:  {ChannelApp, ChannelEmail, ChannelPush},
	TypeFeedbackReceived: {ChannelApp, ChannelEmail, ChannelPush},
	TypePlanUpdated:      {ChannelApp, ChannelEmail, ChannelPush},
	TypeTaskAssigned:     {ChannelApp, ChannelEmail, ChannelPush},
	TypeTaskOverdue:      {ChannelApp, ChannelEmail, ChannelPush},
	// The archive expires. An unread notice means a wasted build and a person
	// who has to ask again.
	TypeExportReady: {ChannelApp, ChannelEmail},
	// A curator plans around a client; finding out by noticing an absence is
	// worse than an email.
	TypeClientLeft: {ChannelApp, ChannelEmail},
	// Nothing here has a deadline.
	TypeReminder:     {ChannelApp, ChannelPush},
	TypeAchievement:  {ChannelApp},
	TypeSystemUpdate: {ChannelApp},
	TypeNewFeature:   {ChannelApp},
	TypeGeneral:      {ChannelApp},
	TypeNewContent:   {ChannelApp},
}

// channelsFor returns the default channels for a type, falling back to the
// application alone. An event type nobody has classified must not start
// mailing people by accident.
func channelsFor(notificationType NotificationType) []Channel {
	if channels, ok := defaultChannels[notificationType]; ok {
		return channels
	}
	return []Channel{ChannelApp}
}

// deliveryPlan is what the delivery layer decided for one notification.
type deliveryPlan struct {
	channel   Channel
	status    string
	notBefore time.Time
}

// recipient is the part of a person's settings that decides delivery.
type recipient struct {
	timezone         string
	quietStart       sql.NullInt16
	quietEnd         sql.NullInt16
	emailUnsubscribe sql.NullTime
	// preferences holds only the deliberate choices: "type:channel" -> enabled.
	preferences map[string]bool
}

// loadRecipient reads the settings that decide where a notification goes.
func (s *Service) loadRecipient(ctx context.Context, tx *sql.Tx, userID int64) (*recipient, error) {
	r := &recipient{preferences: map[string]bool{}}

	// The timezone lives on user_settings, the rest on users. Reading it from
	// the wrong table cost every notification: loadRecipient failed, so
	// planDelivery failed, so CreateNotification rolled back — and nobody was
	// told anything at all, silently, because every caller logs and carries on.
	//
	// LEFT JOIN because an account can exist before its settings row does.
	err := tx.QueryRowContext(ctx,
		`SELECT COALESCE(s.timezone, 'Europe/Moscow'),
		        u.quiet_hours_start, u.quiet_hours_end, u.email_unsubscribed_at
		 FROM users u
		 LEFT JOIN user_settings s ON s.user_id = u.id
		 WHERE u.id = $1`, userID).
		Scan(&r.timezone, &r.quietStart, &r.quietEnd, &r.emailUnsubscribe)
	if err != nil {
		return nil, fmt.Errorf("load recipient: %w", err)
	}

	rows, err := tx.QueryContext(ctx,
		`SELECT type, channel, enabled FROM notification_preferences WHERE user_id = $1`, userID)
	if err != nil {
		return nil, fmt.Errorf("load notification preferences: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var t, channel string
		var enabled bool
		if err := rows.Scan(&t, &channel, &enabled); err != nil {
			return nil, fmt.Errorf("scan notification preference: %w", err)
		}
		r.preferences[t+":"+channel] = enabled
	}
	return r, rows.Err()
}

// allows reports whether this channel may carry this event type.
func (r *recipient) allows(notificationType NotificationType, channel Channel) bool {
	// The application list is the record of what happened. Turning it off would
	// mean events with nowhere to go.
	if channel == ChannelApp {
		return true
	}
	if channel == ChannelEmail && r.emailUnsubscribe.Valid {
		return false
	}
	if choice, ok := r.preferences[string(notificationType)+":"+string(channel)]; ok {
		return choice
	}
	for _, c := range channelsFor(notificationType) {
		if c == channel {
			return true
		}
	}
	return false
}

// afterQuietHours moves a send past the hours somebody asked not to be
// disturbed in. It delays; it never drops. A notice that arrives in the morning
// is late, a notice that never arrives is a bug.
func (r *recipient) afterQuietHours(at time.Time) time.Time {
	if !r.quietStart.Valid || !r.quietEnd.Valid {
		return at
	}
	start, end := int(r.quietStart.Int16), int(r.quietEnd.Int16)
	if start == end {
		return at
	}

	location, err := time.LoadLocation(r.timezone)
	if err != nil {
		// An unknown timezone is not a reason to hold the message.
		return at
	}

	local := at.In(location)
	hour := local.Hour()

	quiet := start < end && hour >= start && hour < end
	// Quiet hours that wrap midnight (22:00–08:00).
	if start > end {
		quiet = hour >= start || hour < end
	}
	if !quiet {
		return at
	}

	wake := time.Date(local.Year(), local.Month(), local.Day(), end, 0, 0, 0, location)
	if !wake.After(local) {
		wake = wake.AddDate(0, 0, 1)
	}
	return wake.UTC()
}

// planDelivery decides the channels for a notification and records one row per
// channel, in the caller's transaction.
//
// It runs with the notification's own insert so that a notification always has
// a delivery record. Sending happens later, in a job: a person creating a
// notification is doing something else, and must not wait for SMTP.
func (s *Service) planDelivery(ctx context.Context, tx *sql.Tx, notification *Notification) error {
	r, err := s.loadRecipient(ctx, tx, notification.UserID)
	if err != nil {
		return err
	}

	now := time.Now()
	plans := []deliveryPlan{
		// The notification row itself is the application delivery; recording it
		// keeps "was this person told, and how" a single question.
		{channel: ChannelApp, status: StatusSent, notBefore: now},
	}

	for _, channel := range []Channel{ChannelEmail, ChannelPush} {
		if !r.allows(notification.Type, channel) {
			continue
		}
		if channel == ChannelPush {
			if !s.PushReady() {
				// No key pair in this environment. Recorded as skipped rather
				// than left pending, so the sender's queue does not fill with
				// work nothing can do.
				plans = append(plans, deliveryPlan{channel: channel, status: StatusSkipped, notBefore: now})
				continue
			}
			// Push is the immediate channel — it exists precisely to arrive
			// before somebody opens the application, so it does not wait.
			plans = append(plans, deliveryPlan{
				channel:   channel,
				status:    StatusPending,
				notBefore: r.afterQuietHours(now),
			})
			continue
		}
		plans = append(plans, deliveryPlan{
			channel:   channel,
			status:    StatusPending,
			notBefore: r.afterQuietHours(now.Add(s.EmailDelay())),
		})
	}

	for _, plan := range plans {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO notification_deliveries (notification_id, user_id, channel, status, not_before)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (notification_id, channel) DO NOTHING`,
			notification.ID, notification.UserID, plan.channel, plan.status, plan.notBefore)
		if err != nil {
			return fmt.Errorf("record delivery on %s: %w", plan.channel, err)
		}
	}

	return nil
}

// DeliveryStatus is one channel's outcome, for a curator looking at whether a
// client was actually told.
type DeliveryStatus struct {
	Channel string     `json:"channel"`
	Status  string     `json:"status"`
	SentAt  *time.Time `json:"sentAt,omitempty"`
}

// DeliveriesFor returns how one notification was delivered.
func (s *Service) DeliveriesFor(ctx context.Context, notificationID string) ([]DeliveryStatus, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT channel, status, CASE WHEN status = 'sent' THEN updated_at END
		 FROM notification_deliveries WHERE notification_id = $1 ORDER BY channel`, notificationID)
	if err != nil {
		return nil, fmt.Errorf("load deliveries: %w", err)
	}
	defer rows.Close()

	statuses := make([]DeliveryStatus, 0, 3)
	for rows.Next() {
		var d DeliveryStatus
		if err := rows.Scan(&d.Channel, &d.Status, &d.SentAt); err != nil {
			return nil, fmt.Errorf("scan delivery: %w", err)
		}
		statuses = append(statuses, d)
	}
	return statuses, rows.Err()
}

// errNoRecipient marks a delivery whose user has since gone.
var errNoRecipient = errors.New("recipient no longer exists")

// ClientNotice is one thing a client was told, and how it reached them.
type ClientNotice struct {
	ID         string           `json:"id"`
	Type       NotificationType `json:"type"`
	Title      string           `json:"title"`
	CreatedAt  time.Time        `json:"createdAt"`
	ReadAt     *time.Time       `json:"readAt,omitempty"`
	Deliveries []DeliveryStatus `json:"deliveries"`
}

// RecentNotices returns what a client has been told lately.
//
// It exists so a curator can tell "they have not answered" apart from "they
// were never told" — two situations that look identical from the outside and
// call for opposite responses.
func (s *Service) RecentNotices(ctx context.Context, userID int64, limit int) ([]ClientNotice, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT n.id, n.type, n.title, n.created_at, n.read_at,
		        COALESCE(d.channel, ''), COALESCE(d.status, ''),
		        CASE WHEN d.status = 'sent' THEN d.updated_at END
		 FROM (
		     SELECT id, type, title, created_at, read_at
		     FROM notifications
		     WHERE user_id = $1
		     ORDER BY created_at DESC
		     LIMIT $2
		 ) n
		 LEFT JOIN notification_deliveries d ON d.notification_id = n.id
		 ORDER BY n.created_at DESC, d.channel`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("load recent notices: %w", err)
	}
	defer rows.Close()

	notices := make([]ClientNotice, 0, limit)
	index := map[string]int{}

	for rows.Next() {
		var (
			id, title  string
			noticeType NotificationType
			createdAt  time.Time
			readAt     *time.Time
			delivery   DeliveryStatus
		)
		if err := rows.Scan(&id, &noticeType, &title, &createdAt, &readAt,
			&delivery.Channel, &delivery.Status, &delivery.SentAt); err != nil {
			return nil, fmt.Errorf("scan recent notice: %w", err)
		}

		position, seen := index[id]
		if !seen {
			notices = append(notices, ClientNotice{
				ID: id, Type: noticeType, Title: title,
				CreatedAt: createdAt, ReadAt: readAt,
				Deliveries: []DeliveryStatus{},
			})
			position = len(notices) - 1
			index[id] = position
		}
		// A notification created before the delivery layer existed has no
		// delivery rows; the left join gives an empty channel for it.
		if delivery.Channel != "" {
			notices[position].Deliveries = append(notices[position].Deliveries, delivery)
		}
	}

	return notices, rows.Err()
}
