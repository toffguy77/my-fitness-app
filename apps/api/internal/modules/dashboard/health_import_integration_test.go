//go:build integration

package dashboard

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Импорт Здоровья против настоящей схемы: правило старшинства, идемпотентность
// и пересчёт тренировки дня — свойства SQL, а не Go, и sqlmock подтвердил бы
// любой написанный запрос. По тесту на каждый сценарий health-import и
// daily-metric-source (кроме лимита частоты — он в internal/router).
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 -run Health ./internal/modules/dashboard/

type healthStand struct {
	t      *testing.T
	db     *database.DB
	engine *gin.Engine
	user   int64
	loc    *time.Location
}

func newHealthStand(t *testing.T) *healthStand {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db := testsupport.SchemaWithMigrations(t, "health_import")
	log := logger.New()
	h := NewHandler(&config.Config{}, log, db, nil, nil, nutritioncalc.NewService(db, log))

	s := &healthStand{t: t, db: db}
	s.user = client(t, db)
	s.connect(true)
	s.loc = middleware.GetUserTimezone(context.Background(), db, s.user)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.GetHeader("X-Test-User"), 10, 64)
		c.Set("user_id", id)
	})
	r.POST("/health/import", h.ImportHealth)
	r.POST("/dashboard/daily", h.SaveMetric)
	r.GET("/dashboard/daily/:date", h.GetDailyMetrics)
	r.GET("/dashboard/week", h.GetWeekMetrics)
	s.engine = r
	return s
}

func (s *healthStand) connect(enabled bool) {
	s.t.Helper()
	_, err := s.db.ExecContext(context.Background(),
		`UPDATE user_settings SET apple_health_enabled = $2 WHERE user_id = $1`, s.user, enabled)
	require.NoError(s.t, err)
}

// day — дата профиля со смещением от сегодня.
func (s *healthStand) day(offset int) string {
	return time.Now().In(s.loc).AddDate(0, 0, offset).Format("2006-01-02")
}

func (s *healthStand) do(method, path string, body any) *httptest.ResponseRecorder {
	s.t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(s.t, err)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", strconv.FormatInt(s.user, 10))
	w := httptest.NewRecorder()
	s.engine.ServeHTTP(w, req)
	return w
}

type importAnswer struct {
	Code string `json:"code"`
	Data struct {
		Accepted int                     `json:"accepted"`
		Rejected []HealthImportRejection `json:"rejected"`
	} `json:"data"`
}

func (s *healthStand) importItems(items ...map[string]any) (int, importAnswer) {
	s.t.Helper()
	w := s.do(http.MethodPost, "/health/import", map[string]any{"items": items})
	var answer importAnswer
	require.NoError(s.t, json.Unmarshal(w.Body.Bytes(), &answer), w.Body.String())
	return w.Code, answer
}

func (s *healthStand) saveManual(date string, metric map[string]any) {
	s.t.Helper()
	w := s.do(http.MethodPost, "/dashboard/daily", map[string]any{"date": date, "metric": metric})
	require.Equal(s.t, http.StatusOK, w.Code, w.Body.String())
}

type dayAnswer struct {
	Data struct {
		Steps            int      `json:"steps"`
		Weight           *float64 `json:"weight"`
		WorkoutCompleted bool     `json:"workout_completed"`
		WorkoutType      *string  `json:"workout_type"`
		WorkoutDuration  *int     `json:"workout_duration"`
		StepsSource      *string  `json:"steps_source"`
		WeightSource     *string  `json:"weight_source"`
		WorkoutSource    *string  `json:"workout_source"`
	} `json:"data"`
	raw map[string]any
}

func (s *healthStand) getDay(date string) dayAnswer {
	s.t.Helper()
	w := s.do(http.MethodGet, "/dashboard/daily/"+date, nil)
	require.Equal(s.t, http.StatusOK, w.Code, w.Body.String())
	var answer dayAnswer
	require.NoError(s.t, json.Unmarshal(w.Body.Bytes(), &answer))
	require.NoError(s.t, json.Unmarshal(w.Body.Bytes(), &answer.raw))
	return answer
}

func (s *healthStand) count(query string, args ...any) int {
	s.t.Helper()
	var n int
	require.NoError(s.t, s.db.QueryRowContext(context.Background(), query, args...).Scan(&n))
	return n
}

func steps(date string, value float64) map[string]any {
	return map[string]any{"kind": "steps", "date": date, "value": value}
}

