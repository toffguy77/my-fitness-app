package auth

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The ticket travels in a URL, which reaches proxy logs, server logs, browser
// history and Referer headers. What makes that acceptable is that it is
// unguessable, single-use and good for half a minute.
func TestIssueWSTicket_MintsAnUnguessableTicketAndStoresOnlyItsHash(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	var storedHash string
	mock.ExpectExec("INSERT INTO ws_tickets").
		WithArgs(sqlmock.AnyArg(), int64(42), "30 seconds").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("DELETE FROM ws_tickets").WillReturnResult(sqlmock.NewResult(0, 0))

	ticket, err := service.IssueWSTicket(context.Background(), 42)

	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(ticket), 40, "32 random bytes, base64url")
	// A leaked table must not be a set of usable tickets.
	storedHash = hashTicket(ticket)
	assert.NotEqual(t, ticket, storedHash)
}

func TestIssueWSTicket_NeverRepeatsATicket(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	seen := make(map[string]bool, 50)
	for i := 0; i < 50; i++ {
		mock.ExpectExec("INSERT INTO ws_tickets").WillReturnResult(sqlmock.NewResult(1, 1))
		mock.ExpectExec("DELETE FROM ws_tickets").WillReturnResult(sqlmock.NewResult(0, 0))

		ticket, err := service.IssueWSTicket(context.Background(), 42)
		require.NoError(t, err)
		assert.False(t, seen[ticket], "ticket repeated")
		seen[ticket] = true
	}
}

func TestRedeemWSTicket_ReturnsTheUserAndSpendsTheTicket(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	// One statement marks and reads: two connections redeeming the same ticket
	// must not both succeed.
	mock.ExpectQuery("UPDATE ws_tickets SET used_at").
		WithArgs(hashTicket("the-ticket")).
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(int64(42)))

	userID, err := service.RedeemWSTicket(context.Background(), "the-ticket")

	require.NoError(t, err)
	assert.Equal(t, int64(42), userID)
}

// Unknown, already used and expired are the same answer to whoever is holding
// it, and the query cannot tell them apart either.
func TestRedeemWSTicket_RefusesAnythingNotRedeemable(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("UPDATE ws_tickets SET used_at").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}))

	_, err := service.RedeemWSTicket(context.Background(), "spent-or-expired")

	assert.ErrorIs(t, err, apperrors.ErrTokenInvalid)
}

func TestRedeemWSTicket_RefusesAnEmptyTicket(t *testing.T) {
	service, _, cleanup := setupTestService(t)
	defer cleanup()

	_, err := service.RedeemWSTicket(context.Background(), "")

	assert.ErrorIs(t, err, apperrors.ErrTokenInvalid)
}

func TestPurgeExpiredWSTickets_DeletesSpentAndExpired(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectExec("DELETE FROM ws_tickets").WillReturnResult(sqlmock.NewResult(0, 12))

	deleted, err := service.PurgeExpiredWSTickets(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 12, deleted)
}

// Revoked rows are kept briefly on purpose: reuse detection reads them to tell
// a stolen token from a concurrent tab. After that they are just a table that
// grows.
func TestPurgeRevokedRefreshTokens_DeletesOnlyWhatIsPastUse(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectExec("DELETE FROM refresh_tokens").WillReturnResult(sqlmock.NewResult(0, 5))

	deleted, err := service.PurgeRevokedRefreshTokens(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 5, deleted)
	assert.NoError(t, mock.ExpectationsWereMet())
}
