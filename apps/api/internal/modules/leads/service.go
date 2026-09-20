package leads

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
)

// Retention bounds how long the contact of somebody who never became a user is
// kept. Indefinite storage of a stranger's address and body parameters is not
// something a reminder justifies.
const Retention = 90 * 24 * time.Hour

// ReminderDelay is how long after the attempt the single reminder goes out.
const ReminderDelay = 24 * time.Hour

// maxQueueOffset bounds how far a single Queue request can page into the
// list. See the comment on Queue for why this exists alongside migration 075.
const maxQueueOffset = 100_000

// Service stores and follows up on onboarding leads.
type Service struct {
	db     *sql.DB
	log    *logger.Logger
	secret string
}

// NewService creates the service. secret signs resume links.
func NewService(db *sql.DB, log *logger.Logger, secret string) *Service {
	return &Service{db: db, log: log, secret: secret}
}

// Create saves an onboarding attempt and returns the lead with a resume token.
//
// Refuses without the data-processing consent: body parameters are health data,
// and storing them because somebody typed an address is not a basis.
func (s *Service) Create(ctx context.Context, in CreateInput, ip, ua string) (*Lead, string, error) {
	if !in.Consents.DataProcessing {
		return nil, "", fmt.Errorf("data processing consent is required: %w", apperrors.ErrValidation)
	}

	email := strings.ToLower(strings.TrimSpace(in.Email))
	step := in.LastStep
	if step == "" {
		step = "contact"
	}
	// The contact step is the only place a lead was ever created before this
	// field existed, so an old or unaware client defaults there rather than
	// writing an empty source.
	captureSource := in.CaptureSource
	if captureSource == "" {
		captureSource = "contact_step"
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", fmt.Errorf("begin lead: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	lead := &Lead{
		Email:      email,
		Name:       in.Name,
		Parameters: in.Parameters,
		Result:     in.Result,
		LastStep:   step,
		Source:     in.Source,
		Consents:   in.Consents,
	}

	err = tx.QueryRowContext(ctx, `
		INSERT INTO leads (
			email, name, sex, birth_date, height_cm, weight_kg, activity_level, goal,
			calories, protein, fat, carbs, water_glasses,
			last_step, source, data_consent, contact_consent, capture_source
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		RETURNING id, created_at, updated_at`,
		email, nullIfEmpty(in.Name),
		nullIfEmpty(in.Parameters.Sex), nullIfEmpty(in.Parameters.BirthDate),
		in.Parameters.HeightCm, in.Parameters.WeightKg,
		nullIfEmpty(in.Parameters.ActivityLevel), nullIfEmpty(in.Parameters.Goal),
		resultField(in.Result, func(r *Result) any { return r.Calories }),
		resultField(in.Result, func(r *Result) any { return r.Protein }),
		resultField(in.Result, func(r *Result) any { return r.Fat }),
		resultField(in.Result, func(r *Result) any { return r.Carbs }),
		resultField(in.Result, func(r *Result) any { return r.WaterGlasses }),
		step, nullIfEmpty(in.Source), in.Consents.DataProcessing, in.Consents.Contact, captureSource,
	).Scan(&lead.ID, &lead.CreatedAt, &lead.UpdatedAt)
	if err != nil {
		return nil, "", fmt.Errorf("create lead: %w", err)
	}

	// The consents are recorded the same way a registered user's are: what was
	// agreed to, when, and from where.
	if err := recordConsent(ctx, tx, lead.ID, "data_processing", in.Consents.DataProcessing, ip, ua); err != nil {
		return nil, "", err
	}
	if err := recordConsent(ctx, tx, lead.ID, "contact", in.Consents.Contact, ip, ua); err != nil {
		return nil, "", err
	}

	if err := tx.Commit(); err != nil {
		return nil, "", fmt.Errorf("commit lead: %w", err)
	}

	s.log.Info("Saved onboarding lead", "lead_id", lead.ID, "step", step)
	return lead, s.ResumeToken(lead.ID), nil
}

// UpdateStep records how far the person got.
//
// Takes the signed token rather than an identifier: an identifier in a request
// anyone can make would let a stranger overwrite somebody else's lead.
func (s *Service) UpdateStep(ctx context.Context, token, step string) error {
	leadID, err := parseToken(s.secret, token)
	if err != nil {
		return err
	}

	result, err := s.db.ExecContext(ctx,
		`UPDATE leads SET last_step = $2, updated_at = NOW() WHERE id = $1`, leadID, step)
	if err != nil {
		return fmt.Errorf("update lead step: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return fmt.Errorf("lead not found: %w", apperrors.ErrNotFound)
	}
	return nil
}

// ByToken loads the lead a resume link names.
func (s *Service) ByToken(ctx context.Context, token string) (*Lead, error) {
	leadID, err := parseToken(s.secret, token)
	if err != nil {
		return nil, err
	}
	return s.byID(ctx, leadID)
}

// ResumeToken mints a link token for a lead.
func (s *Service) ResumeToken(leadID string) string {
	return signToken(s.secret, leadID, time.Now().Add(ResumeTTL))
}

// Claim transfers a lead onto a freshly created account and removes it.
//
// The addresses need not match: somebody may leave one address in the wizard
// and register with another. What decides is holding the token.
func (s *Service) Claim(ctx context.Context, token string, userID int64) (*Lead, error) {
	lead, err := s.ByToken(ctx, token)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin claim: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// The consents move onto the account rather than disappearing with the row.
	if _, err := tx.ExecContext(ctx,
		`UPDATE user_consents SET user_id = $1, lead_id = NULL WHERE lead_id = $2`,
		userID, lead.ID); err != nil {
		return nil, fmt.Errorf("move consents: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM leads WHERE id = $1`, lead.ID); err != nil {
		return nil, fmt.Errorf("delete claimed lead: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit claim: %w", err)
	}

	s.log.Info("Claimed onboarding lead", "lead_id", lead.ID, "user_id", userID)
	return lead, nil
}

// Unsubscribe deletes the lead the token names.
//
// The reminder offers "unsubscribe and delete my data" rather than a flag,
// because for somebody who is not a user there is nothing left to keep: their
// contact only existed so we could send the message they are declining.
func (s *Service) Unsubscribe(ctx context.Context, token string) error {
	leadID, err := parseToken(s.secret, token)
	if err != nil {
		return err
	}

	if _, err := s.db.ExecContext(ctx, `DELETE FROM leads WHERE id = $1`, leadID); err != nil {
		return fmt.Errorf("unsubscribe lead: %w", err)
	}

	s.log.Info("Lead unsubscribed and deleted", "lead_id", leadID)
	return nil
}

// ClaimInto attaches an onboarding attempt to a new account: it moves the
// consents, writes the answers into the profile and removes the lead.
//
// This is the whole interface the auth module needs, so the two do not have to
// know each other's types.
func (s *Service) ClaimInto(ctx context.Context, token string, userID int64) error {
	lead, err := s.Claim(ctx, token, userID)
	if err != nil {
		return err
	}
	return s.ApplyToProfile(ctx, lead, userID)
}

// LeadIDForToken validates a resume token and returns the lead it names.
//
// The support bot needs exactly this and nothing else: the identifier, proved
// to have come from a link we minted.
func (s *Service) LeadIDForToken(ctx context.Context, token string) (string, error) {
	lead, err := s.ByToken(ctx, token)
	if err != nil {
		return "", err
	}
	return lead.ID, nil
}

// Queue returns leads in the order a curator should work them: whoever has
// waited longest, among those nobody has yet marked handled. AgeDays,
// ReminderSent and ConversationID are read alongside the lead itself, so a
// curator opening the queue does not have to cross-reference two tables (leads,
// support_conversations) by hand.
//
// includeHandled adds back everyone already dealt with, oldest first as well,
// for whoever wants the full history rather than the work still open.
func (s *Service) Queue(ctx context.Context, includeHandled bool, limit, offset int) ([]QueueEntry, int, error) {
	// include_handled=true never shrinks the list, so an offset reachable by
	// ordinary scrolling is unbounded — response.ParsePage caps Limit at 100
	// but leaves Offset alone. Clamped rather than rejected, the same
	// philosophy as the Limit cap: a stray zero on the end of a page request
	// should not deny a curator their data, just stop it short of the point
	// where a single request can tie up a database core.
	//
	// This clamp is not what turns a catastrophic query into a cheap one —
	// that was migration 075 (idx_support_conversations_lead_recency), which
	// removed a sequential scan of support_conversations run once per row on
	// the way to a large offset (order of tens of seconds at a 40k offset on
	// 50k leads, down to double-digit milliseconds; see that migration's
	// comment for the remeasured numbers). Pushing pagination ahead of the
	// correlated subquery, below, took the subquery's cost out of the offset
	// entirely: it now runs exactly `limit` times regardless of offset,
	// instead of `offset+limit`. What is left for this clamp to bound is
	// smaller and genuinely second-order: Postgres still has to walk
	// `offset` entries of the index-only scan on leads.created_at to reach
	// the page, and that residual — tens of milliseconds at offset ~100k on
	// 150k leads, not tens of seconds — is what stays unbounded without it.
	if offset > maxQueueOffset {
		offset = maxQueueOffset
	}

	var total int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM leads WHERE ($1::boolean OR handled_at IS NULL)`,
		includeHandled,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count lead queue: %w", err)
	}

	// AgeDays is computed here, not in Go, so it comes from the same clock as
	// created_at itself rather than whichever timezone a curator's browser
	// happens to be in.
	//
	// The conversation is a correlated subquery rather than a LEFT JOIN: a
	// lead could in principle have more than one support_conversations row
	// (a person can reopen the bot with a new chat_id), and a JOIN would
	// duplicate the lead row for each. Only the most recently active
	// conversation is a reasonable transition target.
	//
	// That subquery sits outside the paged subquery on purpose. Written as a
	// single flat SELECT with LIMIT/OFFSET, Postgres evaluates a correlated
	// subquery once per row the sort produces *before* OFFSET discards
	// anything — offset+limit evaluations, growing with the offset even
	// though the offset itself does no useful work once idx_leads_created_at
	// and idx_support_conversations_lead_recency both exist. Pushing
	// WHERE/ORDER/LIMIT/OFFSET into `page` first means only the page's own
	// rows — exactly `limit`, regardless of offset — ever reach the
	// correlated subquery. Measured on a 150k-lead, 60k-conversation table at
	// offset 99,999 with both indexes present: ~239ms flat vs. ~17ms paged
	// first, and the subquery's loop count drops from offset+limit (100,019)
	// to exactly limit (20).
	rows, err := s.db.QueryContext(ctx, `
		SELECT page.id, page.email, page.name, page.sex, page.birth_date,
		       page.height_cm, page.weight_kg, page.activity_level, page.goal,
		       page.calories, page.protein, page.fat, page.carbs, page.water_glasses,
		       page.last_step, page.source, page.data_consent, page.contact_consent,
		       page.handled_at, page.created_at, page.updated_at,
		       EXTRACT(DAY FROM NOW() - page.created_at)::int,
		       page.reminder_sent_at IS NOT NULL,
		       (SELECT c.id::text FROM support_conversations c
		          WHERE c.lead_id = page.id ORDER BY c.last_message_at DESC LIMIT 1)
		FROM (
		    SELECT l.id, l.email, COALESCE(l.name, '') AS name, COALESCE(l.sex, '') AS sex,
		           l.birth_date, l.height_cm, l.weight_kg,
		           COALESCE(l.activity_level, '') AS activity_level, COALESCE(l.goal, '') AS goal,
		           l.calories, l.protein, l.fat, l.carbs, l.water_glasses,
		           l.last_step, COALESCE(l.source, '') AS source, l.data_consent, l.contact_consent,
		           l.handled_at, l.created_at, l.updated_at, l.reminder_sent_at
		    FROM leads l
		    WHERE ($1::boolean OR l.handled_at IS NULL)
		    ORDER BY l.created_at ASC, l.id ASC
		    LIMIT $2 OFFSET $3
		) page
		ORDER BY page.created_at ASC, page.id ASC`,
		includeHandled, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list lead queue: %w", err)
	}
	defer rows.Close()

	entries := make([]QueueEntry, 0, limit)
	for rows.Next() {
		var e QueueEntry
		var conversationID sql.NullString

		// The base 21 columns share scanLead's destination order with byID
		// and DueReminders, instead of repeating it a third time here: a
		// column added to one query and not the other used to be a silent
		// field-shift (each Scan call still succeeds — dest count and types
		// line up, values just land one field over). The three extra columns
		// Queue alone reads are appended after them in the same Scan call.
		lead, err := scanLead(rows, &e.AgeDays, &e.ReminderSent, &conversationID)
		if err != nil {
			return nil, 0, fmt.Errorf("scan lead queue entry: %w", err)
		}
		e.Lead = *lead
		e.ContactAllowed = e.Consents.Contact
		// Left nil unless a conversation actually links here: a curator must
		// never be offered a transition to a conversation that does not
		// exist, whether because the person never reached the bot or because
		// the widget plan that fills this column widely has not shipped yet.
		if conversationID.Valid {
			id := conversationID.String
			e.ConversationID = &id
		}

		entries = append(entries, e)
	}
	return entries, total, rows.Err()
}

// MarkHandled records that somebody has dealt with this person.
//
// The queue is shared: two coordinators can open the same lead within
// moments of each other. Losing that race costs one extra conversation, not
// a lost person — but the record of who claimed it first must not be
// overwritten, or nobody can tell who actually spoke to them. The condition
// lives in the UPDATE itself, not in a check beforehand: two coordinators
// clicking at the same instant have to be split apart by the database, not
// by a race in this process.
func (s *Service) MarkHandled(ctx context.Context, leadID string, byUserID int64) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE leads
		   SET handled_at = NOW(), handled_by = $2, updated_at = NOW()
		 WHERE id = $1 AND handled_at IS NULL`,
		leadID, byUserID)
	if err != nil {
		return fmt.Errorf("mark lead handled: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("mark lead handled: %w", err)
	}
	if affected > 0 {
		return nil
	}

	// Zero rows affected is ambiguous on its own: the lead may not exist at
	// all, or it may already be claimed. Those are different answers to the
	// person asking, so tell them apart with a lookup rather than collapsing
	// both into one error.
	var exists bool
	if err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM leads WHERE id = $1)`, leadID,
	).Scan(&exists); err != nil {
		return fmt.Errorf("check lead exists: %w", err)
	}
	if !exists {
		return fmt.Errorf("lead not found: %w", apperrors.ErrNotFound)
	}
	return fmt.Errorf("lead already handled: %w", apperrors.ErrConflict)
}

// DueReminders returns leads owed their single reminder.
func (s *Service) DueReminders(ctx context.Context) ([]Lead, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, email, COALESCE(name, ''), COALESCE(sex, ''), birth_date,
		       height_cm, weight_kg, COALESCE(activity_level, ''), COALESCE(goal, ''),
		       calories, protein, fat, carbs, water_glasses,
		       last_step, COALESCE(source, ''), data_consent, contact_consent,
		       handled_at, created_at, updated_at
		FROM leads
		WHERE reminder_sent_at IS NULL
		  AND contact_consent = true
		  AND created_at <= NOW() - $1::interval
		  AND created_at > NOW() - $2::interval`,
		intervalOf(ReminderDelay), intervalOf(Retention))
	if err != nil {
		return nil, fmt.Errorf("list due reminders: %w", err)
	}
	defer rows.Close()

	due := make([]Lead, 0)
	for rows.Next() {
		lead, err := scanLead(rows)
		if err != nil {
			return nil, err
		}
		due = append(due, *lead)
	}
	return due, rows.Err()
}

// MarkReminded records the send, so the reminder stays a single reminder even
// if the job runs twice.
func (s *Service) MarkReminded(ctx context.Context, leadID string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE leads SET reminder_sent_at = NOW() WHERE id = $1`, leadID)
	if err != nil {
		return fmt.Errorf("mark lead reminded: %w", err)
	}
	return nil
}

// PurgeExpired deletes leads past the retention period.
func (s *Service) PurgeExpired(ctx context.Context) (int, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM leads WHERE created_at <= NOW() - $1::interval`, intervalOf(Retention))
	if err != nil {
		return 0, fmt.Errorf("purge leads: %w", err)
	}
	affected, _ := result.RowsAffected()
	return int(affected), nil
}

