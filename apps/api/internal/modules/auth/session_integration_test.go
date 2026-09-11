//go:build integration

package auth_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The refresh-token lifecycle decides who stays signed in and who is thrown
// out, and until now it was proven only against sqlmock — which accepts a query
// naming a column the schema does not have. These run the same code against the
// real tables.
func newSessionService(t *testing.T) (*auth.Service, *middleware.TokenVersions) {
	service, versions, _ := newSessionServiceWithDB(t)
	return service, versions
}

func newSessionServiceWithDB(t *testing.T) (*auth.Service, *middleware.TokenVersions, *sql.DB) {
	t.Helper()

	db := testsupport.SchemaWithMigrations(t, "auth")
	versions := middleware.NewTokenVersions(db.DB)
	service := auth.NewService(db.DB, &config.Config{
		JWTSecret: "integration-secret-that-is-long-enough-32",
	}, logger.New()).WithSessionCache(versions)

	return service, versions, db.DB
}

func register(t *testing.T, service *auth.Service, email string) *auth.LoginResult {
	t.Helper()

	result, err := service.Register(context.Background(), email, "IntegrationPass1!", "Кто-то",
		"127.0.0.1", "integration", &auth.ConsentsInput{
			TermsOfService: true, PrivacyPolicy: true, DataProcessing: true,
		})
	require.NoError(t, err)
	require.NotEmpty(t, result.RefreshToken)
	return result
}

func TestRefreshRotatesTheToken(t *testing.T) {
	service, _ := newSessionService(t)
	ctx := context.Background()

	first := register(t, service, "rotate@example.test")

	second, err := service.RefreshTokens(ctx, first.RefreshToken, "127.0.0.1", "integration")
	require.NoError(t, err)
	assert.NotEqual(t, first.RefreshToken, second.RefreshToken,
		"a refresh token must not survive its own use")

	third, err := service.RefreshTokens(ctx, second.RefreshToken, "127.0.0.1", "integration")
	require.NoError(t, err)
	assert.NotEqual(t, second.RefreshToken, third.RefreshToken)
}

// Presenting a token that has already been exchanged, once the tab race it
// might have been is over, is the signature of a stolen one: either the thief
// or the owner is using a copy, and the two cannot be told apart. Every session
// ends.
//
// The revocation is backdated rather than waited out: the grace period is
// thirty seconds, and a test that sleeps for them is a test nobody runs.
func TestRefreshReuseAfterTheGracePeriodEndsEverySession(t *testing.T) {
	service, _, db := newSessionServiceWithDB(t)
	ctx := context.Background()

	first := register(t, service, "reuse@example.test")
	second, err := service.RefreshTokens(ctx, first.RefreshToken, "127.0.0.1", "integration")
	require.NoError(t, err)

	_, err = db.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = revoked_at - INTERVAL '5 minutes'
		 WHERE revoked_at IS NOT NULL`)
	require.NoError(t, err)

	_, err = service.RefreshTokens(ctx, first.RefreshToken, "127.0.0.1", "thief")
	require.Error(t, err, "a token used twice, well after any rotation race, must be refused")

	_, err = service.RefreshTokens(ctx, second.RefreshToken, "127.0.0.1", "integration")
	require.Error(t, err,
		"the token issued in the same chain must fall with it, or the thief keeps the session")
}

// A password change must not leave the old access tokens working, and must not
// leave the person who changed it unable to use the application either.
func TestChangePasswordEndsOtherSessionsAndKeepsTheCallersOwn(t *testing.T) {
	service, versions := newSessionService(t)
	ctx := context.Background()

	session := register(t, service, "change@example.test")

	before, err := versions.Current(ctx, session.User.ID)
	require.NoError(t, err)

	replacement, err := service.Login(ctx, "change@example.test", "IntegrationPass1!",
		"127.0.0.1", "integration", false)
	require.NoError(t, err)

	require.NoError(t, service.ChangePassword(ctx, session.User.ID,
		"IntegrationPass1!", "AnotherPass2@", replacement))

	after, err := versions.Current(ctx, session.User.ID)
	require.NoError(t, err)
	assert.Greater(t, after, before,
		"access tokens minted before the change must stop being accepted")

	// The pair handed back by the change works: signing somebody out of the
	// device they are standing at, as a reward for changing their password,
	// teaches them not to.
	_, err = service.RefreshTokens(ctx, replacement.RefreshToken, "127.0.0.1", "integration")
	require.NoError(t, err,
		"the session handed back by the change must work, or the person is locked out of their own account")

	// And the new password is the one that opens the account.
	_, err = service.Login(ctx, "change@example.test", "IntegrationPass1!", "127.0.0.1", "integration", false)
	require.Error(t, err)
	_, err = service.Login(ctx, "change@example.test", "AnotherPass2@", "127.0.0.1", "integration", false)
	require.NoError(t, err)
}

// The grace period exists for a race between two tabs rotating the same token
// at once. It must not extend to a token revoked for safety: for thirty seconds
// after a password change, the old refresh token still bought a working
// session — the very token the password was changed to defeat.
func TestRevokedForSafetyGetsNoGracePeriod(t *testing.T) {
	service, _ := newSessionService(t)
	ctx := context.Background()

	stolen := register(t, service, "stolen@example.test")
	own, err := service.Login(ctx, "stolen@example.test", "IntegrationPass1!",
		"127.0.0.1", "integration", false)
	require.NoError(t, err)

	require.NoError(t, service.ChangePassword(ctx, stolen.User.ID,
		"IntegrationPass1!", "AnotherPass2@", own))

	// Immediately: well inside the thirty seconds.
	_, err = service.RefreshTokens(ctx, stolen.RefreshToken, "127.0.0.1", "thief")
	require.Error(t, err,
		"a token revoked by a password change must not be exchangeable, however recently it was revoked")
}

// ...while the race it was written for still works: a second tab presenting the
// token the first tab just rotated gets a session rather than an eviction.
func TestConcurrentRotationKeepsTheGracePeriod(t *testing.T) {
	service, _ := newSessionService(t)
	ctx := context.Background()

	session := register(t, service, "tabs@example.test")

	_, err := service.RefreshTokens(ctx, session.RefreshToken, "127.0.0.1", "tab-one")
	require.NoError(t, err)

	second, err := service.RefreshTokens(ctx, session.RefreshToken, "127.0.0.1", "tab-two")
	require.NoError(t, err, "a slow second tab is not a thief")
	require.NotEmpty(t, second.RefreshToken)
}
