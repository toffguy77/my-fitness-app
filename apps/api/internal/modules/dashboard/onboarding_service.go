package dashboard

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// GetOnboardingState reports what the dashboard's first screen shows a client:
// which first-week tasks are done, whether the checklist still applies, and who
// their curator is.
//
// plateRecognitionEnabled comes from the caller rather than from a config field
// here, so the decision to drop the plate-photo task is made in one place and
// the task is absent from the answer rather than present-but-unreachable. A task
// that would end in the capability's 503 is never offered.
func (s *Service) GetOnboardingState(ctx context.Context, userID int64, plateRecognitionEnabled bool) (*OnboardingState, error) {
	steps, registeredAt, err := s.onboardingSteps(ctx, userID, plateRecognitionEnabled)
	if err != nil {
		return nil, err
	}

	curator, err := s.curatorPresence(ctx, userID)
	if err != nil {
		return nil, err
	}

	return &OnboardingState{
		Active:  onboardingActive(steps, registeredAt, time.Now()),
		Steps:   steps,
		Curator: curator,
	}, nil
}

// onboardingActive decides whether the checklist still belongs on the screen.
//
// Both conditions are deliberate: the list goes away once there is nothing left
// to do, and it also goes away after the first week rather than becoming a
// permanent reproach for tasks somebody chose not to do.
func onboardingActive(steps []OnboardingStep, registeredAt time.Time, now time.Time) bool {
	if now.Sub(registeredAt) >= OnboardingWindow {
		return false
	}
	for _, step := range steps {
		if !step.Done {
			return true
		}
	}
	return false
}

// onboardingSteps derives every task from what the person actually did.
//
// One query, all conditions as EXISTS over an indexed user_id. Nothing here is
// stored: a saved "profile done" flag can outlive the profile being emptied,
// and then the checklist argues with the settings screen.
func (s *Service) onboardingSteps(ctx context.Context, userID int64, plateRecognitionEnabled bool) ([]OnboardingStep, time.Time, error) {
	// first_meal counts only entries the person made themselves.
	//
	// food_entries.created_by is filled by exactly one path — a curator turning
	// a client's chat message into an entry (modules/chat, column added by
	// migration 020). The regular tracker leaves it NULL. Without the condition
	// below, somebody who never opened the tracker would be credited with their
	// curator's work.
	//
	// curator_hello requires a message the person sent. Being greeted is not
	// knowing someone. Conversations marked anonymised are excluded: their
	// messages belong to an erased relationship.
	const query = `
		SELECT
			u.created_at,
			COALESCE(
				s.birth_date IS NOT NULL
				AND s.biological_sex IS NOT NULL
				AND s.height IS NOT NULL,
				false
			) AS profile_done,
			EXISTS (
				SELECT 1 FROM food_entries fe
				WHERE fe.user_id = u.id
				  AND (fe.created_by IS NULL OR fe.created_by = u.id)
			) AS first_meal_done,
			EXISTS (
				SELECT 1 FROM food_recognition_usage fr
				WHERE fr.user_id = u.id
			) AS plate_photo_done,
			EXISTS (
				SELECT 1 FROM messages m
				JOIN conversations c ON c.id = m.conversation_id
				WHERE c.client_id = u.id
				  AND c.anonymized_at IS NULL
				  AND m.sender_id = u.id
			) AS curator_hello_done
		FROM users u
		LEFT JOIN user_settings s ON s.user_id = u.id
		WHERE u.id = $1
	`

	var (
		registeredAt                                             time.Time
		profileDone, firstMealDone, platePhotoDone, curatorHello bool
	)
	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&registeredAt, &profileDone, &firstMealDone, &platePhotoDone, &curatorHello,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, time.Time{}, fmt.Errorf("user %d not found", userID)
		}
		return nil, time.Time{}, fmt.Errorf("failed to read onboarding steps: %w", err)
	}

	// Allocated, never nil: an empty list must serialise as [] rather than null.
	steps := make([]OnboardingStep, 0, 4)
	steps = append(steps,
		OnboardingStep{Key: OnboardingStepProfile, Done: profileDone},
		OnboardingStep{Key: OnboardingStepFirstMeal, Done: firstMealDone},
	)
	if plateRecognitionEnabled {
		steps = append(steps, OnboardingStep{Key: OnboardingStepPlatePhoto, Done: platePhotoDone})
	}
	steps = append(steps, OnboardingStep{Key: OnboardingStepCuratorHello, Done: curatorHello})

	return steps, registeredAt, nil
}

// curatorPresence reads the assigned curator and the state of the conversation.
//
// Returns (nil, nil) when no curator is assigned — the dashboard states that
// out loud instead of hiding the card, because a signup path that forgot to
// assign one leaves the person without a curator permanently, and a silent card
// conceals exactly that.
//
// The participant is resolved the same way modules/chat resolves it, so there
// is one truth about who the other side of a conversation is.
func (s *Service) curatorPresence(ctx context.Context, userID int64) (*CuratorPresence, error) {
	const query = `
		SELECT c.id,
		       COALESCE(u.name, ''),
		       COALESCE(u.avatar_url, ''),
		       (
		           SELECT COUNT(*) FROM messages m
		           WHERE m.conversation_id = c.id
		             AND m.sender_id <> $1
		             AND m.created_at > COALESCE(
		                 (SELECT last_read_at FROM message_read_status
		                  WHERE conversation_id = c.id AND user_id = $1),
		                 '1970-01-01'::timestamptz
		             )
		       ) AS unread_count,
		       lm.content,
		       lm.created_at,
		       lm.sender_id
		FROM conversations c
		JOIN users u ON u.id = c.curator_id
		LEFT JOIN LATERAL (
		    SELECT m.content, m.created_at, m.sender_id
		    FROM messages m
		    WHERE m.conversation_id = c.id
		    ORDER BY m.created_at DESC
		    LIMIT 1
		) lm ON true
		WHERE c.client_id = $1
		  AND c.anonymized_at IS NULL
		ORDER BY c.updated_at DESC
		LIMIT 1
	`

	var (
		presence      CuratorPresence
		lastContent   sql.NullString
		lastCreatedAt sql.NullTime
		lastSenderID  sql.NullInt64
	)
	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&presence.ConversationID,
		&presence.Name,
		&presence.AvatarURL,
		&presence.UnreadCount,
		&lastContent,
		&lastCreatedAt,
		&lastSenderID,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to read curator presence: %w", err)
	}

	// A conversation without messages is a normal state, not a missing curator:
	// the card then invites the person to write first.
	if lastCreatedAt.Valid && lastSenderID.Valid {
		presence.LastMessage = &CuratorLastMessage{
			Text:        lastContent.String,
			CreatedAt:   lastCreatedAt.Time,
			FromCurator: lastSenderID.Int64 != userID,
		}
	}

	return &presence, nil
}