func (s *Service) byID(ctx context.Context, leadID string) (*Lead, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, email, COALESCE(name, ''), COALESCE(sex, ''), birth_date,
		       height_cm, weight_kg, COALESCE(activity_level, ''), COALESCE(goal, ''),
		       calories, protein, fat, carbs, water_glasses,
		       last_step, COALESCE(source, ''), data_consent, contact_consent,
		       handled_at, created_at, updated_at
		FROM leads WHERE id = $1`, leadID)

	lead, err := scanLead(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("lead not found: %w", apperrors.ErrNotFound)
	}
	return lead, err
}

type scanner interface {
	Scan(dest ...any) error
}

// scanLead reads the 21 columns every lead query selects, in the one order
// they are declared here. extra takes destinations for whatever additional
// columns a caller's own SELECT appends after those 21 (Queue's AgeDays,
// ReminderSent and conversation id) — appended to the same Scan call, not a
// second one: database/sql requires every call to Scan to supply a
// destination for every column the row actually has, so a caller cannot
// scan the base 21 here and the rest itself.
func scanLead(row scanner, extra ...any) (*Lead, error) {
	var lead Lead
	var birthDate sql.NullTime
	var height, weight, calories, protein, fat, carbs sql.NullFloat64
	var water sql.NullInt64
	var handledAt sql.NullTime

	dest := []any{
		&lead.ID, &lead.Email, &lead.Name, &lead.Parameters.Sex, &birthDate,
		&height, &weight, &lead.Parameters.ActivityLevel, &lead.Parameters.Goal,
		&calories, &protein, &fat, &carbs, &water,
		&lead.LastStep, &lead.Source, &lead.Consents.DataProcessing, &lead.Consents.Contact,
		&handledAt, &lead.CreatedAt, &lead.UpdatedAt,
	}
	dest = append(dest, extra...)

	if err := row.Scan(dest...); err != nil {
		return nil, err
	}

	fillLeadOptionalFields(&lead, birthDate, height, weight, calories, protein, fat, carbs, water, handledAt)
	return &lead, nil
}

// fillLeadOptionalFields applies the nullable columns shared by every query
// that reads a lead row, so Queue's extra columns do not duplicate this
// parsing.
func fillLeadOptionalFields(
	lead *Lead,
	birthDate sql.NullTime,
	height, weight, calories, protein, fat, carbs sql.NullFloat64,
	water sql.NullInt64,
	handledAt sql.NullTime,
) {
	if birthDate.Valid {
		lead.Parameters.BirthDate = birthDate.Time.Format("2006-01-02")
	}
	if height.Valid {
		lead.Parameters.HeightCm = &height.Float64
	}
	if weight.Valid {
		lead.Parameters.WeightKg = &weight.Float64
	}
	if calories.Valid {
		lead.Result = &Result{
			Calories:     calories.Float64,
			Protein:      protein.Float64,
			Fat:          fat.Float64,
			Carbs:        carbs.Float64,
			WaterGlasses: int(water.Int64),
		}
	}
	if handledAt.Valid {
		lead.HandledAt = &handledAt.Time
	}
}

func recordConsent(ctx context.Context, tx *sql.Tx, leadID, consentType string, granted bool, ip, ua string) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO user_consents (lead_id, consent_type, granted, ip_address, user_agent)
		VALUES ($1, $2, $3, NULLIF($4, '')::inet, NULLIF($5, ''))`,
		leadID, consentType, granted, ip, ua)
	if err != nil {
		return fmt.Errorf("record %s consent: %w", consentType, err)
	}
	return nil
}