func weight(date string, kg float64) map[string]any {
	return map[string]any{"kind": "weight", "date": date, "value_kg": kg}
}

func workout(id, date, activity string, minutes float64) map[string]any {
	return map[string]any{
		"kind": "workout", "external_id": id, "date": date, "type": activity,
		"started_at": date + "T07:00:00+03:00", "duration_min": minutes,
	}
}

func workoutDeleted(id string) map[string]any {
	return map[string]any{"kind": "workout_deleted", "external_id": id}
}

func str(p *string) string {
	if p == nil {
		return "<nil>"
	}
	return *p
}

// --- health-import ---------------------------------------------------------

// Сценарий «Смешанная пачка».
func TestHealthImportMixedBatch(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)

	code, answer := s.importItems(
		steps(today, 6412),
		weight(today, 78.4),
		workout("W-1", today, "running", 45),
	)

	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, 3, answer.Data.Accepted)
	assert.NotNil(t, answer.Data.Rejected, "rejected — пустой массив, а не null")
	assert.Empty(t, answer.Data.Rejected)

	day := s.getDay(today)
	assert.Equal(t, 6412, day.Data.Steps)
	require.NotNil(t, day.Data.Weight)
	assert.InDelta(t, 78.4, *day.Data.Weight, 0.001)
	assert.True(t, day.Data.WorkoutCompleted)
	assert.Equal(t, "running:45", str(day.Data.WorkoutType))
}

// Сценарий «Слишком большая пачка».
func TestHealthImportRejectsOversizedBatchWhole(t *testing.T) {
	s := newHealthStand(t)

	items := make([]map[string]any, 0, 501)
	for i := 0; i < 501; i++ {
		items = append(items, steps(s.day(-(i%300)), 1000))
	}
	code, answer := s.importItems(items...)

	assert.Equal(t, http.StatusBadRequest, code)
	assert.Equal(t, "validation", answer.Code)
	assert.Zero(t, s.count(`SELECT count(*) FROM daily_metrics WHERE user_id = $1`, s.user),
		"ни одна запись не сохранена")
}

// Пачка ровно из 500 записей — граница, которая принимается.
func TestHealthImportAcceptsBatchOfFiveHundred(t *testing.T) {
	s := newHealthStand(t)

	items := make([]map[string]any, 0, 500)
	for i := 0; i < 500; i++ {
		items = append(items, workout(fmt.Sprintf("W-%d", i), s.day(-(i%90)), "yoga", 10))
	}
	code, answer := s.importItems(items...)

	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, 500, answer.Data.Accepted)
}

// Сценарий «Одна запись из будущего».
func TestHealthImportRejectsFutureRecordAlone(t *testing.T) {
	s := newHealthStand(t)

	items := make([]map[string]any, 0, 10)
	for i := 0; i < 9; i++ {
		items = append(items, steps(s.day(-i), float64(1000+i)))
	}
	// Пятая по счёту — завтрашняя по поясу профиля.
	items = append(items[:4], append([]map[string]any{steps(s.day(1), 5000)}, items[4:]...)...)

	code, answer := s.importItems(items...)

	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, 9, answer.Data.Accepted)
	assert.Equal(t, []HealthImportRejection{{Index: 4, Code: "validation"}}, answer.Data.Rejected)
	assert.Equal(t, 9, s.count(`SELECT count(*) FROM daily_metrics WHERE user_id = $1`, s.user),
		"остальные записи сохранены")
}

// Требование «Плохая запись не блокирует остальные» — каждая граница.
func TestHealthImportRejectsEachBoundaryAlone(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)

	bad := []map[string]any{
		steps(s.day(-367), 1000),                     // старше 366 дней
		weight(today, 19.9),                          // легче 20 кг
		weight(today, 500.1),                         // тяжелее 500 кг
		steps(today, -1),                             // шагов меньше нуля
		steps(today, 100001),                         // больше 100 000
		workout("W-short", today, "running", 0),      // короче минуты
		workout("W-long", today, "running", 601),     // длиннее 600 минут
		{"kind": "sleep", "date": today, "value": 8}, // незнакомый вид
		{"kind": "steps", "date": "17.10.2026", "value": 10},
		{"kind": "weight", "date": today, "value_kg": "семьдесят"},
		{"kind": "workout", "date": today, "type": "running", "duration_min": 30, "started_at": today + "T07:00:00Z"}, // без external_id
		{"kind": "workout_deleted"},
	}
	good := []map[string]any{
		steps(s.day(-366), 1000), // ровно 366 дней — ещё можно
		weight(today, 20),
		steps(today, 100000),
		workout("W-edge", today, "running", 600),
	}

	code, answer := s.importItems(append(bad, good...)...)

	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, len(good), answer.Data.Accepted)
	require.Len(t, answer.Data.Rejected, len(bad))
	for i, r := range answer.Data.Rejected {
		assert.Equal(t, i, r.Index)
		assert.Equal(t, "validation", r.Code)
	}
}

