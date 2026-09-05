package auth

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func profile() *oauth.Profile {
	return &oauth.Profile{ProviderUserID: "ext-1", Email: "user@example.com", Name: "User"}
}

// Signing in automatically because the provider reports a matching address is a
// known account takeover: it makes our security depend on somebody else's
// assertion about an address we never verified.
func TestSignInWithProvider_MatchingEmailRequiresProofOfOwnership(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM external_identities").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}))
	mock.ExpectQuery("SELECT id FROM users WHERE email").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(7)))

	outcome, err := service.SignInWithProvider(context.Background(), "yandex", profile(), "127.0.0.1", "agent")

	require.NoError(t, err)
	assert.Equal(t, OAuthNeedsLinkConfirmation, outcome.Result)
	assert.Nil(t, outcome.User, "no session may be issued before ownership is proved")
	assert.Equal(t, "user@example.com", outcome.Email)
}

// A provider that returns no address is normal, not an error: some need extra
// scopes for it.
func TestSignInWithProvider_MissingEmailAsksTheUser(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM external_identities").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}))

	outcome, err := service.SignInWithProvider(context.Background(), "vk",
		&oauth.Profile{ProviderUserID: "ext-2"}, "127.0.0.1", "agent")

	require.NoError(t, err)
	assert.Equal(t, OAuthNeedsEmail, outcome.Result)
	assert.Equal(t, "ext-2", outcome.ProviderUserID)
}

// A user who changes their address at the provider must keep their account:
// identity is the provider pair, not the email.
func TestSignInWithProvider_KnownIdentitySignsIn(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM external_identities").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(int64(42)))
	mock.ExpectExec("UPDATE external_identities SET last_login_at").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT id, email").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at", "token_version",
		}).AddRow(int64(42), "changed@example.com", "User", "client", true, true, nowUTC(), 0))
	mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))

	outcome, err := service.SignInWithProvider(context.Background(), "yandex", profile(), "127.0.0.1", "agent")

	require.NoError(t, err)
	assert.Equal(t, OAuthSignedIn, outcome.Result)
	require.NotNil(t, outcome.User)
	assert.Equal(t, int64(42), outcome.User.User.ID)
}

// Losing the only way in must not be one click away for a user with a year of
// data and no password.
func TestUnlinkProvider_RefusesToRemoveTheLastSignInMethod(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("SELECT u.password IS NOT NULL").
		WillReturnRows(sqlmock.NewRows([]string{"has_password", "link_count"}).AddRow(false, 1))

	err := service.UnlinkProvider(context.Background(), 1, "yandex")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrConflict)
}

func TestUnlinkProvider_AllowedWhenAPasswordExists(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("SELECT u.password IS NOT NULL").
		WillReturnRows(sqlmock.NewRows([]string{"has_password", "link_count"}).AddRow(true, 1))
	mock.ExpectExec("DELETE FROM external_identities").
		WillReturnResult(sqlmock.NewResult(0, 1))

	require.NoError(t, service.UnlinkProvider(context.Background(), 1, "yandex"))
}

func TestLinkProvider_RefusesAnAccountLinkedElsewhere(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("SELECT user_id FROM external_identities").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(int64(999)))

	err := service.LinkProvider(context.Background(), 1, "yandex", profile())

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrConflict)
}

func nowUTC() time.Time { return time.Now().UTC() }

func pendingRows(email string) *sqlmock.Rows {
	return sqlmock.NewRows([]string{"provider", "provider_user_id", "email", "name", "avatar_url"}).
		AddRow("yandex", "ext-1", email, "User", "")
}

