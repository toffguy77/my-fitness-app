package account

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

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
}

// NewService creates the service. buckets maps a name used in logs to a client.
func NewService(db *database.DB, log *logger.Logger, buckets map[string]*storage.S3Client) *Service {
	return &Service{db: db, log: log, buckets: buckets}
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
func (s *Service) RequestDeletion(ctx context.Context, userID int64, currentPassword string) (*DeletionStatus, error) {
	var storedHash string
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

	if bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(currentPassword)) != nil {
		return nil, fmt.Errorf("password mismatch: %w", apperrors.ErrInvalidCredentials)
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

	s.log.Info("Account deletion requested", "user_id", userID)

	scheduled := requestedAt.Add(CancellationWindow)
	return &DeletionStatus{Requested: true, RequestedAt: &requestedAt, ScheduledFor: &scheduled}, nil
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
func (s *Service) deleteFiles(ctx context.Context, userID int64) {
	prefix := fmt.Sprintf("%d/", userID)
	for name, client := range s.buckets {
		if client == nil {
			continue
		}
		removed, err := client.DeleteByPrefix(ctx, prefix)
		if err != nil {
			s.log.Error("Failed to delete user files", "bucket", name, "user_id", userID, "error", err)
			continue
		}
		s.log.Info("Deleted user files", "bucket", name, "user_id", userID, "objects", removed)
	}
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