// Сценарий «Двойная отправка после обрыва сети».
func TestHealthImportSameBatchTwiceChangesNothing(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)
	batch := []map[string]any{
		steps(today, 7000),
		weight(today, 80.2),
		workout("W-45", today, "running", 45),
	}

	_, first := s.importItems(batch...)
	var updatedAt time.Time
	require.NoError(t, s.db.QueryRowContext(context.Background(),
		`SELECT updated_at FROM daily_metrics WHERE user_id = $1 AND date = $2`, s.user, today).Scan(&updatedAt))

	code, second := s.importItems(batch...)

	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, first.Data.Accepted, second.Data.Accepted)
	assert.Equal(t, 1, s.count(`SELECT count(*) FROM health_workouts WHERE user_id = $1`, s.user),
		"у даты одна тренировка")
	day := s.getDay(today)
	require.NotNil(t, day.Data.WorkoutDuration)
	assert.Equal(t, 45, *day.Data.WorkoutDuration, "длительность за день — 45 минут")
	assert.Equal(t, 7000, day.Data.Steps)

	var again time.Time
	require.NoError(t, s.db.QueryRowContext(context.Background(),
		`SELECT updated_at FROM daily_metrics WHERE user_id = $1 AND date = $2`, s.user, today).Scan(&again))
	assert.True(t, updatedAt.Equal(again), "повтор не переписал строку")
}

// Несколько тренировок за день складываются в тренировку дня по видам.
func TestHealthImportAggregatesWorkoutsOfDay(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)

	_, answer := s.importItems(
		workout("W-a", today, "traditionalStrengthTraining", 40),
		workout("W-b", today, "functionalStrengthTraining", 20),
		workout("W-c", today, "elliptical", 30),
		workout("W-d", today, "dance", 15),
	)
	require.Equal(t, 4, answer.Data.Accepted)

	day := s.getDay(today)
	assert.True(t, day.Data.WorkoutCompleted)
	assert.ElementsMatch(t, []string{"strength:60", "cardio:30", "other:15"},
		splitTypes(str(day.Data.WorkoutType)))
	require.NotNil(t, day.Data.WorkoutDuration)
	assert.Equal(t, 105, *day.Data.WorkoutDuration)
	assert.Equal(t, "healthkit", str(day.Data.WorkoutSource))
}

func splitTypes(s string) []string {
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	return out
}

// Сценарий «Удалена единственная тренировка дня»: тренировки нет, норма
// пересчитана без надбавки.
func TestHealthImportDeletedOnlyWorkoutClearsDayAndBonus(t *testing.T) {
	s := newHealthStand(t)
	fillProfile(t, s.db, s.user)
	today := s.day(0)

	s.importItems(weight(today, 80), workout("W-only", today, "running", 60))
	bonusBefore := s.workoutBonus(today)
	require.Greater(t, bonusBefore, 0.0, "импортированная тренировка даёт надбавку к норме")

	code, answer := s.importItems(workoutDeleted("W-only"))

	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, 1, answer.Data.Accepted)
	day := s.getDay(today)
	assert.False(t, day.Data.WorkoutCompleted, "у даты нет тренировки")
	assert.Nil(t, day.Data.WorkoutType)
	assert.Nil(t, day.Data.WorkoutDuration)
	assert.Nil(t, day.Data.WorkoutSource)
	assert.Zero(t, s.workoutBonus(today), "норма пересчитана без надбавки за тренировку")

	// Удаление уже удалённого — пустая операция, тоже принимается.
	_, again := s.importItems(workoutDeleted("W-only"))
	assert.Equal(t, 1, again.Data.Accepted)
}

