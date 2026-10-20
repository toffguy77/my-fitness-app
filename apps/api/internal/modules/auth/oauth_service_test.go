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
	mock.ExpectQuery("FROM user_consents").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
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

// external-identity: a sign-in that would create an account creates nothing.
// The account appears only after the consents screen (CompleteWithConsents).
func TestSignInWithProvider_NewAddressWaitsForConsents(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM external_identities").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}))
	mock.ExpectQuery("SELECT id FROM users WHERE email").
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	outcome, err := service.SignInWithProvider(context.Background(), "yandex", profile(), "127.0.0.1", "agent")

	require.NoError(t, err)
	assert.Equal(t, OAuthNeedsConsents, outcome.Result)
	assert.Nil(t, outcome.User, "no session before the consents")
	assert.Equal(t, "ext-1", outcome.ProviderUserID)
	// No INSERT INTO users was expected: reaching one would fail the mock.
	assert.NoError(t, mock.ExpectationsWereMet())
}

// An account created through a provider before consents were asked for has
// none on record; it goes through the same screen instead of straight in.
func TestSignInWithProvider_LinkedAccountWithoutConsentsAsksForThem(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM external_identities").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(int64(42)))
	mock.ExpectQuery("FROM user_consents").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))

	outcome, err := service.SignInWithProvider(context.Background(), "yandex", profile(), "127.0.0.1", "agent")

	require.NoError(t, err)
	assert.Equal(t, OAuthNeedsConsents, outcome.Result)
	assert.Nil(t, outcome.User, "no session before the consents")
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Without the consent to process personal data nothing is read and nothing is
// written: the refusal comes before the attempt is even looked up.
func TestCompleteWithConsents_RefusesWithoutEveryMandatoryConsent(t *testing.T) {
	for name, consents := range map[string]*ConsentsInput{
		"none":                {},
		"no body":             nil,
		"no data processing":  {TermsOfService: true, PrivacyPolicy: true, Marketing: true},
		"no terms of service": {PrivacyPolicy: true, DataProcessing: true},
		"no privacy policy":   {TermsOfService: true, DataProcessing: true},
	} {
		t.Run(name, func(t *testing.T) {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			_, err := service.CompleteWithConsents(context.Background(), "0b6f1c2e-6c1d-4d39-9a52-3f8e2f0b9a11", consents, "127.0.0.1", "ua")

			assert.ErrorIs(t, err, apperrors.ErrValidation)
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// Losing the only way in must not be one click away for a user with a year of
// data and no password.
func TestUnlinkProvider_RefusesToRemoveTheLastSignInMethod(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("SELECT u.password").
		WillReturnRows(sqlmock.NewRows([]string{"password", "link_count"}).AddRow(nil, 1))

	err := service.UnlinkProvider(context.Background(), 1, "yandex")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrConflict)
}

// Same refusal for an empty stored string, not just NULL — before
// PasswordIsSet this query asked Postgres "password IS NOT NULL" directly,
// which answered true for an empty string and let the last sign-in method be
// removed, locking the person out permanently.
func TestUnlinkProvider_RefusesTheLastMethodWithAnEmptyStoredPassword(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("SELECT u.password").
		WillReturnRows(sqlmock.NewRows([]string{"password", "link_count"}).AddRow("", 1))

	err := service.UnlinkProvider(context.Background(), 1, "yandex")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrConflict)
}

func TestUnlinkProvider_AllowedWhenAPasswordExists(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("SELECT u.password").
		WillReturnRows(sqlmock.NewRows([]string{"password", "link_count"}).AddRow("$2a$10$somehash", 1))
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM external_identities").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

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
	return sqlmock.NewRows([]string{"provider", "provider_user_id", "email", "name", "avatar_url", "email_from_provider", "provider_refresh_token_enc"}).
		AddRow("yandex", "ext-1", email, "User", "", email != "", nil)
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
		mock.ExpectQuery("UPDATE oauth_pending_links SET failed_attempts").
			WillReturnRows(sqlmock.NewRows([]string{"failed_attempts"}).AddRow(1))

		_, err := service.ConfirmLinkWithPassword(context.Background(), "0b6f1c2e-6c1d-4d39-9a52-3f8e2f0b9a11", "guess", "ip", "ua")

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
		mock.ExpectQuery("UPDATE oauth_pending_links SET failed_attempts").
			WillReturnRows(sqlmock.NewRows([]string{"failed_attempts"}).AddRow(1))
		mock.ExpectExec("INSERT INTO external_identities").WillReturnResult(sqlmock.NewResult(1, 1))
		mock.ExpectExec("DELETE FROM oauth_pending_links").WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectQuery("SELECT id, email").
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at", "token_version",
			}).AddRow(int64(7), "user@example.com", "User", "client", true, true, nowUTC(), 0))
		mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))

		result, err := service.ConfirmLinkWithPassword(context.Background(), "0b6f1c2e-6c1d-4d39-9a52-3f8e2f0b9a11", "correct horse", "ip", "ua")

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

	_, err := service.ConfirmLinkWithPassword(context.Background(), "0b6f1c2e-6c1d-4d39-9a52-3f8e2f0b9a11", "anything", "ip", "ua")

	assert.ErrorIs(t, err, apperrors.ErrConflict)
}

