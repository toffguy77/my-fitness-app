package dashboard

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func day(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse(weekDateLayout, s)
	require.NoError(t, err)
	return d
}

// Неделя — с понедельника, содержащая календарную дату в её поясе.
func TestCalendarWeekIsMondayBased(t *testing.T) {
	moscow, err := time.LoadLocation("Europe/Moscow")
	require.NoError(t, err)
	cases := []struct {
		name string
		at   time.Time
		want string
	}{
		{"понедельник", time.Date(2026, 10, 12, 9, 0, 0, 0, moscow), "2026-10-12"},
		{"вторник", time.Date(2026, 10, 13, 18, 30, 0, 0, moscow), "2026-10-12"},
		{"воскресенье вечером", time.Date(2026, 10, 18, 23, 50, 0, 0, moscow), "2026-10-12"},
		// 00:30 понедельника по Москве — ещё воскресенье по UTC; неделя — новая.
		{"полночь понедельника по Москве", time.Date(2026, 10, 19, 0, 30, 0, 0, moscow), "2026-10-19"},
		{"через год", time.Date(2027, 1, 1, 12, 0, 0, 0, time.UTC), "2026-12-28"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			start, end := calendarWeek(tc.at)
			assert.Equal(t, tc.want, start.Format(weekDateLayout))
			assert.Equal(t, time.Monday, start.Weekday())
			assert.Equal(t, time.Sunday, end.Weekday())
			assert.Equal(t, start.AddDate(0, 0, 6), end)
		})
	}
}

func TestISOWeekIdentifier(t *testing.T) {
	assert.Equal(t, "2026-W42", isoWeekIdentifier(day(t, "2026-10-12")))
	assert.Equal(t, "2026-W53", isoWeekIdentifier(day(t, "2026-12-28")))
	assert.Equal(t, "2026-W01", isoWeekIdentifier(day(t, "2025-12-29")))
}

// Веб шлёт дату без времени, приложение — RFC 3339 с поясом профиля.
func TestWeekDateAcceptsDateAndRFC3339(t *testing.T) {
	cases := map[string]string{
		`"2026-10-12"`:                "2026-10-12",
		`"2026-10-12T00:00:00+03:00"`: "2026-10-12",
		`"2026-10-12T00:00:00Z"`:      "2026-10-12",
		`"2026-10-18T23:00:00-05:00"`: "2026-10-18",
	}
	for raw, want := range cases {
		var d WeekDate
		require.NoError(t, json.Unmarshal([]byte(raw), &d), raw)
		assert.Equal(t, want, time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC).Format(weekDateLayout), raw)
	}

	var bad WeekDate
	assert.Error(t, json.Unmarshal([]byte(`"12.10.2026"`), &bad))
	assert.Error(t, json.Unmarshal([]byte(`20261012`), &bad))
	var empty WeekDate
	require.NoError(t, json.Unmarshal([]byte(`null`), &empty))
	assert.True(t, empty.IsZero())
}

// Отчёт: дата без времени и RFC 3339 дают одну и ту же неделю с понедельника.
func TestSubmitWeeklyReportAcceptsDateOnlyAndRFC3339(t *testing.T) {
	monday, sunday := day(t, "2026-10-12"), day(t, "2026-10-18")
	bodies := map[string]string{
		"веб, дата":              `{"week_start":"2026-10-12","week_end":"2026-10-18"}`,
		"приложение, RFC 3339":   `{"week_start":"2026-10-12T00:00:00+03:00","week_end":"2026-10-18T00:00:00+03:00"}`,
		"середина недели":        `{"week_start":"2026-10-14","week_end":"2026-10-18"}`,
		"прежний формат веба, Z": `{"week_start":"2026-10-12T00:00:00Z","week_end":"2026-10-18T00:00:00Z"}`,
	}
	for name, body := range bodies {
		t.Run(name, func(t *testing.T) {
			handler, svc := setupTestHandlerWithMock()
			svc.On("ValidateWeekData", mock.Anything, int64(1), monday, sunday).Return(true, []string{}, nil)
			svc.On("CreateWeeklyReport", mock.Anything, int64(1), monday, sunday).
				Return(&WeeklyReport{ID: "r", UserID: 1, CuratorID: 2, WeekStart: monday, WeekEnd: sunday}, nil)

			router := gin.New()
			router.POST("/weekly-report", func(c *gin.Context) {
				c.Set("user_id", int64(1))
				handler.SubmitWeeklyReport(c)
			})
			req := httptest.NewRequest(http.MethodPost, "/weekly-report", bytes.NewBufferString(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusCreated, w.Code, w.Body.String())
			svc.AssertExpectations(t)
		})
	}
}

func TestSubmitWeeklyReportRejectsMissingOrMalformedDates(t *testing.T) {
	for name, body := range map[string]string{
		"нет week_start":  `{"week_end":"2026-10-18"}`,
		"нет week_end":    `{"week_start":"2026-10-12"}`,
		"чужой формат":    `{"week_start":"12.10.2026","week_end":"18.10.2026"}`,
		"конец до начала": `{"week_start":"2026-10-18","week_end":"2026-10-12"}`,
	} {
		t.Run(name, func(t *testing.T) {
			handler, svc := setupTestHandlerWithMock()
			router := gin.New()
			router.POST("/weekly-report", func(c *gin.Context) {
				c.Set("user_id", int64(1))
				handler.SubmitWeeklyReport(c)
			})
			req := httptest.NewRequest(http.MethodPost, "/weekly-report", bytes.NewBufferString(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusBadRequest, w.Code)
			svc.AssertNotCalled(t, "ValidateWeekData", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
		})
	}
}
