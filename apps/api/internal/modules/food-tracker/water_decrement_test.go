package foodtracker

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// water-decrement: что обработчик передаёт сервису при каждом значении
// `glasses`. Арифметику со счётчиком (не ниже нуля) проверяет
// water_integration_test.go на настоящей базе.
func postWater(t *testing.T, handler *Handler, body string) *httptest.ResponseRecorder {
	t.Helper()
	router := gin.New()
	router.POST("/water", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.AddWater(c)
	})
	req := httptest.NewRequest(http.MethodPost, "/water", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestAddWaterPassesTheChangeToTheService(t *testing.T) {
	cases := []struct {
		name string
		body string
		want int
	}{
		{"убрать стакан", `{"date":"2026-10-17","glasses":-1}`, -1},
		{"запрос веба без поля", `{"date":"2026-10-17"}`, 1},
		{"ноль — один стакан, как прежде", `{"date":"2026-10-17","glasses":0}`, 1},
		{"несколько стаканов", `{"date":"2026-10-17","glasses":3}`, 3},
		{"верхняя граница", `{"date":"2026-10-17","glasses":10}`, 10},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			handler, service := setupTestHandlerWithMock()
			service.On("AddWater", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), tc.want).
				Return(&WaterLog{Glasses: 4, Goal: 8, GlassSize: 250, Date: "2026-10-17"}, nil)

			w := postWater(t, handler, tc.body)

			assert.Equal(t, http.StatusOK, w.Code, w.Body.String())
			service.AssertExpectations(t)
		})
	}
}

func TestAddWaterRejectsChangesOutsideTheRange(t *testing.T) {
	for _, body := range []string{
		`{"date":"2026-10-17","glasses":-3}`,
		`{"date":"2026-10-17","glasses":-2}`,
		`{"date":"2026-10-17","glasses":11}`,
	} {
		t.Run(body, func(t *testing.T) {
			handler, service := setupTestHandlerWithMock()

			w := postWater(t, handler, body)

			assert.Equal(t, http.StatusBadRequest, w.Code)
			var resp map[string]any
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
			assert.Equal(t, "validation", resp["code"])
			service.AssertNotCalled(t, "AddWater", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
		})
	}
}

func TestAddWaterRequestValidateBounds(t *testing.T) {
	for glasses, ok := range map[int]bool{-3: false, -2: false, -1: true, 0: true, 1: true, 10: true, 11: false} {
		err := (&AddWaterRequest{Date: "2026-10-17", Glasses: glasses}).Validate()
		assert.Equal(t, ok, err == nil, "glasses=%d", glasses)
	}
	assert.Equal(t, 1, (&AddWaterRequest{}).WaterChange())
	assert.Equal(t, -1, (&AddWaterRequest{Glasses: -1}).WaterChange())
}
