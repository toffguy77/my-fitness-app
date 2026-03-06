package nutritioncalc

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupNutritionCalcTestHandler(t *testing.T) (*Handler, sqlmock.Sqlmock, func()) {
	gin.SetMode(gin.TestMode)
	db, mock, err := sqlmock.New()
	require.NoError(t, err)

	cfg := &config.Config{}
	log := logger.New()
	wrappedDB := &database.DB{DB: db}
	handler := NewHandler(cfg, log, wrappedDB)

	return handler, mock, func() { db.Close() }
}

func TestHandler_GetTargets(t *testing.T) {
	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/nutrition-calc/targets", nil)

		handler.GetTargets(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("invalid user_id type returns 400", func(t *testing.T) {
		handler, _, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/nutrition-calc/targets", nil)
		c.Set("user_id", "not-a-number") // wrong type

		handler.GetTargets(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("invalid date format returns 400", func(t *testing.T) {
		handler, mock, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		// GetUserTimezone query
		mock.ExpectQuery("SELECT COALESCE").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"timezone"}).AddRow("Europe/Moscow"))

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/nutrition-calc/targets?date=not-a-date", nil)
		c.Set("user_id", int64(1))

		handler.GetTargets(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("returns stored targets when they exist", func(t *testing.T) {
		handler, mock, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		// GetUserTimezone
		mock.ExpectQuery("SELECT COALESCE").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"timezone"}).AddRow("Europe/Moscow"))

		// GetTargetsForDate
		mock.ExpectQuery("SELECT id, user_id, date").
			WithArgs(int64(1), "2026-03-06").
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "user_id", "date", "calories", "protein", "fat", "carbs",
				"bmr", "tdee", "workout_bonus", "weight_used", "source", "created_at",
			}).AddRow(
				1, 1, "2026-03-06", 2000.0, 120.0, 55.0, 250.0,
				1600.0, 2200.0, 0.0, 70.0, "calculated", time.Now(),
			))

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/nutrition-calc/targets?date=2026-03-06", nil)
		c.Set("user_id", int64(1))

		handler.GetTargets(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
	})
}

func TestHandler_GetHistory(t *testing.T) {
	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/nutrition-calc/history", nil)

		handler.GetHistory(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("invalid user_id type returns 400", func(t *testing.T) {
		handler, _, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/nutrition-calc/history", nil)
		c.Set("user_id", "not-a-number")

		handler.GetHistory(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("returns history data", func(t *testing.T) {
		handler, mock, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		// GetHistory query
		mock.ExpectQuery("SELECT").
			WillReturnRows(sqlmock.NewRows([]string{
				"date",
				"t_cal", "t_pro", "t_fat", "t_carbs",
				"bmr", "tdee", "workout_bonus", "weight_used", "source",
				"a_cal", "a_pro", "a_fat", "a_carbs",
			}).AddRow(
				"2026-03-06",
				2000.0, 120.0, 55.0, 250.0,
				1600.0, 2200.0, 0.0, 70.0, "calculated",
				1800.0, 100.0, 50.0, 230.0,
			))

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/nutrition-calc/history?days=7", nil)
		c.Set("user_id", int64(1))

		handler.GetHistory(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
	})

	t.Run("defaults to 7 days for invalid days param", func(t *testing.T) {
		handler, mock, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		mock.ExpectQuery("SELECT").
			WillReturnRows(sqlmock.NewRows([]string{
				"date",
				"t_cal", "t_pro", "t_fat", "t_carbs",
				"bmr", "tdee", "workout_bonus", "weight_used", "source",
				"a_cal", "a_pro", "a_fat", "a_carbs",
			}))

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/nutrition-calc/history?days=invalid", nil)
		c.Set("user_id", int64(1))

		handler.GetHistory(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})
}

func TestHandler_Recalculate(t *testing.T) {
	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/nutrition-calc/recalculate", nil)

		handler.Recalculate(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("invalid user_id type returns 400", func(t *testing.T) {
		handler, _, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/nutrition-calc/recalculate", nil)
		c.Set("user_id", "not-a-number")

		handler.Recalculate(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("returns nil targets when profile incomplete", func(t *testing.T) {
		handler, mock, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		// GetUserTimezone
		mock.ExpectQuery("SELECT COALESCE").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"timezone"}).AddRow("Europe/Moscow"))

		// Check weekly plan
		mock.ExpectQuery("SELECT calories_goal").
			WillReturnRows(sqlmock.NewRows([]string{"calories_goal", "protein_goal", "fat_goal", "carbs_goal"}))

		// getUserProfile - return no rows (incomplete)
		mock.ExpectQuery("SELECT birth_date").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"birth_date", "biological_sex", "height", "activity_level", "fitness_goal"}))

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/nutrition-calc/recalculate", nil)
		c.Set("user_id", int64(1))

		handler.Recalculate(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].(map[string]interface{})
		assert.Nil(t, data["targets"])
	})
}

func TestHandler_GetClientHistory(t *testing.T) {
	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10/targets/history", nil)
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetClientHistory(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/abc/targets/history", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}}

		handler.GetClientHistory(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("returns client history", func(t *testing.T) {
		handler, mock, cleanup := setupNutritionCalcTestHandler(t)
		defer cleanup()

		mock.ExpectQuery("SELECT").
			WillReturnRows(sqlmock.NewRows([]string{
				"date",
				"t_cal", "t_pro", "t_fat", "t_carbs",
				"bmr", "tdee", "workout_bonus", "weight_used", "source",
				"a_cal", "a_pro", "a_fat", "a_carbs",
			}).AddRow(
				"2026-03-06",
				2000.0, 120.0, 55.0, 250.0,
				1600.0, 2200.0, 0.0, 70.0, "calculated",
				1800.0, 100.0, 50.0, 230.0,
			))

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10/targets/history?days=7", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetClientHistory(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})
}
