package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
)

// WSTicketTTL is how long a ticket can be redeemed for.
//
// Long enough for a browser to open a socket, short enough that a ticket that
// leaks into a log is worthless by the time anybody reads it.
const WSTicketTTL = 30 * time.Second

// IssueWSTicket mints a single-use credential for opening a chat socket.
//
// Browsers cannot set headers on a WebSocket connection, so something has to
// travel in the URL. This is what travels: thirty seconds, one connection, no
// other API.
func (s *Service) IssueWSTicket(ctx context.Context, userID int64) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate ticket: %w", err)
	}
	ticket := base64.RawURLEncoding.EncodeToString(raw)

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO ws_tickets (token_hash, user_id, expires_at)
		VALUES ($1, $2, NOW() + $3::interval)`,
		hashTicket(ticket), userID, fmt.Sprintf("%d seconds", int(WSTicketTTL.Seconds()))); err != nil {
		return "", fmt.Errorf("store ticket: %w", err)
	}

	// Expired tickets are cleared as they accumulate rather than by a job:
	// the table only ever holds seconds of traffic.
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM ws_tickets WHERE expires_at < NOW() - INTERVAL '1 hour'`); err != nil {
		s.log.Errorw("Failed to clear expired websocket tickets", "error", err)
	}

	return ticket, nil
}

// RedeemWSTicket exchanges a ticket for the user it was issued to.
//
// Marking and reading happen in one statement: two connections redeeming the
// same ticket must not both succeed.
func (s *Service) RedeemWSTicket(ctx context.Context, ticket string) (int64, error) {
	if ticket == "" {
		return 0, fmt.Errorf("no ticket: %w", apperrors.ErrTokenInvalid)
	}

	var userID int64
	err := s.db.QueryRowContext(ctx, `
		UPDATE ws_tickets SET used_at = NOW()
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
		RETURNING user_id`, hashTicket(ticket)).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		// Unknown, already used or expired: all three are the same answer to
		// whoever is holding it.
		return 0, fmt.Errorf("ticket not redeemable: %w", apperrors.ErrTokenInvalid)
	}
	if err != nil {
		return 0, fmt.Errorf("redeem ticket: %w", err)
	}

	return userID, nil
}

// PurgeExpiredWSTickets removes spent and expired tickets.
//
// They are cleared opportunistically on every issue as well; this is the job
// that keeps the table empty on an instance that issues none.
func (s *Service) PurgeExpiredWSTickets(ctx context.Context) (int, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM ws_tickets WHERE expires_at < NOW() - INTERVAL '1 hour'`)
	if err != nil {
		return 0, fmt.Errorf("purge websocket tickets: %w", err)
	}
	affected, _ := result.RowsAffected()
	return int(affected), nil
}

// PurgeRevokedRefreshTokens removes refresh tokens that can no longer be used.
//
// Revoked and expired rows are kept briefly on purpose: reuse detection reads
// them to tell a stolen token from a concurrent tab. After that they are just
// a growing table.
func (s *Service) PurgeRevokedRefreshTokens(ctx context.Context) (int, error) {
	result, err := s.db.ExecContext(ctx, `
		DELETE FROM refresh_tokens
		WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days')
		   OR expires_at < NOW() - INTERVAL '30 days'`)
	if err != nil {
		return 0, fmt.Errorf("purge refresh tokens: %w", err)
	}
	affected, _ := result.RowsAffected()
	return int(affected), nil
}

func hashTicket(ticket string) string {
	sum := sha256.Sum256([]byte(ticket))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
