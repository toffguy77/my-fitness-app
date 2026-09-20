package account

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/storage"
	"golang.org/x/crypto/bcrypt"
)

// CancellationWindow is how long a user has to change their mind.
//
// Deleting a year of photographs and a food diary is the kind of thing people
// do in a bad moment. Immediate irreversible deletion would generate a steady
// stream of "please bring it back" that cannot be answered.
const CancellationWindow = 30 * 24 * time.Hour

// Service implements account deletion and data export.
type Service struct {
	db  *database.DB
	log *logger.Logger
	// buckets are every store holding user files; erasure must clear them all.
	buckets map[string]*storage.S3Client
	// notifier may be nil; nothing here depends on it existing.
	notifier Notifier
	// topics may be nil: без моста закрывать нечего.
	topics TopicCloser
	// deletionCoder may be nil; without it a passwordless account cannot
	// complete RequestDeletion (there is nothing else to check instead of a
	// password), but every other call in this service is unaffected.
	deletionCoder DeletionCodeService
}

// DeletionCodeService proves control of a passwordless account's mailbox for
// the one action that needs it: deleting the account. Declared here as the
// narrowest thing this module needs from auth.VerificationService, so account
// does not depend on auth's types — same reason as Notifier above.
//
// Why a code at all: RequestDeletion used to accept a passwordless account on
// the strength of its session alone, because there was nothing else to check.
// Review found the asymmetry that leaves — a hijacked session is not enough to
// delete an account that has a password, but was enough for one that does
// not — so the product decision is a code mailed to the account's own
// address, proving something the session by itself does not.
type DeletionCodeService interface {
	SendDeletionCode(ctx context.Context, userID int64, userEmail, ip, ua string) error
	VerifyDeletionCode(ctx context.Context, userID int64, code string) error
}

// WithCodeVerifier attaches the service used to send and check a passwordless
// account's deletion code. Without it, RequestDeletionCode answers
// ErrEmailUnavailable and a passwordless RequestDeletion can never succeed —
// the same "absent capability, not a broken one" shape as WithNotifier.
func (s *Service) WithCodeVerifier(coder DeletionCodeService) *Service {
	s.deletionCoder = coder
	return s
}

// Notifier tells somebody that something happened. Declared here as the
// narrowest thing this module needs, so account does not depend on the
// notifications module's types.
type Notifier interface {
	Notify(ctx context.Context, userID int64, notificationType, title, content, actionURL string) error
}

// WithNotifier attaches the notifier used for export readiness and for telling
// a curator that a client has left.
func (s *Service) WithNotifier(notifier Notifier) *Service {
	s.notifier = notifier
	return s
}

// notify is best effort: an archive that was built and a client who left are
// both facts already, and a failure to announce them must not undo either.
func (s *Service) notify(ctx context.Context, userID int64, notificationType, title, content, actionURL string) {
	if s.notifier == nil {
		return
	}
	if err := s.notifier.Notify(ctx, userID, notificationType, title, content, actionURL); err != nil {
		s.log.Error("Failed to send notification", "error", err, "user_id", userID, "type", notificationType)
	}
}

// NewService creates the service. buckets maps a name used in logs to a client.
func NewService(db *database.DB, log *logger.Logger, buckets map[string]*storage.S3Client) *Service {
	return &Service{db: db, log: log, buckets: buckets}
}

// TopicCloser закрывает тему переписки стёртого человека.
//
// Узкий интерфейс: стиранию не нужно знать ни про Telegram, ни про форумы.
type TopicCloser interface {
	Close(ctx context.Context, clientID int64) error
}

// WithTopics подключает закрытие тем. Без него стирание работает по-прежнему.
func (s *Service) WithTopics(closer TopicCloser) *Service {
	s.topics = closer
	return s
}

// DeletionStatus describes where an account is in the deletion process.
type DeletionStatus struct {
	Requested    bool       `json:"requested"`
	RequestedAt  *time.Time `json:"requested_at,omitempty"`
	ScheduledFor *time.Time `json:"scheduled_for,omitempty"`
}

