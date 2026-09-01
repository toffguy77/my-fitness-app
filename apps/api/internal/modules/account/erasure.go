// Package account implements the lifecycle a user controls: requesting
// deletion, cancelling it, and taking their data with them.
package account

import (
	"context"
	"fmt"
	"time"
)

// Strategy describes what happens to one table's rows when a user is erased.
type Strategy string

const (
	// StrategyDelete removes rows that belong to the user alone.
	StrategyDelete Strategy = "delete"
	// StrategyAnonymize keeps rows that are part of somebody else's working
	// record — a curator's conversation, a report they wrote feedback on — but
	// severs them from the person.
	StrategyAnonymize Strategy = "anonymize"
	// StrategyKeep leaves rows that hold no personal data: aggregates that were
	// already anonymous.
	StrategyKeep Strategy = "keep"
)

// TableStrategy pairs a table with what to do with it.
type TableStrategy struct {
	Table    string
	Column   string // column referencing users(id)
	Strategy Strategy
	// Reason is recorded because "why is this kept?" is the question an audit
	// asks, and the answer must not live only in someone's memory.
	Reason string
}

// strategies covers every table that references users(id).
//
// A blanket cascade was not an option: it would have deleted a curator's
// conversation history and left the files in S3 untouched. The completeness of
// this list is checked against the live schema by TestErasureCoversSchema —
// a new table with a user reference and no entry here fails the build, because
// that is exactly how personal data gets forgotten.
var strategies = []TableStrategy{
	// Belongs to the user alone.
	{"food_entries", "user_id", StrategyDelete, "the person's food diary"},
	{"water_logs", "user_id", StrategyDelete, "the person's water log"},
	{"daily_metrics", "user_id", StrategyDelete, "weight and measurements"},
	{"daily_calculated_targets", "user_id", StrategyDelete, "derived from their body profile"},
	{"weekly_photos", "user_id", StrategyDelete, "progress photographs"},
	{"user_foods", "user_id", StrategyDelete, "foods they authored"},
	{"user_favorite_foods", "user_id", StrategyDelete, "their favourites"},
	{"user_nutrient_preferences", "user_id", StrategyDelete, "their preferences"},
	{"user_custom_recommendations", "user_id", StrategyDelete, "recommendations for them"},
	{"meal_templates", "user_id", StrategyDelete, "their templates"},
	{"user_settings", "user_id", StrategyDelete, "their settings"},
	{"notifications", "user_id", StrategyDelete, "notifications addressed to them"},
	{"content_notification_preferences", "user_id", StrategyDelete, "their subscription choices"},
	{"content_notification_mute", "user_id", StrategyDelete, "their mute choices"},
	{"refresh_tokens", "user_id", StrategyDelete, "their sessions"},
	{"reset_tokens", "user_id", StrategyDelete, "password recovery tokens"},
	{"email_verification_codes", "user_id", StrategyDelete, "verification codes"},
	{"food_recognition_usage", "user_id", StrategyDelete, "their daily quota counters"},
	{"data_exports", "user_id", StrategyDelete, "archives of their own data"},
	{"message_read_status", "user_id", StrategyDelete, "read receipts they produced"},
	{"tasks", "user_id", StrategyDelete, "tasks assigned to them"},
	{"weekly_plans", "user_id", StrategyDelete, "plans written for them"},
	{"curator_client_relationships", "client_id", StrategyDelete, "their assignment to a curator"},
	{"user_consents", "user_id", StrategyDelete, "consent records for a person who no longer exists"},

	// Part of a curator's working record.
	{"messages", "sender_id", StrategyAnonymize,
		"the curator's conversation must stay readable; the text loses its author"},
	{"conversations", "client_id", StrategyAnonymize,
		"the conversation belongs to the curator too"},
	{"weekly_reports", "user_id", StrategyAnonymize,
		"reports carry the curator's own feedback"},
	{"articles", "author_id", StrategyAnonymize,
		"published articles outlive their author's account"},

	// Already anonymous aggregates.
	{"curator_daily_snapshots", "curator_id", StrategyKeep,
		"per-curator counts, no personal data of the deleted user"},
	{"curator_weekly_snapshots", "curator_id", StrategyKeep,
		"per-curator counts, no personal data of the deleted user"},
	{"message_attachments", "", StrategyKeep,
		"reached through messages, which are anonymised rather than deleted"},
	{"article_audience", "", StrategyKeep,
		"audience rules reference roles, not individuals"},
	{"coach_client_relationships", "", StrategyKeep,
		"legacy table renamed to curator_client_relationships in migration 010"},
	{"leads", "handled_by", StrategyKeep,
		"an onboarding attempt by somebody else; the deleted curator's name drops to NULL"},
	{"oauth_pending_links", "", StrategyKeep,
		"unfinished sign-in attempts, holding no reference to an account"},
}

// Strategies exposes the table for tests and documentation.
func Strategies() []TableStrategy { return strategies }

// systemUserEmail identifies the placeholder anonymised rows point at.
const systemUserEmail = "deleted-user@system.invalid"

// Erase removes or anonymises everything belonging to a user, in one
// transaction. Files are deleted afterwards, once the transaction has
// committed: the reverse order would leave a user whose files are gone but
// whose data came back on a rollback.
func (s *Service) Erase(ctx context.Context, userID int64) error {
	systemUserID, err := s.systemUserID(ctx)
	if err != nil {
		return fmt.Errorf("resolve system user: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin erasure: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	for _, ts := range strategies {
		if ts.Column == "" || ts.Strategy == StrategyKeep {
			continue
		}

		var stmt string
		var args []any
		switch ts.Strategy {
		case StrategyDelete:
			stmt = fmt.Sprintf("DELETE FROM %s WHERE %s = $1", ts.Table, ts.Column)
			args = []any{userID}
		case StrategyAnonymize:
			stmt = fmt.Sprintf("UPDATE %s SET %s = $1 WHERE %s = $2", ts.Table, ts.Column, ts.Column)
			args = []any{systemUserID, userID}
		}

		if _, err := tx.ExecContext(ctx, stmt, args...); err != nil {
			return fmt.Errorf("erase %s: %w", ts.Table, err)
		}
	}

	// The account row itself is kept but stripped, so foreign keys elsewhere
	// stay valid while nothing identifying remains.
	if _, err := tx.ExecContext(ctx, `
		UPDATE users
		SET email = 'deleted-' || id || '@deleted.invalid',
		    password = 'NOLOGIN',
		    name = NULL,
		    avatar_url = NULL,
		    deleted_at = NOW(),
		    anonymized_at = NOW()
		WHERE id = $1`, userID); err != nil {
		return fmt.Errorf("anonymize user record: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit erasure: %w", err)
	}

	// Best effort by design: the database is already consistent, and a storage
	// outage must not undo an erasure the user asked for. Leftovers are picked
	// up by the next run of the job.
	s.deleteFiles(ctx, userID)

	return nil
}

// systemUserID resolves the placeholder account anonymised rows point at.
func (s *Service) systemUserID(ctx context.Context) (int64, error) {
	var id int64
	err := s.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE email = $1 AND is_system = true`, systemUserEmail).Scan(&id)
	return id, err
}

// PendingErasures lists accounts whose cancellation window has closed.
func (s *Service) PendingErasures(ctx context.Context, window time.Duration) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id FROM users
		WHERE deletion_requested_at IS NOT NULL
		  AND deleted_at IS NULL
		  AND deletion_requested_at < NOW() - $1::interval`,
		fmt.Sprintf("%d seconds", int(window.Seconds())))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