// Before PasswordIsSet, this checked only hash.Valid: an empty string scans
// as Valid, so this branch used to fall through to bcrypt.CompareHashAndPassword
// against "" — an error, but the wrong one (ErrInvalidCredentials, "wrong
// password", instead of ErrConflict, "no password to check"). Same bug shape
// as HasPassword and RequestDeletion once disagreeing on this exact value.
func TestConfirmLinkWithPassword_EmptyStoredPasswordIsNotAPassword(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM oauth_pending_links").WillReturnRows(pendingRows("user@example.com"))
	mock.ExpectQuery("SELECT id, password FROM users WHERE email").
		WillReturnRows(sqlmock.NewRows([]string{"id", "password"}).AddRow(int64(7), ""))

	_, err := service.ConfirmLinkWithPassword(context.Background(), "0b6f1c2e-6c1d-4d39-9a52-3f8e2f0b9a11", "anything", "ip", "ua")

	assert.ErrorIs(t, err, apperrors.ErrConflict)
}

// An attempt nobody came back to finish within the window cannot be resumed by
// whoever uses the machine next.
func TestConfirmLinkWithPassword_RefusesAnExpiredAttempt(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM oauth_pending_links").WillReturnRows(
		sqlmock.NewRows([]string{"provider", "provider_user_id", "email", "name", "avatar_url", "email_from_provider", "provider_refresh_token_enc"}))

	_, err := service.ConfirmLinkWithPassword(context.Background(), "5d0e7a8b-1c2d-4e3f-8a9b-0c1d2e3f4a5b", "pw", "ip", "ua")

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
	// Адрес записывается в саму попытку: следующий шаг читает её из базы, а не
	// продолжает работу с той же структурой в памяти. Что запись действительно
	// доходит до строки, проверяет oauth_pending_integration_test.go — подмена
	// на такой вопрос отвечает «да» в любом случае.
	mock.ExpectExec("UPDATE oauth_pending_links SET email").
		WillReturnResult(sqlmock.NewResult(0, 1))

	outcome, err := service.CompleteWithEmail(context.Background(), "0b6f1c2e-6c1d-4d39-9a52-3f8e2f0b9a11", "taken@example.com", "ip", "ua")

	require.NoError(t, err)
	assert.Equal(t, OAuthNeedsLinkConfirmation, outcome.Result)
	assert.Nil(t, outcome.User)
}

// A typed address that nobody has yet creates no account: the attempt keeps
// the address, marked as typed, and the account appears only after the
// consents — unverified (see oauth_consents_integration_test.go).
func TestCompleteWithEmail_NewAddressWaitsForConsents(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("FROM oauth_pending_links").WillReturnRows(pendingRows(""))
	mock.ExpectQuery("SELECT id FROM users WHERE email").WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectExec("UPDATE oauth_pending_links SET email = \\$2, email_from_provider = false").
		WithArgs("0b6f1c2e-6c1d-4d39-9a52-3f8e2f0b9a11", "new@example.com").
		WillReturnResult(sqlmock.NewResult(0, 1))

	outcome, err := service.CompleteWithEmail(context.Background(), "0b6f1c2e-6c1d-4d39-9a52-3f8e2f0b9a11", "new@example.com", "ip", "ua")

	require.NoError(t, err)
	assert.Equal(t, OAuthNeedsConsents, outcome.Result)
	assert.Nil(t, outcome.User, "no account and no session before the consents")
	// No INSERT INTO users was expected: reaching one would fail the mock.
	assert.NoError(t, mock.ExpectationsWereMet())
}