// RequestDeletion starts the cancellation window.
//
// The current password is required: this is the most destructive action the
// product offers, and an unattended session must not be enough to trigger it.
//
// An account created through an external provider or a magic link has no
// password (password = NULL) to check currentPassword against. It used to be
// accepted on the session alone — the only proof available at the time — but
// review found the asymmetry that leaves: a hijacked session is not enough to
// delete a password account, yet was enough for a passwordless one. The
// product decision is a code mailed to the account's own address instead
// (code), verified through DeletionCodeService — see its doc comment.
func (s *Service) RequestDeletion(ctx context.Context, userID int64, currentPassword, code string) (*DeletionStatus, error) {
	var storedHash sql.NullString
	var alreadyRequested sql.NullTime
	err := s.db.QueryRowContext(ctx,
		`SELECT password, deletion_requested_at FROM users WHERE id = $1`, userID).
		Scan(&storedHash, &alreadyRequested)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("user not found: %w", apperrors.ErrNotFound)
	}
	if err != nil {
		return nil, fmt.Errorf("load user: %w", err)
	}

	if auth.PasswordIsSet(storedHash) {
		if bcrypt.CompareHashAndPassword([]byte(storedHash.String), []byte(currentPassword)) != nil {
			return nil, fmt.Errorf("password mismatch: %w", apperrors.ErrInvalidCredentials)
		}
	} else {
		// Nothing to prove identity with but the code: absence of both a
		// password and a code is a refusal, not something to wave through
		// because currentPassword ends up empty either way.
		if code == "" {
			return nil, fmt.Errorf("deletion code required: %w", apperrors.ErrValidation)
		}
		if s.deletionCoder == nil {
			return nil, fmt.Errorf("deletion confirmation requires email: %w", apperrors.ErrEmailUnavailable)
		}
		if err := s.deletionCoder.VerifyDeletionCode(ctx, userID, code); err != nil {
			// A rate limit or an expired code get their own sentinel, so the
			// client can tell "ask for a new code" from "just retry" — the
			// distinction VerifyEmail's handler already makes for the same
			// codes. Everything else (wrong digits, no code ever sent) is the
			// same refusal shape as a wrong password.
			if errors.Is(err, apperrors.ErrTooManyAttempts) || errors.Is(err, apperrors.ErrCodeExpired) {
				return nil, err
			}
			return nil, fmt.Errorf("code mismatch: %w", apperrors.ErrInvalidCredentials)
		}
	}

	if alreadyRequested.Valid {
		// Re-requesting must not extend the window: otherwise a user could
		// postpone their own deletion indefinitely by accident.
		return nil, fmt.Errorf("deletion already requested: %w", apperrors.ErrConflict)
	}

	var requestedAt time.Time
	if err := s.db.QueryRowContext(ctx,
		`UPDATE users SET deletion_requested_at = NOW() WHERE id = $1
		 RETURNING deletion_requested_at`, userID).Scan(&requestedAt); err != nil {
		return nil, fmt.Errorf("record deletion request: %w", err)
	}

	// End every session immediately. The account is deactivated from this
	// moment, and a still-valid token would contradict that.
	if _, err := s.db.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = NOW()
		 WHERE user_id = $1 AND revoked_at IS NULL`, userID); err != nil {
		s.log.Error("Failed to revoke sessions on deletion request", "error", err, "user_id", userID)
	}

	// The curator planned around this person and would otherwise find out by
	// noticing an absence.
	s.notifyCurator(ctx, userID)

	s.log.Info("Account deletion requested", "user_id", userID)

	scheduled := requestedAt.Add(CancellationWindow)
	return &DeletionStatus{Requested: true, RequestedAt: &requestedAt, ScheduledFor: &scheduled}, nil
}

// RequestDeletionCode sends the code a passwordless account needs to confirm
// its own deletion — see RequestDeletion and DeletionCodeService for why one
// is required at all.
//
// Refuses for an account that has a password: that account confirms with the
// password it already has, and a code it never asked for would just be a
// second, unused way to spend its rate limit.
func (s *Service) RequestDeletionCode(ctx context.Context, userID int64, ip, ua string) error {
	var userEmail string
	var storedHash sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT email, password FROM users WHERE id = $1`, userID).
		Scan(&userEmail, &storedHash)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("user not found: %w", apperrors.ErrNotFound)
	}
	if err != nil {
		return fmt.Errorf("load user: %w", err)
	}

	if auth.PasswordIsSet(storedHash) {
		return fmt.Errorf("account has a password: %w", apperrors.ErrConflict)
	}

	if s.deletionCoder == nil {
		return fmt.Errorf("deletion confirmation requires email: %w", apperrors.ErrEmailUnavailable)
	}

	return s.deletionCoder.SendDeletionCode(ctx, userID, userEmail, ip, ua)
}

