package notifications

import (
	"context"
	"fmt"
	"sort"

	"github.com/burcev/api/internal/shared/apperrors"
)

// TypeSetting is one event type's row in the settings screen.
type TypeSetting struct {
	Type string `json:"type"`
	// App is always true. It is reported rather than omitted so the screen can
	// show the column and explain why it does not move.
	App bool `json:"app"`
	// Email is absent for a type that is never mailed (chat_message): the
	// screen shows no switch rather than one that does nothing. In a request,
	// absent means the default.
	Email *bool `json:"email,omitempty"`
	Push  bool  `json:"push"`
}

// DeliveryPreferences is everything the notification settings screen shows.
type DeliveryPreferences struct {
	Types []TypeSetting `json:"types"`
	// QuietHoursStart and QuietHoursEnd are local hours of day. Both nil means
	// no quiet hours.
	QuietHoursStart *int   `json:"quietHoursStart"`
	QuietHoursEnd   *int   `json:"quietHoursEnd"`
	Timezone        string `json:"timezone"`
	// EmailUnsubscribed is the one switch that overrides the whole email
	// column, set by the link at the bottom of a digest.
	EmailUnsubscribed bool `json:"emailUnsubscribed"`
	// ShowMessageText: a chat push shows the message itself, or only
	// «Новое сообщение от …». On by default, as in messengers.
	ShowMessageText bool `json:"showMessageText"`
}

// UpdateDeliveryPreferencesRequest is a full replacement of the matrix: the
// screen sends what it shows, so a type missing from the request means the
// person's stored choice for it is cleared back to the default.
type UpdateDeliveryPreferencesRequest struct {
	Types           []TypeSetting `json:"types"`
	QuietHoursStart *int          `json:"quietHoursStart"`
	QuietHoursEnd   *int          `json:"quietHoursEnd"`
	// EmailUnsubscribed lets somebody undo an unsubscribe from inside the
	// application, which is the only place they can.
	EmailUnsubscribed *bool `json:"emailUnsubscribed"`
	// ShowMessageText is left as it is when absent: a screen that does not
	// show the switch must not reset it.
	ShowMessageText *bool `json:"showMessageText"`
}

// notifiableTypes is the order the settings screen shows. Every type that can
// reach a person appears; a type nobody can act on would be a switch with no
// effect.
func notifiableTypes() []NotificationType {
	types := make([]NotificationType, 0, len(defaultChannels))
	for t := range defaultChannels {
		types = append(types, t)
	}
	sort.Slice(types, func(i, j int) bool { return types[i] < types[j] })
	return types
}

// GetDeliveryPreferences returns the matrix as it stands, with defaults filled
// in for every choice the person has not made.
func (s *Service) GetDeliveryPreferences(ctx context.Context, userID int64) (*DeliveryPreferences, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin preferences read: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	r, err := s.loadRecipient(ctx, tx, userID)
	if err != nil {
		return nil, err
	}

	prefs := &DeliveryPreferences{
		Timezone:          r.timezone,
		EmailUnsubscribed: r.emailUnsubscribe.Valid,
		ShowMessageText:   r.showMessageText,
	}
	if r.quietStart.Valid && r.quietEnd.Valid {
		start, end := int(r.quietStart.Int16), int(r.quietEnd.Int16)
		prefs.QuietHoursStart, prefs.QuietHoursEnd = &start, &end
	}

	for _, t := range notifiableTypes() {
		setting := TypeSetting{
			Type: string(t),
			App:  true,
			Push: r.allows(t, ChannelPush),
		}
		if !pushOnlyTypes[t] {
			email := r.allows(t, ChannelEmail)
			setting.Email = &email
		}
		prefs.Types = append(prefs.Types, setting)
	}

	return prefs, tx.Commit()
}

// UpdateDeliveryPreferences stores the choices the screen sent.
//
// Only a choice that differs from the default is stored, so the defaults can be
// changed later without every existing user being pinned to the old ones.
func (s *Service) UpdateDeliveryPreferences(ctx context.Context, userID int64, req UpdateDeliveryPreferencesRequest) error {
	if err := validateQuietHours(req.QuietHoursStart, req.QuietHoursEnd); err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin preferences write: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM notification_preferences WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("clear notification preferences: %w", err)
	}

	for _, setting := range req.Types {
		notificationType := NotificationType(setting.Type)
		if !notificationType.isPreferenceType() {
			return fmt.Errorf("unknown notification type %q: %w", setting.Type, apperrors.ErrValidation)
		}
		choices := map[Channel]bool{ChannelPush: setting.Push}
		// A type that is never mailed stores no email choice, whatever was
		// sent: a stray row would otherwise be a switch with no screen.
		if setting.Email != nil && !pushOnlyTypes[notificationType] {
			choices[ChannelEmail] = *setting.Email
		}
		for channel, enabled := range choices {
			if enabled == defaultFor(notificationType, channel) {
				continue
			}
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO notification_preferences (user_id, type, channel, enabled)
				 VALUES ($1, $2, $3, $4)
				 ON CONFLICT (user_id, type, channel) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
				userID, notificationType, channel, enabled); err != nil {
				return fmt.Errorf("store notification preference: %w", err)
			}
		}
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE users SET quiet_hours_start = $1, quiet_hours_end = $2 WHERE id = $3`,
		req.QuietHoursStart, req.QuietHoursEnd, userID); err != nil {
		return fmt.Errorf("store quiet hours: %w", err)
	}

	if req.ShowMessageText != nil {
		if _, err := tx.ExecContext(ctx,
			`UPDATE users SET push_show_message_text = $1 WHERE id = $2`, *req.ShowMessageText, userID); err != nil {
			return fmt.Errorf("store message preview choice: %w", err)
		}
	}

	if req.EmailUnsubscribed != nil {
		if *req.EmailUnsubscribed {
			_, err = tx.ExecContext(ctx,
				`UPDATE users SET email_unsubscribed_at = COALESCE(email_unsubscribed_at, NOW()) WHERE id = $1`, userID)
		} else {
			_, err = tx.ExecContext(ctx,
				`UPDATE users SET email_unsubscribed_at = NULL WHERE id = $1`, userID)
		}
		if err != nil {
			return fmt.Errorf("store email subscription: %w", err)
		}
	}

	return tx.Commit()
}

// defaultFor reports whether a channel carries this type when nobody has said
// otherwise.
func defaultFor(notificationType NotificationType, channel Channel) bool {
	for _, c := range channelsFor(notificationType) {
		if c == channel {
			return true
		}
	}
	return false
}

func validateQuietHours(start, end *int) error {
	if (start == nil) != (end == nil) {
		return fmt.Errorf("quiet hours need both a start and an end: %w", apperrors.ErrValidation)
	}
	if start == nil {
		return nil
	}
	for _, hour := range []int{*start, *end} {
		if hour < 0 || hour > 23 {
			return fmt.Errorf("quiet hour %d is not an hour of the day: %w", hour, apperrors.ErrValidation)
		}
	}
	return nil
}
