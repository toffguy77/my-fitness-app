package leads

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupService(t *testing.T) (*Service, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	return NewService(db, logger.New(), testSecret), mock
}

func validInput() CreateInput {
	height, weight := 175.0, 70.0
	return CreateInput{
		Email: "Guest@Example.com ",
		Name:  "Гость",
		Parameters: Parameters{
			Sex: "female", BirthDate: "1990-05-01",
			HeightCm: &height, WeightKg: &weight,
			ActivityLevel: "moderate", Goal: "loss",
		},
		Result:   &Result{Calories: 1800, Protein: 120, Fat: 50, Carbs: 200, WaterGlasses: 8},
		LastStep: "contact",
		Source:   "landing",
		Consents: Consents{DataProcessing: true, Contact: true},
	}
}

// Body parameters are health data. Storing them because somebody typed an
// address is not a basis, so without the consent nothing is written at all.
func TestCreate_RefusesWithoutTheDataProcessingConsent(t *testing.T) {
	service, mock := setupService(t)

	in := validInput()
	in.Consents.DataProcessing = false

	_, _, err := service.Create(context.Background(), in, "ip", "ua")

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrValidation)
	// No transaction was opened; reaching one would fail the mock.
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestCreate_StoresTheAttemptAndBothConsents(t *testing.T) {
	service, mock := setupService(t)

	mock.ExpectBegin()
	mock.ExpectQuery("INSERT INTO leads").
		WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).
			AddRow("lead-7", time.Now(), time.Now()))
	// Recorded separately, because saving the lead and writing to them are
	// different permissions.
	mock.ExpectExec("INSERT INTO user_consents").
		WithArgs("lead-7", "data_processing", true, "ip", "ua").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO user_consents").
		WithArgs("lead-7", "contact", true, "ip", "ua").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	lead, token, err := service.Create(context.Background(), validInput(), "ip", "ua")

	require.NoError(t, err)
	assert.Equal(t, "lead-7", lead.ID)
	// The address is normalised, so the same person typing it twice is one row.
	assert.Equal(t, "guest@example.com", lead.Email)

	id, err := parseToken(testSecret, token)
	require.NoError(t, err)
	assert.Equal(t, "lead-7", id)
}

// Declining contact must not cost somebody their saved result.
func TestCreate_SavesTheLeadWithoutTheContactConsent(t *testing.T) {
	service, mock := setupService(t)

	in := validInput()
	in.Consents.Contact = false

	mock.ExpectBegin()
	mock.ExpectQuery("INSERT INTO leads").
		WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).
			AddRow("lead-8", time.Now(), time.Now()))
	mock.ExpectExec("INSERT INTO user_consents").
		WithArgs("lead-8", "data_processing", true, "ip", "ua").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO user_consents").
		WithArgs("lead-8", "contact", false, "ip", "ua").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	lead, _, err := service.Create(context.Background(), in, "ip", "ua")

	require.NoError(t, err)
	assert.False(t, lead.Consents.Contact)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// The step is a hint for whoever follows up, not the visitor's data — and a
// request anyone can make must not be able to name a lead directly.
func TestUpdateStep_RefusesAnUnsignedIdentifier(t *testing.T) {
	service, mock := setupService(t)

	err := service.UpdateStep(context.Background(), "lead-7", "registration")

	assert.ErrorIs(t, err, apperrors.ErrTokenInvalid)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestUpdateStep_RecordsWhereTheyStopped(t *testing.T) {
	service, mock := setupService(t)

	mock.ExpectExec("UPDATE leads SET last_step").
		WithArgs("lead-7", "registration").
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := service.UpdateStep(context.Background(), service.ResumeToken("lead-7"), "registration")

	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// The consents move onto the account rather than vanishing with the row: what
// somebody agreed to, and when, has to survive their registration.
func TestClaim_MovesConsentsAndRemovesTheLead(t *testing.T) {
	service, mock := setupService(t)

	mock.ExpectQuery("FROM leads WHERE id").WillReturnRows(leadRow("lead-7"))
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE user_consents SET user_id").
		WithArgs(int64(42), "lead-7").
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec("DELETE FROM leads").
		WithArgs("lead-7").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	lead, err := service.Claim(context.Background(), service.ResumeToken("lead-7"), 42)

	require.NoError(t, err)
	assert.Equal(t, "lead-7", lead.ID)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Somebody may leave one address in the wizard and register with another; what
// decides is holding the token, so nothing here compares the two.
func TestApplyToProfile_WritesTheAnswersIntoTheAccount(t *testing.T) {
	service, mock := setupService(t)

	height, weight := 175.0, 70.0
	lead := &Lead{
		ID: "lead-7",
		Parameters: Parameters{
			Sex: "female", BirthDate: "1990-05-01",
			HeightCm: &height, WeightKg: &weight,
			ActivityLevel: "moderate", Goal: "loss",
		},
	}

	mock.ExpectExec("INSERT INTO user_settings").
		WithArgs(int64(42), "1990-05-01", "female", &height, "moderate", "loss").
		WillReturnResult(sqlmock.NewResult(0, 1))
	// Their own weight, so the first dashboard is not an empty chart.
	mock.ExpectExec("INSERT INTO daily_metrics").
		WithArgs(int64(42), weight).
		WillReturnResult(sqlmock.NewResult(0, 1))

	require.NoError(t, service.ApplyToProfile(context.Background(), lead, 42))
	assert.NoError(t, mock.ExpectationsWereMet())
}

// One reminder, ever: a chain of chasing emails turns the product into spam and
// costs the sender reputation the transactional mail depends on.
func TestDueReminders_OnlyThoseWhoAgreedAndHaveNotBeenWritten(t *testing.T) {
	service, mock := setupService(t)

	mock.ExpectQuery("FROM leads").
		WithArgs(intervalOf(ReminderDelay), intervalOf(Retention)).
		WillReturnRows(leadRow("lead-7"))

	due, err := service.DueReminders(context.Background())

	require.NoError(t, err)
	require.Len(t, due, 1)
	assert.Equal(t, "lead-7", due[0].ID)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// The contact of somebody who never became a user is not ours to keep.
func TestPurgeExpired_DeletesByAge(t *testing.T) {
	service, mock := setupService(t)

	mock.ExpectExec("DELETE FROM leads").
		WithArgs(intervalOf(Retention)).
		WillReturnResult(sqlmock.NewResult(0, 3))

	deleted, err := service.PurgeExpired(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 3, deleted)
}

// "Unsubscribe" on a lead means deletion: their contact only existed so we
// could send the message they are declining.
func TestUnsubscribe_DeletesTheLead(t *testing.T) {
	service, mock := setupService(t)

	mock.ExpectExec("DELETE FROM leads").
		WithArgs("lead-7").
		WillReturnResult(sqlmock.NewResult(0, 1))

	require.NoError(t, service.Unsubscribe(context.Background(), service.ResumeToken("lead-7")))
	assert.NoError(t, mock.ExpectationsWereMet())
}

func leadRow(id string) *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"id", "email", "name", "sex", "birth_date", "height_cm", "weight_kg",
		"activity_level", "goal", "calories", "protein", "fat", "carbs", "water_glasses",
		"last_step", "source", "data_consent", "contact_consent",
		"handled_at", "created_at", "updated_at",
	}).AddRow(
		id, "guest@example.com", "Гость", "female", time.Date(1990, 5, 1, 0, 0, 0, 0, time.UTC),
		175.0, 70.0, "moderate", "loss", 1800.0, 120.0, 50.0, 200.0, 8,
		"contact", "landing", true, true, nil, time.Now(), time.Now(),
	)
}
