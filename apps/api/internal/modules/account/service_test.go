package account

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func fixture(t *testing.T) (*Service, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return NewService(&database.DB{DB: db}, logger.New(), map[string]*storage.S3Client{}), mock
}

func hash(t *testing.T, password string) string {
	t.Helper()
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	require.NoError(t, err)
	return string(h)
}

// Deleting a year of photographs and a food diary is destructive enough that an
// unattended session must not be sufficient to trigger it.
func TestRequestDeletion_RequiresTheCurrentPassword(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).
			AddRow(hash(t, "correct-password"), nil))

	_, err := service.RequestDeletion(context.Background(), 1, "wrong-password", "")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrInvalidCredentials)
}

func TestRequestDeletion_StartsTheWindowAndEndsSessions(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).
			AddRow(hash(t, "right"), nil))
	mock.ExpectQuery("UPDATE users SET deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"deletion_requested_at"}).AddRow(time.Now()))
	// The account is deactivated from this moment; a live token would say
	// otherwise.
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
		WillReturnResult(sqlmock.NewResult(0, 2))

	status, err := service.RequestDeletion(context.Background(), 1, "right", "")

	require.NoError(t, err)
	assert.True(t, status.Requested)
	require.NotNil(t, status.ScheduledFor)
	assert.WithinDuration(t, time.Now().Add(CancellationWindow), *status.ScheduledFor, time.Minute)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Re-requesting must not move the date: otherwise a user could postpone their
// own deletion indefinitely by accident.
func TestRequestDeletion_DoesNotExtendAnExistingWindow(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).
			AddRow(hash(t, "right"), time.Now().Add(-time.Hour)))

	_, err := service.RequestDeletion(context.Background(), 1, "right", "")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrConflict)
}

// fakeDeletionCoder stands in for auth.VerificationService in unit tests: the
// real hashing/rate-limit/attempt mechanism is proven against a real database
// in the integration suite (deletion_passwordless_integration_test.go); these
// tests only need to prove that RequestDeletion asks it the right question
// and translates its answer correctly.
type fakeDeletionCoder struct {
	verifyErr error
	sendErr   error
	sentTo    []int64
}

func (f *fakeDeletionCoder) SendDeletionCode(_ context.Context, userID int64, _, _, _ string) error {
	f.sentTo = append(f.sentTo, userID)
	return f.sendErr
}

func (f *fakeDeletionCoder) VerifyDeletionCode(context.Context, int64, string) error {
	return f.verifyErr
}

// Absence of both a password and a code is a refusal, not something to wave
// through because a passwordless account has no password to check anyway.
func TestRequestDeletion_PasswordlessRequiresACode(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).AddRow(nil, nil))

	_, err := service.RequestDeletion(context.Background(), 1, "", "")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrValidation)
}

// Without a DeletionCodeService configured, a passwordless account has
// nothing to check a code against — the same "absent capability" shape as
// every other optional dependency here, not an internal error.
func TestRequestDeletion_PasswordlessWithoutCoderConfigured(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).AddRow(nil, nil))

	_, err := service.RequestDeletion(context.Background(), 1, "", "123456")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrEmailUnavailable)
}

// The whole point of the code: it stands in for the password check for an
// account that has none, and a correct one starts the window exactly like a
// correct password does.
func TestRequestDeletion_PasswordlessWithValidCodeSucceeds(t *testing.T) {
	service, mock := fixture(t)
	service.WithCodeVerifier(&fakeDeletionCoder{})

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).AddRow(nil, nil))
	mock.ExpectQuery("UPDATE users SET deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"deletion_requested_at"}).AddRow(time.Now()))
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
		WillReturnResult(sqlmock.NewResult(0, 1))

	status, err := service.RequestDeletion(context.Background(), 1, "", "123456")

	require.NoError(t, err)
	assert.True(t, status.Requested)
}

// A wrong code is the same refusal shape as a wrong password: 401, via
// ErrInvalidCredentials, not a 500 leaking the underlying "invalid code"
// error text.
func TestRequestDeletion_PasswordlessWrongCodeIsInvalidCredentials(t *testing.T) {
	service, mock := fixture(t)
	service.WithCodeVerifier(&fakeDeletionCoder{verifyErr: errors.New("invalid code")})

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).AddRow(nil, nil))

	_, err := service.RequestDeletion(context.Background(), 1, "", "000000")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrInvalidCredentials)
}

// Unlike a plain wrong code, a rate limit or an expired code keep their own
// sentinel through RequestDeletion: the client needs to tell "request a new
// code" apart from "just try again".
func TestRequestDeletion_PasswordlessTooManyAttemptsKeepsItsSentinel(t *testing.T) {
	service, mock := fixture(t)
	service.WithCodeVerifier(&fakeDeletionCoder{verifyErr: fmt.Errorf("too many: %w", apperrors.ErrTooManyAttempts)})

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).AddRow(nil, nil))

	_, err := service.RequestDeletion(context.Background(), 1, "", "000000")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrTooManyAttempts)
}

