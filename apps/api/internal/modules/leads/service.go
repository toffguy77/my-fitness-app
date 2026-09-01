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
			last_step, source, data_consent, contact_consent
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
		step, nullIfEmpty(in.Source), in.Consents.DataProcessing, in.Consents.Contact,
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

// List returns leads for the administrative section, newest first.
func (s *Service) List(ctx context.Context, limit, offset int) ([]Lead, int, error) {
	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM leads`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count leads: %w", err)
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, email, COALESCE(name, ''), COALESCE(sex, ''), birth_date,
		       height_cm, weight_kg, COALESCE(activity_level, ''), COALESCE(goal, ''),
		       calories, protein, fat, carbs, water_glasses,
		       last_step, COALESCE(source, ''), data_consent, contact_consent,
		       handled_at, created_at, updated_at
		FROM leads ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list leads: %w", err)
	}
	defer rows.Close()

	leads := make([]Lead, 0, limit)
	for rows.Next() {
		lead, err := scanLead(rows)
		if err != nil {
			return nil, 0, err
		}
		leads = append(leads, *lead)
	}
	return leads, total, rows.Err()
}

// MarkHandled records that somebody has dealt with this person.
func (s *Service) MarkHandled(ctx context.Context, leadID string, byUserID int64) error {
	result, err := s.db.ExecContext(ctx,
		`UPDATE leads SET handled_at = NOW(), handled_by = $2, updated_at = NOW() WHERE id = $1`,
		leadID, byUserID)
	if err != nil {
		return fmt.Errorf("mark lead handled: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return fmt.Errorf("lead not found: %w", apperrors.ErrNotFound)
	}
	return nil
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

func scanLead(row scanner) (*Lead, error) {
	var lead Lead
	var birthDate sql.NullTime
	var height, weight, calories, protein, fat, carbs sql.NullFloat64
	var water sql.NullInt64
	var handledAt sql.NullTime

	err := row.Scan(
		&lead.ID, &lead.Email, &lead.Name, &lead.Parameters.Sex, &birthDate,
		&height, &weight, &lead.Parameters.ActivityLevel, &lead.Parameters.Goal,
		&calories, &protein, &fat, &carbs, &water,
		&lead.LastStep, &lead.Source, &lead.Consents.DataProcessing, &lead.Consents.Contact,
		&handledAt, &lead.CreatedAt, &lead.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

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
	return &lead, nil
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