// CancelDeletion restores an account still inside its window.
func (s *Service) CancelDeletion(ctx context.Context, userID int64) error {
	result, err := s.db.ExecContext(ctx,
		`UPDATE users SET deletion_requested_at = NULL
		 WHERE id = $1 AND deletion_requested_at IS NOT NULL AND deleted_at IS NULL`, userID)
	if err != nil {
		return fmt.Errorf("cancel deletion: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return fmt.Errorf("no pending deletion: %w", apperrors.ErrNotFound)
	}

	s.log.Info("Account deletion cancelled", "user_id", userID)
	return nil
}

// Status reports where an account stands.
func (s *Service) Status(ctx context.Context, userID int64) (*DeletionStatus, error) {
	var requestedAt sql.NullTime
	if err := s.db.QueryRowContext(ctx,
		`SELECT deletion_requested_at FROM users WHERE id = $1`, userID).Scan(&requestedAt); err != nil {
		return nil, err
	}
	if !requestedAt.Valid {
		return &DeletionStatus{}, nil
	}
	scheduled := requestedAt.Time.Add(CancellationWindow)
	return &DeletionStatus{Requested: true, RequestedAt: &requestedAt.Time, ScheduledFor: &scheduled}, nil
}

// deleteFiles removes the user's objects from every bucket.
//
// Reports whether every bucket confirmed. A partial failure is not an error the
// caller should act on — the database is already consistent and the erasure
// stands — but it must be remembered, or the person's photographs stay in a
// bucket forever.
func (s *Service) deleteFiles(ctx context.Context, userID int64, prefixes FilePrefixes) (complete bool) {
	complete = true

	for name, client := range s.buckets {
		if client == nil {
			continue
		}
		keys := prefixes[name]
		if len(keys) == 0 {
			// Nothing of this user's is kept in that bucket. Distinct from a
			// failure: the bucket is finished, not skipped.
			continue
		}

		for _, prefix := range keys {
			removed, err := client.DeleteByPrefix(ctx, prefix)
			if err != nil {
				s.log.Error("Failed to delete user files",
					"bucket", name, "prefix", prefix, "user_id", userID, "error", err)
				complete = false
				continue
			}
			s.log.Info("Deleted user files",
				"bucket", name, "prefix", prefix, "user_id", userID, "objects", removed)
		}
	}

	return complete
}

// PurgeLeftoverFiles retries the buckets that failed during an erasure.
//
// Without it, "best effort" would mean "once, and never again".
func (s *Service) PurgeLeftoverFiles(ctx context.Context) (int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id FROM users
		WHERE deleted_at IS NOT NULL AND files_purged_at IS NULL
		ORDER BY deleted_at`)
	if err != nil {
		return 0, fmt.Errorf("list accounts with leftover files: %w", err)
	}
	defer rows.Close()

	var pending []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return 0, fmt.Errorf("scan account id: %w", err)
		}
		pending = append(pending, id)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	purged := 0
	for _, id := range pending {
		// The prefixes were written down during the erasure. Recomputing them
		// here would ask the database about links that erasure has already
		// removed, find nothing for the chat bucket, and call that success.
		prefixes, err := s.storedPrefixes(ctx, id)
		if err != nil {
			s.log.Error("Failed to read stored file prefixes", "user_id", id, "error", err)
			continue
		}
		if prefixes == nil {
			// Erased before this list was recorded. Retrying with an empty list
			// would mark the account clean without touching a single object, so
			// say so instead and leave the mark unset.
			s.log.Warn("No stored file prefixes: files must be removed by hand", "user_id", id)
			continue
		}

		if !s.deleteFiles(ctx, id, prefixes) {
			// Still failing: leave the mark unset so the next run tries again.
			continue
		}
		if err := s.markFilesPurged(ctx, id); err != nil {
			return purged, err
		}
		purged++
	}

	return purged, nil
}

func (s *Service) markFilesPurged(ctx context.Context, userID int64) error {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE users SET files_purged_at = NOW(), pending_file_prefixes = NULL WHERE id = $1`,
		userID); err != nil {
		return fmt.Errorf("record file purge: %w", err)
	}
	return nil
}

// ExecuteDueDeletions erases every account whose window has closed.
func (s *Service) ExecuteDueDeletions(ctx context.Context) (int, error) {
	ids, err := s.PendingErasures(ctx, CancellationWindow)
	if err != nil {
		return 0, fmt.Errorf("list pending deletions: %w", err)
	}

	erased := 0
	for _, id := range ids {
		// One failure must not block the rest: a stuck account would otherwise
		// hold up everyone else's deletion indefinitely.
		if err := s.Erase(ctx, id); err != nil {
			s.log.Error("Failed to erase account", "user_id", id, "error", err)
			continue
		}
		erased++
	}
	return erased, nil
}

// notifyCurator tells the client's curator that they are leaving.
//
// The client's own name is deliberately not in the text: the curator can see
// who it is from their own list, and a notification is not the place to repeat
// somebody's identity as they leave.
func (s *Service) notifyCurator(ctx context.Context, clientID int64) {
	if s.notifier == nil {
		return
	}

	var curatorID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT curator_id FROM curator_client_relationships
		 WHERE client_id = $1 AND status = 'active'`, clientID).Scan(&curatorID)
	if errors.Is(err, sql.ErrNoRows) {
		return
	}
	if err != nil {
		s.log.Error("Failed to find curator for departing client", "error", err, "client_id", clientID)
		return
	}

	s.notify(ctx, curatorID, "client_left", "Клиент уходит",
		"Один из ваших клиентов запросил удаление аккаунта и больше не появится в списках.",
		"/curator")
}