// A password account never touches the code path at all, even when one is
// wired up — RequestDeletionCode refuses it, but nothing stops the caller
// from configuring the coder anyway, so RequestDeletion itself must not lean
// on it once a password is found.
func TestRequestDeletionCode_SendsForPasswordlessAccount(t *testing.T) {
	service, mock := fixture(t)
	coder := &fakeDeletionCoder{}
	service.WithCodeVerifier(coder)

	mock.ExpectQuery("SELECT email, password FROM users").
		WillReturnRows(sqlmock.NewRows([]string{"email", "password"}).AddRow("nopass@example.test", nil))

	err := service.RequestDeletionCode(context.Background(), 1, "127.0.0.1", "test")

	require.NoError(t, err)
	assert.Equal(t, []int64{1}, coder.sentTo)
}

// A code is not needed for an account that can already confirm with its
// password — sending one anyway would just spend its rate limit on nothing.
func TestRequestDeletionCode_RefusesForAccountWithPassword(t *testing.T) {
	service, mock := fixture(t)
	coder := &fakeDeletionCoder{}
	service.WithCodeVerifier(coder)

	mock.ExpectQuery("SELECT email, password FROM users").
		WillReturnRows(sqlmock.NewRows([]string{"email", "password"}).AddRow("haspass@example.test", hash(t, "x")))

	err := service.RequestDeletionCode(context.Background(), 1, "127.0.0.1", "test")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrConflict)
	assert.Empty(t, coder.sentTo)
}

func TestCancelDeletion_RestoresTheAccount(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectExec("UPDATE users SET deletion_requested_at = NULL").
		WithArgs(int64(1)).
		WillReturnResult(sqlmock.NewResult(0, 1))

	require.NoError(t, service.CancelDeletion(context.Background(), 1))
}

func TestCancelDeletion_WithoutAPendingRequest(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectExec("UPDATE users SET deletion_requested_at = NULL").
		WillReturnResult(sqlmock.NewResult(0, 0))

	err := service.CancelDeletion(context.Background(), 1)

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrNotFound)
}

// Building an archive is expensive and holds everything about a person; one at
// a time, once a day.
func TestRequestExport_RejectsASecondConcurrentRequest(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	_, err := service.RequestExport(context.Background(), 1)

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrConflict)
}

func TestRequestExport_EnforcesTheDailyLimit(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	_, err := service.RequestExport(context.Background(), 1)

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrRateLimited)
}

func TestRequestExport_Queues(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT COUNT").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("SELECT COUNT").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("INSERT INTO data_exports").
		WillReturnRows(sqlmock.NewRows([]string{"id", "status", "requested_at"}).
			AddRow("11111111-1111-1111-1111-111111111111", "pending", time.Now()))

	export, err := service.RequestExport(context.Background(), 1)

	require.NoError(t, err)
	assert.Equal(t, "pending", export.Status)
}

// The archive holds everything the service knows about a person, so a link that
// stays live is a standing risk if it is ever forwarded or logged.
func TestClaimExport_RejectsASecondDownload(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT user_id, status, s3_key").
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "status", "s3_key", "downloaded_at", "expires_at"}).
			AddRow(int64(1), "ready", "exports/1/a.zip", time.Now(), time.Now().Add(time.Hour)))

	_, err := service.ClaimExport(context.Background(), 1, "11111111-1111-1111-1111-111111111111")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrGone)
}

func TestClaimExport_RejectsAnotherUsersArchive(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT user_id, status, s3_key").
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "status", "s3_key", "downloaded_at", "expires_at"}).
			AddRow(int64(999), "ready", "exports/999/a.zip", nil, time.Now().Add(time.Hour)))

	_, err := service.ClaimExport(context.Background(), 1, "11111111-1111-1111-1111-111111111111")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrForbidden)
}

func TestClaimExport_RejectsAnExpiredArchive(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("SELECT user_id, status, s3_key").
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "status", "s3_key", "downloaded_at", "expires_at"}).
			AddRow(int64(1), "ready", "exports/1/a.zip", nil, time.Now().Add(-time.Hour)))

	_, err := service.ClaimExport(context.Background(), 1, "11111111-1111-1111-1111-111111111111")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrGone)
}

// Every table that references users must state what happens to it; the list is
// checked against the live schema by the integration test.
func TestStrategies_AreComplete(t *testing.T) {
	seen := map[string]bool{}
	for _, ts := range Strategies() {
		assert.NotEmpty(t, ts.Table)
		assert.NotEmpty(t, ts.Reason, "%s must record why", ts.Table)
		assert.Contains(t, []Strategy{StrategyDelete, StrategyAnonymize, StrategyKeep}, ts.Strategy)
		assert.False(t, seen[ts.Table], "%s appears twice", ts.Table)
		seen[ts.Table] = true

		// A row that is deleted or anonymised has to name the column linking it
		// to the user; only "keep" may leave it blank.
		if ts.Strategy != StrategyKeep {
			assert.NotEmpty(t, ts.Column, "%s needs a user column", ts.Table)
		}
	}
}

