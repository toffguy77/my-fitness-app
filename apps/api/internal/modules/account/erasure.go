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
	// AlsoSet is appended to the SET clause of an anonymising update, for a
	// table that has to record that it was anonymised rather than merely
	// repointed. conversations needs it: its uniqueness rule applies to live
	// conversations only, and the row has to leave that index in the same
	// statement that rewrites its client.
	AlsoSet string
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
	{Table: "food_entries", Column: "user_id", Strategy: StrategyDelete, Reason: "the person's food diary"},
	{Table: "water_logs", Column: "user_id", Strategy: StrategyDelete, Reason: "the person's water log"},
	{Table: "daily_metrics", Column: "user_id", Strategy: StrategyDelete, Reason: "weight and measurements"},
	{Table: "daily_calculated_targets", Column: "user_id", Strategy: StrategyDelete, Reason: "derived from their body profile"},
	{Table: "weekly_photos", Column: "user_id", Strategy: StrategyDelete, Reason: "progress photographs"},
	{Table: "user_foods", Column: "user_id", Strategy: StrategyDelete, Reason: "foods they authored"},
	{Table: "user_favorite_foods", Column: "user_id", Strategy: StrategyDelete, Reason: "their favourites"},
	{Table: "user_nutrient_preferences", Column: "user_id", Strategy: StrategyDelete, Reason: "their preferences"},
	{Table: "user_custom_recommendations", Column: "user_id", Strategy: StrategyDelete, Reason: "recommendations for them"},
	{Table: "meal_templates", Column: "user_id", Strategy: StrategyDelete, Reason: "their templates"},
	{Table: "user_settings", Column: "user_id", Strategy: StrategyDelete, Reason: "their settings"},
	{Table: "notifications", Column: "user_id", Strategy: StrategyDelete, Reason: "notifications addressed to them"},
	{Table: "content_notification_preferences", Column: "user_id", Strategy: StrategyDelete, Reason: "their subscription choices"},
	{Table: "content_notification_mute", Column: "user_id", Strategy: StrategyDelete, Reason: "their mute choices"},
	{Table: "refresh_tokens", Column: "user_id", Strategy: StrategyDelete, Reason: "their sessions"},
	{Table: "reset_tokens", Column: "user_id", Strategy: StrategyDelete, Reason: "password recovery tokens"},
	{Table: "email_verification_codes", Column: "user_id", Strategy: StrategyDelete, Reason: "verification codes"},
	{Table: "food_recognition_usage", Column: "user_id", Strategy: StrategyDelete, Reason: "their daily quota counters"},
	{Table: "data_exports", Column: "user_id", Strategy: StrategyDelete, Reason: "archives of their own data"},
	{Table: "message_read_status", Column: "user_id", Strategy: StrategyDelete, Reason: "read receipts they produced"},
	{Table: "tasks", Column: "user_id", Strategy: StrategyDelete, Reason: "tasks assigned to them"},
	{Table: "weekly_plans", Column: "user_id", Strategy: StrategyDelete, Reason: "plans written for them"},
	{Table: "curator_client_relationships", Column: "client_id", Strategy: StrategyDelete, Reason: "their assignment to a curator"},
	{Table: "user_consents", Column: "user_id", Strategy: StrategyDelete, Reason: "consent records for a person who no longer exists"},

	// Part of a curator's working record.
	{Table: "messages", Column: "sender_id", Strategy: StrategyAnonymize, Reason: "the curator's conversation must stay readable; the text loses its author"},
	{Table: "conversations", Column: "client_id", Strategy: StrategyAnonymize, Reason: "the conversation belongs to the curator too", AlsoSet: "anonymized_at = NOW()"},
	{Table: "weekly_reports", Column: "user_id", Strategy: StrategyAnonymize, Reason: "reports carry the curator's own feedback"},
	{Table: "articles", Column: "author_id", Strategy: StrategyAnonymize, Reason: "published articles outlive their author's account"},

	// Already anonymous aggregates.
	{Table: "curator_daily_snapshots", Column: "curator_id", Strategy: StrategyKeep, Reason: "per-curator counts, no personal data of the deleted user"},
	{Table: "curator_weekly_snapshots", Column: "curator_id", Strategy: StrategyKeep, Reason: "per-curator counts, no personal data of the deleted user"},
	{Table: "message_attachments", Column: "", Strategy: StrategyKeep, Reason: "reached through messages, which are anonymised rather than deleted"},
	{Table: "article_audience", Column: "", Strategy: StrategyKeep, Reason: "audience rules reference roles, not individuals"},
	{Table: "coach_client_relationships", Column: "", Strategy: StrategyKeep, Reason: "legacy table renamed to curator_client_relationships in migration 010"},
	{Table: "support_conversations", Column: "user_id", Strategy: StrategyDelete, Reason: "support chats belong to the person who wrote them"},
	{Table: "support_messages", Column: "operator_id", Strategy: StrategyKeep, Reason: "reached through the conversation, which is deleted with the account"},
	{Table: "leads", Column: "handled_by", Strategy: StrategyKeep, Reason: "an onboarding attempt by somebody else; the deleted curator's name drops to NULL"},
	{Table: "oauth_pending_links", Column: "", Strategy: StrategyKeep, Reason: "unfinished sign-in attempts, holding no reference to an account"},
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
			set := fmt.Sprintf("%s = $1", ts.Column)
			if ts.AlsoSet != "" {
				set += ", " + ts.AlsoSet
			}
			stmt = fmt.Sprintf("UPDATE %s SET %s WHERE %s = $2", ts.Table, set, ts.Column)
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
	// outage must not undo an erasure the user asked for. What fails here is
	// recorded by omission — files_purged_at stays NULL — and retried by
	// account.purge-files.
	if s.deleteFiles(ctx, userID) {
		if err := s.markFilesPurged(ctx, userID); err != nil {
			s.log.Error("Failed to record file purge", "user_id", userID, "error", err)
		}
	}

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
