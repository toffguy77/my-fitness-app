//go:build integration

package leads

import (
	"context"
	"database/sql"
	"testing"

	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedClient(t *testing.T, db *sql.DB, email string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', 'Клиент', 'client') RETURNING id`,
		email).Scan(&id))
	return id
}

type attributionRow struct {
	UTMSource, Referrer, LandingPage sql.NullString
}

func readAttribution(t *testing.T, db *sql.DB, userID int64) (attributionRow, bool) {
	t.Helper()
	var row attributionRow
	err := db.QueryRowContext(context.Background(),
		`SELECT utm_source, referrer, landing_page FROM user_attribution WHERE user_id = $1`, userID,
	).Scan(&row.UTMSource, &row.Referrer, &row.LandingPage)
	if err == sql.ErrNoRows {
		return row, false
	}
	require.NoError(t, err)
	return row, true
}

// Scenario: Заявка из Дзена; Перенос в учётную запись.
func TestLead_KeepsReferrerAndLandingPage(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "leadsfirsttouch")
	s := newServiceForTest(t, db.DB)

	lead, token, err := s.Create(ctx, CreateInput{
		Email:      "dzen@example.test",
		Parameters: Parameters{Sex: "female", BirthDate: "1990-01-01", HeightCm: ptr(168), WeightKg: ptr(65), ActivityLevel: "moderate", Goal: "loss"},
		Consents:   Consents{DataProcessing: true},
		Attribution: Attribution{
			Referrer:    "https://dzen.ru/a/xyz",
			LandingPage: "/content/chto-takoe-kbzhu",
		},
	}, "127.0.0.1", "test")
	require.NoError(t, err)

	stored, err := s.byID(ctx, lead.ID)
	require.NoError(t, err)
	assert.Equal(t, "https://dzen.ru/a/xyz", stored.Attribution.Referrer)
	assert.Equal(t, "/content/chto-takoe-kbzhu", stored.Attribution.LandingPage)

	userID := seedClient(t, db.DB, "dzen-user@example.test")
	require.NoError(t, s.ClaimInto(ctx, token, userID))

	row, ok := readAttribution(t, db.DB, userID)
	require.True(t, ok)
	assert.Equal(t, "https://dzen.ru/a/xyz", row.Referrer.String)
	assert.Equal(t, "/content/chto-takoe-kbzhu", row.LandingPage.String)
}

func TestRecordFirstTouch(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "leadsrecordtouch")
	s := newServiceForTest(t, db.DB)

	t.Run("writes the first touch of a new account", func(t *testing.T) {
		userID := seedClient(t, db.DB, "a@example.test")
		require.NoError(t, s.RecordFirstTouch(ctx, userID,
			Attribution{Referrer: "https://ya.ru/", LandingPage: "/kalkulyator-kbzhu"}))

		row, ok := readAttribution(t, db.DB, userID)
		require.True(t, ok)
		assert.Equal(t, "https://ya.ru/", row.Referrer.String)
		assert.Equal(t, "/kalkulyator-kbzhu", row.LandingPage.String)
	})

	// Scenario: Заявка уже записала источник — перенос заявки первым, и
	// cookie его не перезаписывает.
	t.Run("does not overwrite what the claimed lead recorded", func(t *testing.T) {
		userID := seedClient(t, db.DB, "b@example.test")
		_, err := db.ExecContext(ctx,
			`INSERT INTO user_attribution (user_id, utm_source) VALUES ($1, 'from-lead')`, userID)
		require.NoError(t, err)

		require.NoError(t, s.RecordFirstTouch(ctx, userID, Attribution{UTMSource: "from-cookie"}))

		row, _ := readAttribution(t, db.DB, userID)
		assert.Equal(t, "from-lead", row.UTMSource.String)
	})

	t.Run("writes nothing when there is nothing to write", func(t *testing.T) {
		userID := seedClient(t, db.DB, "c@example.test")
		require.NoError(t, s.RecordFirstTouch(ctx, userID, Attribution{}))

		_, ok := readAttribution(t, db.DB, userID)
		assert.False(t, ok)
	})
}

func ptr(v float64) *float64 { return &v }
