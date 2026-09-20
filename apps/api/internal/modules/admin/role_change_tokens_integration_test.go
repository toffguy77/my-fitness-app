//go:build integration

package admin_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/admin"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// middleware.RequireRole reads the role out of the parsed JWT, not the
// database. The only thing that makes a role change take effect for tokens
// already handed out is middleware.TokenVersions: an access token carries the
// version the account had when it was minted, and bumping the version makes
// every such token stop being accepted. admin.Service.ChangeRole must do that
// bump, in the same transaction as the role update, on both of its branches —
// a promotion and a demotion.
//
// Asserting only that ChangeRole returned no error, or that the row's
// token_version column moved, would pass even if the bump landed somewhere
// the live auth check never reads. So this goes through
// middleware.TokenVersions itself and primes its cache before the change: a
// bump that does not also drop the cached entry would leave Current()
// answering with the pre-change version for up to thirty seconds — which is
// exactly the window a demoted curator would still be trusted in. Reading the
// version back through the same object the request path uses is what proves
// the token is actually rejected the moment the change lands, not eventually.
func newRoleChangeService(t *testing.T) (*admin.Service, *middleware.TokenVersions, *database.DB, func(ctx context.Context, email, role string) int64) {
	t.Helper()

	db := testsupport.SchemaWithMigrations(t, "rolechange")
	versions := middleware.NewTokenVersions(db.DB)
	service := admin.NewService(db, logger.New()).WithSessionCache(versions)

	newUser := func(ctx context.Context, email, role string) int64 {
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', $1, $2) RETURNING id`,
			email, role).Scan(&id))
		return id
	}

	return service, versions, db, newUser
}

func TestPromotionInvalidatesTheOldToken(t *testing.T) {
	service, versions, _, newUser := newRoleChangeService(t)
	ctx := context.Background()

	clientID := newUser(ctx, "promoted@example.test", "client")

	// Prime the cache the same way a request in flight would: read the
	// version before the change happens.
	before, err := versions.Current(ctx, clientID)
	require.NoError(t, err)
	require.Equal(t, 0, before, "a freshly created account starts at version 0")

	require.NoError(t, service.ChangeRole(ctx, clientID, "coordinator"))

	after, err := versions.Current(ctx, clientID)
	require.NoError(t, err)
	assert.Greater(t, after, before,
		"a client promoted to coordinator whose token version did not move keeps their pre-promotion token valid, and a token minted for a mere client does not carry coordinator rights")
}

func TestDemotionInvalidatesTheOldToken(t *testing.T) {
	service, versions, db, newUser := newRoleChangeService(t)
	ctx := context.Background()

	// A second, unaffected curator so demoteCurator's reassignment step has
	// somewhere to send the demoted curator's clients.
	otherCuratorID := newUser(ctx, "other-curator@example.test", "coordinator")
	curatorID := newUser(ctx, "demoted-curator@example.test", "coordinator")
	clientID := newUser(ctx, "orphaned-client@example.test", "client")

	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1, $2, 'active')`,
		curatorID, clientID)
	require.NoError(t, err)

	before, err := versions.Current(ctx, curatorID)
	require.NoError(t, err)
	require.Equal(t, 0, before)

	otherBefore, err := versions.Current(ctx, otherCuratorID)
	require.NoError(t, err)

	require.NoError(t, service.ChangeRole(ctx, curatorID, "client"))

	after, err := versions.Current(ctx, curatorID)
	require.NoError(t, err)
	assert.Greater(t, after, before,
		"a curator demoted to client whose token version did not move keeps reading clients' personal data and support conversations, reassigned to someone else in the database already, until their old token expires on its own")

	otherAfter, err := versions.Current(ctx, otherCuratorID)
	require.NoError(t, err)
	assert.Equal(t, otherBefore, otherAfter,
		"only the demoted curator's session should end, not the curator who was not touched")

	// The reassignment this test's setup exists to trigger is not the
	// subject here, but it going through is what proves the version bump
	// happened inside a demoteCurator that actually ran to completion, not a
	// vacuous demotion of a curator with no clients.
	var newCuratorID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT curator_id FROM curator_client_relationships WHERE client_id = $1 AND status = 'active'`,
		clientID).Scan(&newCuratorID))
	assert.Equal(t, otherCuratorID, newCuratorID, "the orphaned client must have been reassigned")
}