// The password is the proof of ownership. Without it, anyone who can make a
// provider assert our user's address would be signing in as them.
func TestConfirmLinkWithPassword_LinksOnlyOnTheRightPassword(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("correct horse"), bcrypt.MinCost)
	require.NoError(t, err)

	t.Run("wrong password links nothing", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("FROM oauth_pending_links").WillReturnRows(pendingRows("user@example.com"))
		mock.ExpectQuery("SELECT id, password FROM users WHERE email").
			WillReturnRows(sqlmock.NewRows([]string{"id", "password"}).AddRow(int64(7), string(hash)))

		_, err := service.ConfirmLinkWithPassword(context.Background(), "pending-1", "guess", "ip", "ua")

		require.Error(t, err)
		assert.ErrorIs(t, err, apperrors.ErrInvalidCredentials)
		// No INSERT was expected: reaching one would fail the mock.
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("right password links and signs in", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("FROM oauth_pending_links").WillReturnRows(pendingRows("user@example.com"))
		mock.ExpectQuery("SELECT id, password FROM users WHERE email").
			WillReturnRows(sqlmock.NewRows([]string{"id", "password"}).AddRow(int64(7), string(hash)))
		mock.ExpectExec("INSERT INTO external_identities").WillReturnResult(sqlmock.NewResult(1, 1))
		mock.ExpectExec("DELETE FROM oauth_pending_links").WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectQuery("SELECT id, email").
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at", "token_version",
			}).AddRow(int64(7), "user@example.com", "User", "client", true, true, nowUTC(), 0))
		mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))

		result, err := service.ConfirmLinkWithPassword(context.Background(), "pending-1", "correct horse", "ip", "ua")

		require.NoError(t, err)
		assert.Equal(t, int64(7), result.User.ID)
		assert.NotEmpty(t, result.RefreshToken)
	})
}

// An account created through another provider has no password to check, so
// there is nothing here to prove ownership with.
func TestConfirmLinkWithPassword_RefusesAnAccountWithoutAPassword(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM oauth_pending_links").WillReturnRows(pendingRows("user@example.com"))
	mock.ExpectQuery("SELECT id, password FROM users WHERE email").
		WillReturnRows(sqlmock.NewRows([]string{"id", "password"}).AddRow(int64(7), nil))

	_, err := service.ConfirmLinkWithPassword(context.Background(), "pending-1", "anything", "ip", "ua")

	assert.ErrorIs(t, err, apperrors.ErrConflict)
}

// An attempt nobody came back to finish within the window cannot be resumed by
// whoever uses the machine next.
func TestConfirmLinkWithPassword_RefusesAnExpiredAttempt(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM oauth_pending_links").WillReturnRows(
		sqlmock.NewRows([]string{"provider", "provider_user_id", "email", "name", "avatar_url"}))

	_, err := service.ConfirmLinkWithPassword(context.Background(), "stale", "pw", "ip", "ua")

	assert.ErrorIs(t, err, apperrors.ErrTokenInvalid)
}

// Typing an address that belongs to somebody else must not hand over their
// account — it asks for that account's password instead.
func TestCompleteWithEmail_ExistingAddressStillNeedsProof(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM oauth_pending_links").WillReturnRows(pendingRows(""))
	mock.ExpectQuery("SELECT id FROM users WHERE email").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(9)))

	outcome, err := service.CompleteWithEmail(context.Background(), "pending-1", "taken@example.com", "ip", "ua")

	require.NoError(t, err)
	assert.Equal(t, OAuthNeedsLinkConfirmation, outcome.Result)
	assert.Nil(t, outcome.User)
}

// Nobody has proved this address belongs to the person typing it, so the
// account starts unverified and gets the usual confirmation mail.
func TestCompleteWithEmail_NewAddressCreatesAnUnverifiedAccount(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM oauth_pending_links").WillReturnRows(pendingRows(""))
	mock.ExpectQuery("SELECT id FROM users WHERE email").WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectBegin()
	mock.ExpectQuery("INSERT INTO users").
		WithArgs("new@example.com", "User", false).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(11)))
	mock.ExpectExec("INSERT INTO external_identities").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectQuery("SELECT id, email").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at", "token_version",
		}).AddRow(int64(11), "new@example.com", "User", "client", false, false, nowUTC(), 0))
	mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("DELETE FROM oauth_pending_links").WillReturnResult(sqlmock.NewResult(0, 1))

	outcome, err := service.CompleteWithEmail(context.Background(), "pending-1", "new@example.com", "ip", "ua")

	require.NoError(t, err)
	assert.Equal(t, OAuthRegistered, outcome.Result)
	assert.NoError(t, mock.ExpectationsWereMet())
}
