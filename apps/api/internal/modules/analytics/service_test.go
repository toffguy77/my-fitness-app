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

	err := service.Record(context.Background(), Batch{
		VisitorID: "3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22",
		Platform:  "web",
		Events: []Event{
			{Name: EventLandingViewed},
			{Name: EventOnboardingStep, Properties: map[string]any{"step": "goal"}},
		},
	}, nil)

	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// One bad event fails the batch rather than being quietly dropped: a client
// sending events nobody accepts should find out at development time, not by
// wondering why the funnel is empty.
func TestRecord_RefusesTheWholeBatchOnOneBadEvent(t *testing.T) {
	service, mock := setupAnalytics(t)

	err := service.Record(context.Background(), Batch{
		VisitorID: "3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22",
		Events: []Event{
			{Name: EventLandingViewed},
			{Name: "made_up"},
		},
	}, nil)

	assert.ErrorIs(t, err, apperrors.ErrValidation)
	// Nothing was written; a transaction was never opened.
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRecord_RefusesAnImplausiblyLargeBatch(t *testing.T) {
	service, _ := setupAnalytics(t)

	events := make([]Event, MaxBatch+1)
	for i := range events {
		events[i] = Event{Name: EventLandingViewed}
	}

	err := service.Record(context.Background(), Batch{
		VisitorID: "3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22",
		Events:    events,
	}, nil)

	assert.ErrorIs(t, err, apperrors.ErrValidation)
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
