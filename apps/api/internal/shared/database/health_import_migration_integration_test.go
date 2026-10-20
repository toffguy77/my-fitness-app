//go:build integration

package database_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/migrations"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Миграция 104 (healthkit-sync): у шагов, веса и тренировки дня появляется
// источник. Всё, что сохранено до неё, ввёл человек — импорта ещё не было, —
// поэтому непустые значения становятся 'manual', а пустые остаются без
// источника, чтобы первый импорт мог их заполнить.
//
// Сценарий «Данные до изменения» (daily-metric-source).
func TestHealthImportMigrationMarksExistingValuesManual(t *testing.T) {
	db := freshDatabase(t)
	ctx := context.Background()
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(ctx, 0))

	// Состояние до 104: колонок источника нет.
	runMigrationFile(t, db, "104_health_import_down.sql")

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('source@example.test','x','S','client')
		 RETURNING id`).Scan(&userID))

	// День с весом 80,0, шагами и тренировкой — всё введено руками.
	_, err := db.ExecContext(ctx,
		`INSERT INTO daily_metrics (user_id, date, weight, steps, workout_completed, workout_type, workout_duration)
		 VALUES ($1, '2026-01-10', 80.0, 6000, true, 'strength:45', 45)`, userID)
	require.NoError(t, err)
	// День, где отмечено только питание: ни шагов, ни веса, ни тренировки.
	_, err = db.ExecContext(ctx,
		`INSERT INTO daily_metrics (user_id, date, calories, steps, workout_completed)
		 VALUES ($1, '2026-01-11', 1800, 0, false)`, userID)
	require.NoError(t, err)

	runMigrationFile(t, db, "104_health_import_up.sql")

	steps, weight, workout := sources(t, db, userID, "2026-01-10")
	assert.Equal(t, "manual", weight.String, "вес 80,0 до миграции — ручной")
	assert.Equal(t, "manual", steps.String)
	assert.Equal(t, "manual", workout.String)

	steps, weight, workout = sources(t, db, userID, "2026-01-11")
	assert.False(t, steps.Valid, "нулевые шаги — значения нет, источника тоже")
	assert.False(t, weight.Valid)
	assert.False(t, workout.Valid)

	// Повторный прогон ничего не ломает и ничего не меняет.
	runMigrationFile(t, db, "104_health_import_up.sql")
	_, weight, _ = sources(t, db, userID, "2026-01-10")
	assert.Equal(t, "manual", weight.String)

	// Источник вне ('manual','healthkit') база не принимает.
	_, err = db.ExecContext(ctx,
		`UPDATE daily_metrics SET steps_source = 'googlefit' WHERE user_id = $1`, userID)
	require.Error(t, err)

	// Тренировка из Здоровья уникальна по (пользователь, UUID).
	insert := `INSERT INTO health_workouts (user_id, external_id, date, type, duration_min, started_at)
	           VALUES ($1, 'A1B2', '2026-01-10', 'running', 45, '2026-01-10T07:00:00Z')`
	_, err = db.ExecContext(ctx, insert, userID)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, insert, userID)
	require.Error(t, err, "та же тренировка дважды — нарушение уникальности")

	// Откат убирает всё, что миграция добавила.
	runMigrationFile(t, db, "104_health_import_down.sql")
	var exists bool
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.columns
		 WHERE table_schema = current_schema() AND table_name = 'daily_metrics' AND column_name = 'weight_source')`).Scan(&exists))
	assert.False(t, exists)
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables
		 WHERE table_schema = current_schema() AND table_name = 'health_workouts')`).Scan(&exists))
	assert.False(t, exists)
}

func sources(t *testing.T, db *database.DB, userID int64, date string) (steps, weight, workout sql.NullString) {
	t.Helper()
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT steps_source, weight_source, workout_source FROM daily_metrics WHERE user_id = $1 AND date = $2`,
		userID, date).Scan(&steps, &weight, &workout))
	return steps, weight, workout
}
