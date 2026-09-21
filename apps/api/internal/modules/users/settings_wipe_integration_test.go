//go:build integration

// Live-database coverage for the settings partial-update wipe: a PUT with
// only some fields in the body used to overwrite every column not mentioned
// with its Go zero value, silently discarding height, birth date, sex,
// activity level, fitness goal and more for a real person. sqlmock would
// accept the old unconditional-assignment query without complaint — it does
// not know what is actually left in the table afterwards — so this runs
// against a real schema and reads the row back.
package users

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func settingsWipeFixtures(t *testing.T) (*Service, int64) {
	t.Helper()

	db := testsupport.SchemaWithMigrations(t, "settingswipe")
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('settings-wipe@example.test', 'x', 'Тест', 'client')
		 RETURNING id`).Scan(&userID))

	cfg := &config.Config{Env: "test", JWTSecret: "test-secret"}
	svc := NewService(db.DB, nil, cfg, logger.New())
	return svc, userID
}

func ptrStr(v string) *string   { return &v }
func ptrF64(v float64) *float64 { return &v }

// fullSettings is a settings row with every field set to a distinguishable,
// non-zero value. Seeding with real values — not an untouched, all-NULL row
// — matters: "the previous value survived" is vacuously true on an empty row
// even when the upsert still wipes unconditionally, so a test built on an
// empty starting row would pass against the old, broken query too.
func fullSettings() (Settings, SettingsProvided) {
	settings := Settings{
		Language:           "en",
		Units:              "imperial",
		Timezone:           "America/New_York",
		TelegramUsername:   "oldtelegram",
		InstagramUsername:  "oldinstagram",
		AppleHealthEnabled: true,
		TargetWeight:       ptrF64(65.5),
		Height:             ptrF64(181.2),
		BirthDate:          ptrStr("1990-05-01"),
		BiologicalSex:      ptrStr("male"),
		ActivityLevel:      ptrStr("active"),
		FitnessGoal:        ptrStr("gain"),
	}
	provided := SettingsProvided{
		Language: true, Units: true, Timezone: true,
		TelegramUsername: true, InstagramUsername: true, AppleHealthEnabled: true,
		TargetWeight: true, Height: true, BirthDate: true,
		BiologicalSex: true, ActivityLevel: true, FitnessGoal: true,
	}
	return settings, provided
}

func seedFullSettings(t *testing.T, svc *Service, userID int64) *Settings {
	t.Helper()
	settings, provided := fullSettings()
	result, err := svc.UpdateSettings(context.Background(), userID, settings, provided)
	require.NoError(t, err)
	return result
}

// TestUpdateSettings_PartialBodyPreservesEveryOmittedField is the direct
// reproduction of the live defect: the Apple Health toggle on the client
// (features/settings/components/SettingsAppleHealth.tsx) sends exactly
// {"apple_health_enabled": ...} and nothing else. Before the fix, this call
// alone wiped language, units, timezone, both social usernames, target
// weight, height, birth date, biological sex, activity level and fitness
// goal on every save.
func TestUpdateSettings_PartialBodyPreservesEveryOmittedField(t *testing.T) {
	svc, userID := settingsWipeFixtures(t)
	seeded := seedFullSettings(t, svc, userID)
	require.NotNil(t, seeded.Height, "seed must actually set values, or this test proves nothing")

	got, err := svc.UpdateSettings(context.Background(), userID,
		Settings{AppleHealthEnabled: false},
		SettingsProvided{AppleHealthEnabled: true},
	)
	require.NoError(t, err)

	assert.False(t, got.AppleHealthEnabled, "the one field the request named must still update")

	assert.Equal(t, "en", got.Language, "language must survive an unrelated partial update")
	assert.Equal(t, "imperial", got.Units, "units must survive an unrelated partial update")
	assert.Equal(t, "America/New_York", got.Timezone, "timezone must survive an unrelated partial update")
	assert.Equal(t, "oldtelegram", got.TelegramUsername, "telegram_username must survive an unrelated partial update")
	assert.Equal(t, "oldinstagram", got.InstagramUsername, "instagram_username must survive an unrelated partial update")
	if assert.NotNil(t, got.TargetWeight, "target_weight must survive an unrelated partial update") {
		assert.InDelta(t, 65.5, *got.TargetWeight, 0.001)
	}
	if assert.NotNil(t, got.Height, "height must survive an unrelated partial update") {
		assert.InDelta(t, 181.2, *got.Height, 0.001)
	}
	if assert.NotNil(t, got.BirthDate, "birth_date must survive an unrelated partial update") {
		assert.Equal(t, "1990-05-01", *got.BirthDate)
	}
	if assert.NotNil(t, got.BiologicalSex, "biological_sex must survive an unrelated partial update") {
		assert.Equal(t, "male", *got.BiologicalSex)
	}
	if assert.NotNil(t, got.ActivityLevel, "activity_level must survive an unrelated partial update") {
		assert.Equal(t, "active", *got.ActivityLevel)
	}
	if assert.NotNil(t, got.FitnessGoal, "fitness_goal must survive an unrelated partial update") {
		assert.Equal(t, "gain", *got.FitnessGoal)
	}

	// And the database row itself — not just what the query happened to
	// RETURNING — carries the same values.
	db := svc.db
	var language, units, timezone, telegram, instagram, sex, activity, goal string
	var appleHealth bool
	var targetWeight, height float64
	var birthDate string
	require.NoError(t, db.QueryRow(`
		SELECT language, units, timezone, telegram_username, instagram_username,
		       apple_health_enabled, target_weight, height,
		       to_char(birth_date, 'YYYY-MM-DD'), biological_sex, activity_level, fitness_goal
		FROM user_settings WHERE user_id = $1`, userID).
		Scan(&language, &units, &timezone, &telegram, &instagram, &appleHealth,
			&targetWeight, &height, &birthDate, &sex, &activity, &goal))
	assert.Equal(t, "en", language)
	assert.Equal(t, "imperial", units)
	assert.Equal(t, "America/New_York", timezone)
	assert.Equal(t, "oldtelegram", telegram)
	assert.Equal(t, "oldinstagram", instagram)
	assert.False(t, appleHealth)
	assert.InDelta(t, 65.5, targetWeight, 0.001)
	assert.InDelta(t, 181.2, height, 0.001)
	assert.Equal(t, "1990-05-01", birthDate)
	assert.Equal(t, "male", sex)
	assert.Equal(t, "active", activity)
	assert.Equal(t, "gain", goal)
}

// TestUpdateSettings_EachVulnerableFieldSurvivesOnItsOwn checks every
// nullable/optional column individually rather than as one combined
// assertion: fixing the upsert for one column and forgetting the rest is
// the likeliest way to half-fix this, and a shared "settings didn't match"
// assertion would hide exactly that.
func TestUpdateSettings_EachVulnerableFieldSurvivesOnItsOwn(t *testing.T) {
	cases := []struct {
		name       string
		update     Settings
		provided   SettingsProvided
		assertKept func(t *testing.T, got *Settings)
	}{
		{
			name:     "language survives when only units is sent",
			update:   Settings{Units: "metric"},
			provided: SettingsProvided{Units: true},
			assertKept: func(t *testing.T, got *Settings) {
				assert.Equal(t, "en", got.Language)
			},
		},
		{
			name:     "timezone survives when only language is sent",
			update:   Settings{Language: "ru"},
			provided: SettingsProvided{Language: true},
			assertKept: func(t *testing.T, got *Settings) {
				assert.Equal(t, "America/New_York", got.Timezone)
			},
		},
		{
			name:     "telegram_username survives when only instagram_username is sent",
			update:   Settings{InstagramUsername: "freshig"},
			provided: SettingsProvided{InstagramUsername: true},
			assertKept: func(t *testing.T, got *Settings) {
				assert.Equal(t, "oldtelegram", got.TelegramUsername)
			},
		},
		{
			name:     "target_weight survives when only height is sent",
			update:   Settings{Height: ptrF64(190)},
			provided: SettingsProvided{Height: true},
			assertKept: func(t *testing.T, got *Settings) {
				if assert.NotNil(t, got.TargetWeight) {
					assert.InDelta(t, 65.5, *got.TargetWeight, 0.001)
				}
			},
		},
		{
			name:     "height survives when only target_weight is sent",
			update:   Settings{TargetWeight: ptrF64(70)},
			provided: SettingsProvided{TargetWeight: true},
			assertKept: func(t *testing.T, got *Settings) {
				if assert.NotNil(t, got.Height) {
					assert.InDelta(t, 181.2, *got.Height, 0.001)
				}
			},
		},
		{
			name:     "birth_date survives when only biological_sex is sent",
			update:   Settings{BiologicalSex: ptrStr("female")},
			provided: SettingsProvided{BiologicalSex: true},
			assertKept: func(t *testing.T, got *Settings) {
				if assert.NotNil(t, got.BirthDate) {
					assert.Equal(t, "1990-05-01", *got.BirthDate)
				}
			},
		},
		{
			name:     "biological_sex survives when only birth_date is sent",
			update:   Settings{BirthDate: ptrStr("1985-12-31")},
			provided: SettingsProvided{BirthDate: true},
			assertKept: func(t *testing.T, got *Settings) {
				if assert.NotNil(t, got.BiologicalSex) {
					assert.Equal(t, "male", *got.BiologicalSex)
				}
			},
		},
		{
			name:     "activity_level survives when only fitness_goal is sent",
			update:   Settings{FitnessGoal: ptrStr("loss")},
			provided: SettingsProvided{FitnessGoal: true},
			assertKept: func(t *testing.T, got *Settings) {
				if assert.NotNil(t, got.ActivityLevel) {
					assert.Equal(t, "active", *got.ActivityLevel)
				}
			},
		},
		{
			name:     "fitness_goal survives when only activity_level is sent",
			update:   Settings{ActivityLevel: ptrStr("sedentary")},
			provided: SettingsProvided{ActivityLevel: true},
			assertKept: func(t *testing.T, got *Settings) {
				if assert.NotNil(t, got.FitnessGoal) {
					assert.Equal(t, "gain", *got.FitnessGoal)
				}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, userID := settingsWipeFixtures(t)
			seeded := seedFullSettings(t, svc, userID)
			require.NotNil(t, seeded.TargetWeight, "seed must actually set values, or this test proves nothing")

			got, err := svc.UpdateSettings(context.Background(), userID, tc.update, tc.provided)
			require.NoError(t, err)
			tc.assertKept(t, got)
		})
	}
}

// TestUpdateSettings_ExplicitNullClearsTheField is the other half of the
// contract: SettingsBody on the client (features/settings/components/
// SettingsBody.tsx) sends an explicit JSON null for target_weight, height,
// birth_date, biological_sex, activity_level and fitness_goal when the
// person clears that input, and expects the column to actually clear. A fix
// that just always preserved the old value on nil would silently break
// that — a person could never remove a target weight or a fitness goal once
// set.
func TestUpdateSettings_ExplicitNullClearsTheField(t *testing.T) {
	svc, userID := settingsWipeFixtures(t)
	seedFullSettings(t, svc, userID)

	got, err := svc.UpdateSettings(context.Background(), userID,
		Settings{TargetWeight: nil, FitnessGoal: nil},
		SettingsProvided{TargetWeight: true, FitnessGoal: true},
	)
	require.NoError(t, err)

	assert.Nil(t, got.TargetWeight, "an explicit null must actually clear target_weight")
	assert.Nil(t, got.FitnessGoal, "an explicit null must actually clear fitness_goal")
	// Untouched fields from the same request are still preserved.
	if assert.NotNil(t, got.Height) {
		assert.InDelta(t, 181.2, *got.Height, 0.001)
	}
}

// TestUpdateSettings_FirstWriteWithNoExistingRow guards the INSERT branch of
// the upsert directly, bypassing the auto-created row from registration. A
// first write that only supplies one field must not violate the NOT NULL /
// CHECK constraints on language, units and timezone, and every other column
// it didn't mention must come back NULL rather than some placeholder.
func TestUpdateSettings_FirstWriteWithNoExistingRow(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "settingswipefirst")
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('settings-wipe-first@example.test', 'x', 'Тест', 'client')
		 RETURNING id`).Scan(&userID))
	// Deliberately no "INSERT INTO user_settings (user_id) VALUES ($1)" here,
	// unlike auth.Register — this user has no settings row at all yet.

	cfg := &config.Config{Env: "test", JWTSecret: "test-secret"}
	svc := NewService(db.DB, nil, cfg, logger.New())

	got, err := svc.UpdateSettings(ctx, userID,
		Settings{AppleHealthEnabled: true},
		SettingsProvided{AppleHealthEnabled: true},
	)
	require.NoError(t, err)

	assert.True(t, got.AppleHealthEnabled)
	assert.Equal(t, "ru", got.Language, "omitted NOT NULL column falls back to the schema default on first insert")
	assert.Equal(t, "metric", got.Units)
	assert.Equal(t, "Europe/Moscow", got.Timezone)
	assert.Nil(t, got.TargetWeight)
	assert.Nil(t, got.Height)
	assert.Nil(t, got.BirthDate)
}