func (s *healthStand) workoutBonus(date string) float64 {
	s.t.Helper()
	var bonus sql.NullFloat64
	err := s.db.QueryRowContext(context.Background(),
		`SELECT workout_bonus FROM daily_calculated_targets WHERE user_id = $1 AND date = $2`,
		s.user, date).Scan(&bonus)
	require.NoError(s.t, err, "норма даты должна быть рассчитана")
	return bonus.Float64
}

// Удаление одной из двух тренировок оставляет вторую.
func TestHealthImportDeletedOneOfTwoWorkoutsKeepsTheOther(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)

	s.importItems(workout("W-1", today, "running", 30), workout("W-2", today, "yoga", 20))
	s.importItems(workoutDeleted("W-1"))

	day := s.getDay(today)
	assert.True(t, day.Data.WorkoutCompleted)
	assert.Equal(t, "yoga:20", str(day.Data.WorkoutType))
	require.NotNil(t, day.Data.WorkoutDuration)
	assert.Equal(t, 20, *day.Data.WorkoutDuration)
}

// Удаление тренировки из Здоровья не снимает тренировку дня, введённую вручную.
func TestHealthImportDeletionKeepsManualWorkoutOfDay(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)

	s.importItems(workout("W-1", today, "running", 30))
	s.saveManual(today, map[string]any{"type": "workout", "data": map[string]any{
		"completed": true, "types": []string{"strength"}, "typeDurations": map[string]any{"strength": 50},
	}})
	s.importItems(workoutDeleted("W-1"))

	day := s.getDay(today)
	assert.True(t, day.Data.WorkoutCompleted)
	assert.Equal(t, "strength:50", str(day.Data.WorkoutType))
	assert.Equal(t, "manual", str(day.Data.WorkoutSource))
	assert.Zero(t, s.count(`SELECT count(*) FROM health_workouts WHERE user_id = $1`, s.user))
}

// Тренировку перенесли на другую дату в Здоровье: прежняя дата освобождается.
func TestHealthImportMovedWorkoutRecomputesBothDates(t *testing.T) {
	s := newHealthStand(t)
	yesterday, today := s.day(-1), s.day(0)

	s.importItems(workout("W-1", yesterday, "running", 30))
	s.importItems(workout("W-1", today, "running", 30))

	assert.False(t, s.getDay(yesterday).Data.WorkoutCompleted)
	assert.True(t, s.getDay(today).Data.WorkoutCompleted)
}

// Сценарий «Пользователь отключил Здоровье в приложении».
func TestHealthImportRefusedWhenNotConnected(t *testing.T) {
	s := newHealthStand(t)
	s.connect(false)
	today := s.day(0)

	code, answer := s.importItems(steps(today, 5000), workout("W-1", today, "running", 30))

	assert.Equal(t, http.StatusConflict, code)
	assert.Equal(t, "conflict", answer.Code)
	assert.Zero(t, s.count(`SELECT count(*) FROM daily_metrics WHERE user_id = $1`, s.user))
	assert.Zero(t, s.count(`SELECT count(*) FROM health_workouts WHERE user_id = $1`, s.user))
}

// Без строки настроек Здоровье тоже не подключено.
func TestHealthImportRefusedWithoutSettingsRow(t *testing.T) {
	s := newHealthStand(t)
	_, err := s.db.ExecContext(context.Background(), `DELETE FROM user_settings WHERE user_id = $1`, s.user)
	require.NoError(t, err)

	code, _ := s.importItems(steps(s.day(0), 5000))
	assert.Equal(t, http.StatusConflict, code)
}

// Тело, которое не разобрать, — 400 validation.
func TestHealthImportRejectsMalformedBody(t *testing.T) {
	s := newHealthStand(t)
	req := httptest.NewRequest(http.MethodPost, "/health/import", bytes.NewReader([]byte(`{"items": 5}`)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", strconv.FormatInt(s.user, 10))
	w := httptest.NewRecorder()
	s.engine.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), `"code":"validation"`)
}

// --- daily-metric-source ---------------------------------------------------