// A curator's conversation must stay readable after a client is erased, so
// messages are anonymised rather than deleted.
func TestStrategies_PreserveCuratorRecords(t *testing.T) {
	byTable := map[string]Strategy{}
	for _, ts := range Strategies() {
		byTable[ts.Table] = ts.Strategy
	}

	assert.Equal(t, StrategyAnonymize, byTable["messages"])
	assert.Equal(t, StrategyAnonymize, byTable["conversations"])
	assert.Equal(t, StrategyAnonymize, byTable["weekly_reports"])
	assert.Equal(t, StrategyDelete, byTable["food_entries"])
	assert.Equal(t, StrategyDelete, byTable["weekly_photos"])
}

// auth duplicates this window rather than importing the account module. The
// duplication is only safe while the two agree.
func TestCancellationWindowsAgree(t *testing.T) {
	assert.Equal(t, 30*24*time.Hour, CancellationWindow,
		"auth.accountCancellationWindow must be changed with this one")
}

// "Best effort" without a record means the leftovers are never retried and
// somebody's photographs stay in a bucket forever.
func TestPurgeLeftoverFiles_MarksOnlyWhatItActuallyCleared(t *testing.T) {
	service, mock := fixture(t)

	// No buckets configured, so deleteFiles trivially succeeds for both — the
	// point here is that each cleared account is marked, one by one.
	mock.ExpectQuery("FROM users").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(7)).AddRow(int64(9)))
	for _, id := range []int64{7, 9} {
		// The prefixes are read back rather than recomputed: erasure has already
		// removed the links they would be derived from.
		mock.ExpectQuery("SELECT pending_file_prefixes FROM users").
			WithArgs(id).
			WillReturnRows(sqlmock.NewRows([]string{"pending_file_prefixes"}).
				AddRow([]byte(`{"profile-photos":["avatars/` + fmt.Sprint(id) + `/"]}`)))
		mock.ExpectExec("UPDATE users SET files_purged_at").
			WithArgs(id).WillReturnResult(sqlmock.NewResult(0, 1))
	}

	purged, err := service.PurgeLeftoverFiles(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 2, purged)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPurgeLeftoverFiles_NothingOwed(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("FROM users").WillReturnRows(sqlmock.NewRows([]string{"id"}))

	purged, err := service.PurgeLeftoverFiles(context.Background())

	require.NoError(t, err)
	assert.Zero(t, purged)
}

type recordingNotifier struct {
	sent []string
	err  error
}

func (r *recordingNotifier) Notify(_ context.Context, userID int64, notificationType, _, _, _ string) error {
	r.sent = append(r.sent, fmt.Sprintf("%d:%s", userID, notificationType))
	return r.err
}

// The curator planned around this person and would otherwise find out by
// noticing an absence.
func TestRequestDeletion_TellsTheCurator(t *testing.T) {
	service, mock := fixture(t)
	notifier := &recordingNotifier{}
	service.WithNotifier(notifier)

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).
			AddRow(hash(t, "Password123!"), nil))
	mock.ExpectQuery("UPDATE users SET deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"deletion_requested_at"}).AddRow(time.Now()))
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT curator_id FROM curator_client_relationships").
		WithArgs(int64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"curator_id"}).AddRow(int64(10)))

	_, err := service.RequestDeletion(context.Background(), 1, "Password123!", "")

	require.NoError(t, err)
	assert.Equal(t, []string{"10:client_left"}, notifier.sent)
}

// A client without a curator simply has nobody to tell, which is not a failure.
func TestRequestDeletion_SucceedsWithoutACurator(t *testing.T) {
	service, mock := fixture(t)
	notifier := &recordingNotifier{}
	service.WithNotifier(notifier)

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).
			AddRow(hash(t, "Password123!"), nil))
	mock.ExpectQuery("UPDATE users SET deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"deletion_requested_at"}).AddRow(time.Now()))
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT curator_id FROM curator_client_relationships").
		WillReturnError(sql.ErrNoRows)

	_, err := service.RequestDeletion(context.Background(), 1, "Password123!", "")

	require.NoError(t, err)
	assert.Empty(t, notifier.sent)
}

// Accounts erased before the prefix list existed have nothing recorded. Retrying
// them with an empty list would delete nothing and mark them clean — the same
// false success this whole change is about. They must stay unmarked and be said
// out loud instead.
func TestPurgeLeftoverFiles_RefusesToMarkWithoutAPrefixList(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("FROM users").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(7)))
	mock.ExpectQuery("SELECT pending_file_prefixes FROM users").
		WithArgs(int64(7)).
		WillReturnRows(sqlmock.NewRows([]string{"pending_file_prefixes"}).AddRow(nil))
	// No UPDATE expected: marking it purged would be a lie.

	purged, err := service.PurgeLeftoverFiles(context.Background())

	require.NoError(t, err)
	assert.Zero(t, purged, "an account whose files were never located must not be marked clean")
	assert.NoError(t, mock.ExpectationsWereMet())
}
