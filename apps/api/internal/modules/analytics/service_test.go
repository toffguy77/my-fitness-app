package analytics

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupAnalytics(t *testing.T) (*Service, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	return NewService(db, logger.New()), mock
}

// Free-form names become a heap of typos and synonyms within a month, so an
// unknown one is refused rather than stored.
func TestValidate_RefusesAnythingOutsideTheDictionary(t *testing.T) {
	err := Validate(Event{Name: "user_did_a_thing"}, true)

	require.Error(t, err)
	assert.ErrorIs(t, err, apperrors.ErrValidation)
}

// "Send it just in case, we will sort it out later" is the usual way health
// data ends up in analytics.
func TestValidate_RefusesForbiddenProperties(t *testing.T) {
	for _, property := range []string{"email", "weight", "calories", "dish_name", "message", "name"} {
		t.Run(property, func(t *testing.T) {
			err := Validate(Event{
				Name:       EventFoodEntryCreated,
				Properties: map[string]any{property: "anything"},
			}, true)

			require.Error(t, err)
			assert.ErrorIs(t, err, apperrors.ErrValidation)
			assert.Contains(t, err.Error(), property)
		})
	}
}

func TestValidate_RefusesUndeclaredAndMissingProperties(t *testing.T) {
	undeclared := Validate(Event{
		Name:       EventOnboardingStep,
		Properties: map[string]any{"step": "goal", "colour": "blue"},
	}, true)
	assert.ErrorIs(t, undeclared, apperrors.ErrValidation)

	missing := Validate(Event{Name: EventOnboardingStep}, true)
	assert.ErrorIs(t, missing, apperrors.ErrValidation)

	assert.NoError(t, Validate(Event{
		Name:       EventOnboardingStep,
		Properties: map[string]any{"step": "goal"},
	}, true))
}

// A browser claiming "registered" lies when the connection drops after a
// successful request, and disappears entirely behind a blocker. The fact comes
// from where it happened.
func TestValidate_RefusesServerFactsFromABrowser(t *testing.T) {
	registered := Event{Name: EventRegistered, Properties: map[string]any{"method": "password"}}

	fromClient := Validate(registered, true)
	assert.ErrorIs(t, fromClient, apperrors.ErrValidation)

	assert.NoError(t, Validate(registered, false))
}

// The funnel exists to compare ways of arriving, so an account that does not
// say how it arrived is not a usable record of one.
func TestValidate_RequiresTheSignUpMethod(t *testing.T) {
	for _, name := range []string{EventRegistered, EventSignedIn} {
		assert.ErrorIs(t, Validate(Event{Name: name}, false), apperrors.ErrValidation,
			"%s without a method leaves the funnel unable to tell providers from passwords", name)
		assert.NoError(t, Validate(
			Event{Name: name, Properties: map[string]any{"method": "yandex"}}, false))
	}
}

// Every declared property must itself be sendable, or the dictionary invites
// exactly what the forbidden list forbids.
func TestDictionary_DeclaresNothingForbidden(t *testing.T) {
	for name, definition := range Dictionary {
		for _, property := range append(append([]string{}, definition.Required...), definition.Optional...) {
			assert.False(t, IsForbidden(property),
				"event %q declares forbidden property %q", name, property)
		}
	}
}

func TestRecord_StoresABatch(t *testing.T) {
	service, mock := setupAnalytics(t)

	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO analytics_events").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO analytics_events").WillReturnResult(sqlmock.NewResult(2, 1))
	mock.ExpectCommit()

	outcome, err := service.Record(context.Background(), Batch{
		VisitorID: "3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22",
		Platform:  "web",
		Events: []Event{
			{Name: EventLandingViewed},
			{Name: EventOnboardingStep, Properties: map[string]any{"step": "goal"}},
		},
	}, nil)

	require.NoError(t, err)
	assert.Equal(t, Outcome{Recorded: 2}, outcome)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// A bad event no longer takes its neighbours down with it.
//
// This test used to assert the opposite, on the grounds that a client sending
// events nobody accepts should find out at development time. The cost of that
// rule turned out to be paid by the wrong events: a batch collects whatever
// happened nearby, so one undeclared property discarded the lead together with
// the contact capture, and the first food entry together with the entry. The
// refusal is named in the log instead, and a guard against the mismatch itself
// belongs to the dictionary, not to the batch.
func TestRecord_KeepsTheGoodEventsBesideABadOne(t *testing.T) {
	service, mock := setupAnalytics(t)

	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO analytics_events").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO analytics_events").WillReturnResult(sqlmock.NewResult(2, 1))
	mock.ExpectCommit()

	outcome, err := service.Record(context.Background(), Batch{
		VisitorID: "3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22",
		Events: []Event{
			{Name: EventLandingViewed},
			{Name: "made_up"},
			{Name: EventOnboardingStep, Properties: map[string]any{"step": "goal"}},
		},
	}, nil)

	require.NoError(t, err)
	assert.Equal(t, Outcome{Recorded: 2, Refused: 1}, outcome)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// The exact shape of the defect this change was written for: the property is