func intervalOf(d time.Duration) string {
	return fmt.Sprintf("%d seconds", int(d.Seconds()))
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func resultField(result *Result, field func(*Result) any) any {
	if result == nil {
		return nil
	}
	return field(result)
}

// ApplyToProfile writes what the guest entered into their new account.
//
// The point of the whole exercise: somebody who answered six questions before
// registering must not be asked the same six again. Runs after the account
// exists and after Claim has moved the consents.
func (s *Service) ApplyToProfile(ctx context.Context, lead *Lead, userID int64) error {
	params := lead.Parameters

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO user_settings (user_id, birth_date, biological_sex, height, activity_level, fitness_goal)
		VALUES ($1, $2::date, $3, $4, COALESCE($5, 'moderate'), COALESCE($6, 'maintain'))
		ON CONFLICT (user_id) DO UPDATE SET
			birth_date     = COALESCE(EXCLUDED.birth_date, user_settings.birth_date),
			biological_sex = COALESCE(EXCLUDED.biological_sex, user_settings.biological_sex),
			height         = COALESCE(EXCLUDED.height, user_settings.height),
			activity_level = COALESCE(EXCLUDED.activity_level, user_settings.activity_level),
			fitness_goal   = COALESCE(EXCLUDED.fitness_goal, user_settings.fitness_goal)`,
		userID,
		nullIfEmpty(params.BirthDate), nullIfEmpty(params.Sex), params.HeightCm,
		nullIfEmpty(params.ActivityLevel), nullIfEmpty(params.Goal),
	)
	if err != nil {
		return fmt.Errorf("apply lead parameters: %w", err)
	}

	// The weight they gave becomes today's entry, so the first dashboard they
	// see has their own number on it rather than an empty chart.
	if params.WeightKg != nil {
		if _, err := s.db.ExecContext(ctx, `
			INSERT INTO daily_metrics (user_id, date, weight)
			VALUES ($1, CURRENT_DATE, $2)
			ON CONFLICT (user_id, date) DO UPDATE SET
				weight = COALESCE(daily_metrics.weight, EXCLUDED.weight)`,
			userID, *params.WeightKg); err != nil {
			return fmt.Errorf("apply lead weight: %w", err)
		}
	}

	return nil
}
