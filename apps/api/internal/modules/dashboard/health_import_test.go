package dashboard

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// Правила импорта, которые не требуют базы. Сценарии целиком — в
// health_import_integration_test.go.

func TestHealthWorkoutTypeFollowsDesignTable(t *testing.T) {
	cases := map[string]string{
		"traditionalStrengthTraining":   "strength",
		"functionalStrengthTraining":    "strength",
		"running":                       "running",
		"cycling":                       "cycling",
		"swimming":                      "swimming",
		"yoga":                          "yoga",
		"flexibility":                   "stretching",
		"highIntensityIntervalTraining": "hiit",
		"elliptical":                    "cardio",
		"rowing":                        "cardio",
		"stairClimbing":                 "cardio",
		"mixedCardio":                   "cardio",
		"dance":                         "other",
		"":                              "other",
		// Наши коды проходят как есть.
		"strength": "strength",
		"other":    "other",
	}
	for activity, want := range cases {
		assert.Equal(t, want, HealthWorkoutType(activity), activity)
	}
}

func TestParseHealthItemBounds(t *testing.T) {
	moscow, err := time.LoadLocation("Europe/Moscow")
	require.NoError(t, err)
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, moscow)

	ok := []string{
		`{"kind":"steps","date":"2026-10-17","value":0}`,
		`{"kind":"steps","date":"2026-10-17","value":100000}`,
		`{"kind":"steps","date":"2025-10-16","value":10}`, // ровно 366 дней назад
		`{"kind":"weight","date":"2026-10-17","value_kg":20}`,
		`{"kind":"weight","date":"2026-10-17","value_kg":500}`,
		`{"kind":"workout","external_id":"x","date":"2026-10-17","type":"yoga","started_at":"2026-10-17T07:00:00Z","duration_min":1}`,
		`{"kind":"workout","external_id":"x","date":"2026-10-17","type":"yoga","started_at":"2026-10-17T07:00:00+03:00","duration_min":600}`,
		`{"kind":"workout_deleted","external_id":"x"}`,
	}
	for _, raw := range ok {
		_, accepted := parseHealthItem(json.RawMessage(raw), today)
		assert.True(t, accepted, raw)
	}

	bad := []string{
		`{"kind":"steps","date":"2026-10-18","value":10}`, // завтра по поясу профиля
		`{"kind":"steps","date":"2025-10-15","value":10}`, // 367 дней назад
		`{"kind":"steps","date":"2026-10-17","value":100001}`,
		`{"kind":"steps","date":"2026-10-17"}`,
		`{"kind":"weight","date":"2026-10-17","value_kg":19.99}`,
		`{"kind":"weight","date":"2026-10-17","value_kg":500.01}`,
		`{"kind":"workout","external_id":"x","date":"2026-10-17","type":"yoga","started_at":"2026-10-17T07:00:00Z","duration_min":0.4}`,
		`{"kind":"workout","external_id":"x","date":"2026-10-17","type":"yoga","started_at":"2026-10-17T07:00:00Z","duration_min":600.6}`,
		`{"kind":"workout","external_id":"x","date":"2026-10-17","type":"yoga","started_at":"утром","duration_min":30}`,
		`{"kind":"workout","date":"2026-10-17","type":"yoga","started_at":"2026-10-17T07:00:00Z","duration_min":30}`,
		`{"kind":"workout_deleted","external_id":"` + strings.Repeat("x", 256) + `"}`,
		`{"kind":"heart_rate","date":"2026-10-17","value":60}`,
		`[1,2,3]`,
	}
	for _, raw := range bad {
		_, accepted := parseHealthItem(json.RawMessage(raw), today)
		assert.False(t, accepted, raw)
	}
}

// Ручной ввод ставит manual; очищенное значение остаётся без источника;
// источники других метрик не трогаются.
func TestMarkManualSource(t *testing.T) {
	healthkit := SourceHealthKit
	w := 80.0
	m := &DailyMetrics{Steps: 5000, Weight: &w, StepsSource: &healthkit, WeightSource: &healthkit, WorkoutSource: &healthkit}

	markManualSource(m, MetricUpdateTypeWeight)
	assert.Equal(t, "manual", *m.WeightSource)
	assert.Equal(t, "healthkit", *m.StepsSource)

	m.Steps = 0
	markManualSource(m, MetricUpdateTypeSteps)
	assert.Nil(t, m.StepsSource)

	markManualSource(m, MetricUpdateTypeNutrition)
	assert.Equal(t, "healthkit", *m.WorkoutSource, "питание источников не трогает")

	m.WorkoutCompleted = false
	m.WorkoutType = nil
	markManualSource(m, MetricUpdateTypeWorkout)
	assert.Nil(t, m.WorkoutSource)
}

func postImport(t *testing.T, handler *Handler, body string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/health/import", bytes.NewBufferString(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(7))
	handler.ImportHealth(c)
	return w
}

func TestImportHealthHandler_OversizedBatchNeverReachesService(t *testing.T) {
	handler, service := setupTestHandlerWithMock()

	items := make([]string, 501)
	for i := range items {
		items[i] = `{"kind":"workout_deleted","external_id":"x"}`
	}
	w := postImport(t, handler, fmt.Sprintf(`{"items":[%s]}`, strings.Join(items, ",")))

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), `"code":"validation"`)
	service.AssertNotCalled(t, "ImportHealth", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestImportHealthHandler_NotConnectedIsConflict(t *testing.T) {
	handler, service := setupTestHandlerWithMock()
	service.On("ImportHealth", mock.Anything, int64(7), mock.Anything, mock.Anything).
		Return(nil, ErrHealthNotConnected)

	w := postImport(t, handler, `{"items":[{"kind":"workout_deleted","external_id":"x"}]}`)

	assert.Equal(t, http.StatusConflict, w.Code)
	assert.Contains(t, w.Body.String(), `"code":"conflict"`)
}

func TestImportHealthHandler_AnswersAcceptedAndRejected(t *testing.T) {
	handler, service := setupTestHandlerWithMock()
	service.On("ImportHealth", mock.Anything, int64(7), mock.Anything, mock.Anything).
		Return(&HealthImportResult{Accepted: 1, Rejected: []HealthImportRejection{{Index: 1, Code: "validation"}}}, nil)

	w := postImport(t, handler, `{"items":[{"kind":"workout_deleted","external_id":"x"},{"kind":"?"}]}`)

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"status":"success","data":{"accepted":1,"rejected":[{"index":1,"code":"validation"}]}}`, w.Body.String())
}