// declared for a neighbouring event but not for this one.
func TestRecord_KeepsTheGoodEventsBesideAnUndeclaredProperty(t *testing.T) {
	service, mock := setupAnalytics(t)

	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO analytics_events").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	outcome, err := service.Record(context.Background(), Batch{
		VisitorID: "3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22",
		Events: []Event{
			// meal_type is declared for food_entry_created and was never
			// declared for first_food_entry.
			{Name: EventFoodEntryCreated, Properties: map[string]any{"meal_type": "breakfast"}},
			{Name: EventLandingViewed, Properties: map[string]any{"meal_type": "breakfast"}},
		},
	}, nil)

	require.NoError(t, err)
	assert.Equal(t, Outcome{Recorded: 1, Refused: 1}, outcome)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Nothing acceptable means nothing written — and no transaction opened. Not an
// error either: the request itself was well formed, and its answer says so.
func TestRecord_WritesNothingWhenEveryEventIsRefused(t *testing.T) {
	service, mock := setupAnalytics(t)

	outcome, err := service.Record(context.Background(), Batch{
		VisitorID: "3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22",
		Events: []Event{
			{Name: "made_up"},
			{Name: "also_made_up"},
		},
	}, nil)

	require.NoError(t, err)
	assert.Equal(t, Outcome{Refused: 2}, outcome)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// A browser claiming a server-side fact is refused, so the transition to
// server-recorded facts cannot double-count: an old tab still sending
// first_food_entry adds nothing.
func TestRecord_RefusesAServerFactFromTheBrowser(t *testing.T) {
	service, mock := setupAnalytics(t)

	outcome, err := service.Record(context.Background(), Batch{
		VisitorID: "3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22",
		Events: []Event{
			{Name: EventFirstFoodEntry, Properties: map[string]any{"meal_type": "breakfast"}},
			{Name: EventFirstMessage},
		},
	}, nil)

	require.NoError(t, err)
	assert.Equal(t, Outcome{Refused: 2}, outcome)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRecord_RefusesAnImplausiblyLargeBatch(t *testing.T) {
	service, _ := setupAnalytics(t)

	events := make([]Event, MaxBatch+1)
	for i := range events {
		events[i] = Event{Name: EventLandingViewed}
	}

	outcome, err := service.Record(context.Background(), Batch{
		VisitorID: "3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22",
		Events:    events,
	}, nil)

	// Transport-level: the whole request is refused, and nothing is recorded.
	assert.ErrorIs(t, err, apperrors.ErrValidation)
	assert.Equal(t, Outcome{}, outcome)
}

// Without this the funnel breaks exactly where it is most interesting: at the
// point an anonymous visitor becomes a user.
func TestLinkVisitor_AttributesEarlierEventsToTheAccount(t *testing.T) {
	service, mock := setupAnalytics(t)

	mock.ExpectExec("INSERT INTO analytics_identities").
		WithArgs("3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22", int64(42)).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("UPDATE analytics_events SET user_id").
		WithArgs("3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22", int64(42)).
		WillReturnResult(sqlmock.NewResult(0, 5))

	require.NoError(t, service.LinkVisitor(context.Background(),
		"3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22", 42))
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Analytics must never be the reason a registration fails, so a refused server
// event is logged and dropped rather than returned.
func TestRecordServerEvent_DropsWhatTheDictionaryRefuses(t *testing.T) {
	service, mock := setupAnalytics(t)

	service.RecordServerEvent(context.Background(), "not_in_dictionary", 42, nil)

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRecordServerEvent_StoresAFact(t *testing.T) {
	service, mock := setupAnalytics(t)

	mock.ExpectExec("INSERT INTO analytics_events").
		WillReturnResult(sqlmock.NewResult(1, 1))

	service.RecordServerEvent(context.Background(), EventRegistered, 42,
		map[string]any{"method": "password"})

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPurgeExpired_DeletesByAge(t *testing.T) {
	service, mock := setupAnalytics(t)

	mock.ExpectExec("DELETE FROM analytics_events").WillReturnResult(sqlmock.NewResult(0, 7))

	deleted, err := service.PurgeExpired(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 7, deleted)
}