// Сценарий «Шаги из Здоровья» — и источник в ответе дня, и в ответе недели.
func TestStepsFromHealthCarrySource(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)

	s.importItems(steps(today, 6412))

	day := s.getDay(today)
	assert.Equal(t, "healthkit", str(day.Data.StepsSource))
	// Нет значения — источник null, и поле присутствует.
	for _, key := range []string{"steps_source", "weight_source", "workout_source"} {
		assert.Contains(t, day.raw["data"], key)
	}
	assert.Nil(t, day.Data.WeightSource)
	assert.Nil(t, day.Data.WorkoutSource)

	w := s.do(http.MethodGet, "/dashboard/week?start="+s.day(-6)+"&end="+today, nil)
	require.Equal(t, http.StatusOK, w.Code)
	var week struct {
		Data struct {
			Metrics []struct {
				StepsSource  *string `json:"steps_source"`
				WeightSource *string `json:"weight_source"`
			} `json:"metrics"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &week))
	require.Len(t, week.Data.Metrics, 1)
	assert.Equal(t, "healthkit", str(week.Data.Metrics[0].StepsSource))
	assert.Nil(t, week.Data.Metrics[0].WeightSource)
}

// Сценарий «Клиент исправил шаги руками».
func TestManualStepsWinOverLaterImport(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)

	s.saveManual(today, map[string]any{"type": "steps", "data": map[string]any{"steps": 8000}})
	code, answer := s.importItems(steps(today, 6412))

	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, 1, answer.Data.Accepted, "accepted учитывает запись, хотя значение не изменилось")
	day := s.getDay(today)
	assert.Equal(t, 8000, day.Data.Steps)
	assert.Equal(t, "manual", str(day.Data.StepsSource))
}

// Сценарий «Импорт перед ручным вводом».
func TestManualWeightOverridesEarlierImport(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)

	s.importItems(weight(today, 78.4))
	require.Equal(t, "healthkit", str(s.getDay(today).Data.WeightSource))

	s.saveManual(today, map[string]any{"type": "weight", "data": map[string]any{"weight": 78.1}})

	day := s.getDay(today)
	require.NotNil(t, day.Data.Weight)
	assert.InDelta(t, 78.1, *day.Data.Weight, 0.001)
	assert.Equal(t, "manual", str(day.Data.WeightSource))

	// И следующий импорт ручное значение уже не трогает.
	s.importItems(weight(today, 78.4))
	day = s.getDay(today)
	assert.InDelta(t, 78.1, *day.Data.Weight, 0.001)
	assert.Equal(t, "manual", str(day.Data.WeightSource))
}

// Ручной ввод одной метрики не меняет источник другой.
func TestManualEntryKeepsOtherSources(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)

	s.importItems(steps(today, 6000), workout("W-1", today, "running", 30))
	s.saveManual(today, map[string]any{"type": "weight", "data": map[string]any{"weight": 81}})
	s.saveManual(today, map[string]any{"type": "nutrition", "data": map[string]any{
		"calories": 1500, "protein": 100, "fat": 50, "carbs": 150,
	}})

	day := s.getDay(today)
	assert.Equal(t, "healthkit", str(day.Data.StepsSource))
	assert.Equal(t, "healthkit", str(day.Data.WorkoutSource))
	assert.Equal(t, "manual", str(day.Data.WeightSource))
}

// Очищенное вручную значение импорт вправе вернуть (design.md: «следующий
// импорт за эту дату его вернёт»).
func TestClearedManualStepsAreRefilledByNextImport(t *testing.T) {
	s := newHealthStand(t)
	today := s.day(0)

	s.saveManual(today, map[string]any{"type": "steps", "data": map[string]any{"steps": 8000}})
	s.saveManual(today, map[string]any{"type": "steps", "data": map[string]any{"steps": 0}})
	assert.Nil(t, s.getDay(today).Data.StepsSource, "0 шагов — значения нет, источника тоже")

	s.importItems(steps(today, 6412))

	day := s.getDay(today)
	assert.Equal(t, 6412, day.Data.Steps)
	assert.Equal(t, "healthkit", str(day.Data.StepsSource))
}

// Ноль шагов из Здоровья снимает импортированное значение, но не ручное.
func TestZeroStepsFromHealthClearOnlyImported(t *testing.T) {
	s := newHealthStand(t)
	today, yesterday := s.day(0), s.day(-1)

	s.importItems(steps(today, 3000))
	s.saveManual(yesterday, map[string]any{"type": "steps", "data": map[string]any{"steps": 4000}})
	s.importItems(steps(today, 0), steps(yesterday, 0))

	day := s.getDay(today)
	assert.Zero(t, day.Data.Steps)
	assert.Nil(t, day.Data.StepsSource)
	assert.Equal(t, 4000, s.getDay(yesterday).Data.Steps)
}
