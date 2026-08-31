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
			"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at",
		}).AddRow(int64(42), "changed@example.com", "User", "client", true, true, nowUTC()))
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
