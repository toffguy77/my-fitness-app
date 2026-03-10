package curator

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockCuratorService implements ServiceInterface for testing
type mockCuratorService struct {
	getClientsFunc       func(ctx context.Context, curatorID int64) ([]ClientCard, error)
	getClientDetailFunc  func(ctx context.Context, curatorID int64, clientID int64, date string, days int) (*ClientDetail, error)
	setTargetWeightFunc  func(ctx context.Context, curatorID int64, clientID int64, targetWeight *float64) error
	setWaterGoalFunc     func(ctx context.Context, curatorID int64, clientID int64, waterGoal *int) error
	createWeeklyPlanFunc func(ctx context.Context, curatorID, clientID int64, req CreateWeeklyPlanRequest) (*WeeklyPlanView, error)
	updateWeeklyPlanFunc func(ctx context.Context, curatorID, clientID int64, planID string, req UpdateWeeklyPlanRequest) (*WeeklyPlanView, error)
	deleteWeeklyPlanFunc func(ctx context.Context, curatorID, clientID int64, planID string) error
	getWeeklyPlansFunc   func(ctx context.Context, curatorID, clientID int64) ([]WeeklyPlanView, error)
	createTaskFunc       func(ctx context.Context, curatorID, clientID int64, req CreateTaskRequest) (*TaskView, error)
	updateTaskFunc       func(ctx context.Context, curatorID, clientID int64, taskID string, req UpdateTaskRequest) (*TaskView, error)
	deleteTaskFunc       func(ctx context.Context, curatorID, clientID int64, taskID string) error
	getTasksFunc         func(ctx context.Context, curatorID, clientID int64, status string) ([]TaskView, error)
}

func (m *mockCuratorService) GetClients(ctx context.Context, curatorID int64) ([]ClientCard, error) {
	if m.getClientsFunc != nil {
		return m.getClientsFunc(ctx, curatorID)
	}
	return []ClientCard{}, nil
}

func (m *mockCuratorService) GetClientDetail(ctx context.Context, curatorID int64, clientID int64, date string, days int) (*ClientDetail, error) {
	if m.getClientDetailFunc != nil {
		return m.getClientDetailFunc(ctx, curatorID, clientID, date, days)
	}
	return &ClientDetail{}, nil
}

func (m *mockCuratorService) SetTargetWeight(ctx context.Context, curatorID int64, clientID int64, targetWeight *float64) error {
	if m.setTargetWeightFunc != nil {
		return m.setTargetWeightFunc(ctx, curatorID, clientID, targetWeight)
	}
	return nil
}

func (m *mockCuratorService) SetWaterGoal(ctx context.Context, curatorID int64, clientID int64, waterGoal *int) error {
	if m.setWaterGoalFunc != nil {
		return m.setWaterGoalFunc(ctx, curatorID, clientID, waterGoal)
	}
	return nil
}

func (m *mockCuratorService) CreateWeeklyPlan(ctx context.Context, curatorID, clientID int64, req CreateWeeklyPlanRequest) (*WeeklyPlanView, error) {
	if m.createWeeklyPlanFunc != nil {
		return m.createWeeklyPlanFunc(ctx, curatorID, clientID, req)
	}
	return &WeeklyPlanView{}, nil
}

func (m *mockCuratorService) UpdateWeeklyPlan(ctx context.Context, curatorID, clientID int64, planID string, req UpdateWeeklyPlanRequest) (*WeeklyPlanView, error) {
	if m.updateWeeklyPlanFunc != nil {
		return m.updateWeeklyPlanFunc(ctx, curatorID, clientID, planID, req)
	}
	return &WeeklyPlanView{}, nil
}

func (m *mockCuratorService) DeleteWeeklyPlan(ctx context.Context, curatorID, clientID int64, planID string) error {
	if m.deleteWeeklyPlanFunc != nil {
		return m.deleteWeeklyPlanFunc(ctx, curatorID, clientID, planID)
	}
	return nil
}

func (m *mockCuratorService) GetWeeklyPlans(ctx context.Context, curatorID, clientID int64) ([]WeeklyPlanView, error) {
	if m.getWeeklyPlansFunc != nil {
		return m.getWeeklyPlansFunc(ctx, curatorID, clientID)
	}
	return []WeeklyPlanView{}, nil
}

func (m *mockCuratorService) CreateTask(ctx context.Context, curatorID, clientID int64, req CreateTaskRequest) (*TaskView, error) {
	if m.createTaskFunc != nil {
		return m.createTaskFunc(ctx, curatorID, clientID, req)
	}
	return &TaskView{}, nil
}

func (m *mockCuratorService) UpdateTask(ctx context.Context, curatorID, clientID int64, taskID string, req UpdateTaskRequest) (*TaskView, error) {
	if m.updateTaskFunc != nil {
		return m.updateTaskFunc(ctx, curatorID, clientID, taskID, req)
	}
	return &TaskView{}, nil
}

func (m *mockCuratorService) DeleteTask(ctx context.Context, curatorID, clientID int64, taskID string) error {
	if m.deleteTaskFunc != nil {
		return m.deleteTaskFunc(ctx, curatorID, clientID, taskID)
	}
	return nil
}

func (m *mockCuratorService) GetTasks(ctx context.Context, curatorID, clientID int64, status string) ([]TaskView, error) {
	if m.getTasksFunc != nil {
		return m.getTasksFunc(ctx, curatorID, clientID, status)
	}
	return []TaskView{}, nil
}

func setupCuratorTestHandler() (*Handler, *mockCuratorService) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{}
	log := logger.New()
	mock := &mockCuratorService{}
	handler := &Handler{
		cfg:     cfg,
		log:     log,
		service: mock,
	}
	return handler, mock
}

func TestHandler_GetClients(t *testing.T) {
	t.Run("success returns clients", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getClientsFunc = func(ctx context.Context, curatorID int64) ([]ClientCard, error) {
			return []ClientCard{
				{ID: 10, Name: "Client One"},
				{ID: 20, Name: "Client Two"},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients", nil)
		c.Set("user_id", int64(1))

		handler.GetClients(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].([]interface{})
		assert.Len(t, data, 2)
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getClientsFunc = func(ctx context.Context, curatorID int64) ([]ClientCard, error) {
			return nil, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients", nil)
		c.Set("user_id", int64(1))

		handler.GetClients(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients", nil)

		handler.GetClients(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestHandler_GetClientDetail(t *testing.T) {
	t.Run("success returns client detail", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getClientDetailFunc = func(ctx context.Context, curatorID int64, clientID int64, date string, days int) (*ClientDetail, error) {
			return &ClientDetail{
				ClientCard: ClientCard{ID: clientID, Name: "Test Client"},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetClientDetail(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/abc", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}}

		handler.GetClientDetail(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("client not found returns 404", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getClientDetailFunc = func(ctx context.Context, curatorID int64, clientID int64, date string, days int) (*ClientDetail, error) {
			return nil, errors.New("client not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/999", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "999"}}

		handler.GetClientDetail(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized relationship returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getClientDetailFunc = func(ctx context.Context, curatorID int64, clientID int64, date string, days int) (*ClientDetail, error) {
			return nil, errors.New("unauthorized: no active relationship between curator 1 and client 10")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetClientDetail(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10", nil)
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetClientDetail(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestHandler_SetTargetWeight(t *testing.T) {
	t.Run("success sets target weight", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.setTargetWeightFunc = func(ctx context.Context, curatorID int64, clientID int64, targetWeight *float64) error {
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		weight := 75.0
		body, _ := json.Marshal(SetTargetWeightRequest{TargetWeight: &weight})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/target-weight", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.SetTargetWeight(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		weight := 75.0
		body, _ := json.Marshal(SetTargetWeightRequest{TargetWeight: &weight})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/abc/target-weight", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}}

		handler.SetTargetWeight(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.setTargetWeightFunc = func(ctx context.Context, curatorID int64, clientID int64, targetWeight *float64) error {
			return errors.New("unauthorized: no active relationship")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		weight := 75.0
		body, _ := json.Marshal(SetTargetWeightRequest{TargetWeight: &weight})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/target-weight", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.SetTargetWeight(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("null target weight clears it", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		var capturedWeight *float64
		mock.setTargetWeightFunc = func(ctx context.Context, curatorID int64, clientID int64, targetWeight *float64) error {
			capturedWeight = targetWeight
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(SetTargetWeightRequest{TargetWeight: nil})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/target-weight", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.SetTargetWeight(c)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Nil(t, capturedWeight)
	})
}

func TestHandler_SetWaterGoal(t *testing.T) {
	t.Run("success sets water goal", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.setWaterGoalFunc = func(ctx context.Context, curatorID int64, clientID int64, waterGoal *int) error {
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		goal := 8
		body, _ := json.Marshal(SetWaterGoalRequest{WaterGoal: &goal})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/water-goal", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.SetWaterGoal(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		goal := 8
		body, _ := json.Marshal(SetWaterGoalRequest{WaterGoal: &goal})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/abc/water-goal", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}}

		handler.SetWaterGoal(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("water goal out of range returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		goal := 50
		body, _ := json.Marshal(SetWaterGoalRequest{WaterGoal: &goal})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/water-goal", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.SetWaterGoal(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("zero water goal returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		goal := 0
		body, _ := json.Marshal(SetWaterGoalRequest{WaterGoal: &goal})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/water-goal", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.SetWaterGoal(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.setWaterGoalFunc = func(ctx context.Context, curatorID int64, clientID int64, waterGoal *int) error {
			return errors.New("unauthorized: no active relationship")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		goal := 8
		body, _ := json.Marshal(SetWaterGoalRequest{WaterGoal: &goal})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/water-goal", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.SetWaterGoal(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("null water goal clears it", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.setWaterGoalFunc = func(ctx context.Context, curatorID int64, clientID int64, waterGoal *int) error {
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(SetWaterGoalRequest{WaterGoal: nil})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/water-goal", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.SetWaterGoal(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})
}

// ============================================================================
// CreateWeeklyPlan Handler Tests
// ============================================================================

func TestHandler_CreateWeeklyPlan(t *testing.T) {
	t.Run("success creates plan and returns 201", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.createWeeklyPlanFunc = func(ctx context.Context, curatorID, clientID int64, req CreateWeeklyPlanRequest) (*WeeklyPlanView, error) {
			return &WeeklyPlanView{
				ID:        "plan-uuid-123",
				Calories:  req.Calories,
				Protein:   req.Protein,
				Fat:       req.Fat,
				Carbs:     req.Carbs,
				StartDate: req.StartDate,
				EndDate:   req.EndDate,
				IsActive:  true,
				CreatedAt: "2026-03-10T12:00:00Z",
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(CreateWeeklyPlanRequest{
			Calories:  2000,
			Protein:   150,
			Fat:       70,
			Carbs:     250,
			StartDate: "2026-03-10",
			EndDate:   "2026-03-16",
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/curator/clients/10/weekly-plan", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.CreateWeeklyPlan(c)

		assert.Equal(t, http.StatusCreated, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].(map[string]interface{})
		assert.Equal(t, "plan-uuid-123", data["id"])
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(CreateWeeklyPlanRequest{Calories: 2000, Protein: 150, Fat: 70, Carbs: 250, StartDate: "2026-03-10", EndDate: "2026-03-16"})
		c.Request = httptest.NewRequest(http.MethodPost, "/curator/clients/abc/weekly-plan", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}}

		handler.CreateWeeklyPlan(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("missing required fields returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(map[string]interface{}{"calories": 2000})
		c.Request = httptest.NewRequest(http.MethodPost, "/curator/clients/10/weekly-plan", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.CreateWeeklyPlan(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.createWeeklyPlanFunc = func(ctx context.Context, curatorID, clientID int64, req CreateWeeklyPlanRequest) (*WeeklyPlanView, error) {
			return nil, errors.New("unauthorized: no active relationship between curator 1 and client 10")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(CreateWeeklyPlanRequest{Calories: 2000, Protein: 150, Fat: 70, Carbs: 250, StartDate: "2026-03-10", EndDate: "2026-03-16"})
		c.Request = httptest.NewRequest(http.MethodPost, "/curator/clients/10/weekly-plan", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.CreateWeeklyPlan(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/curator/clients/10/weekly-plan", nil)

		handler.CreateWeeklyPlan(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

// ============================================================================
// UpdateWeeklyPlan Handler Tests
// ============================================================================

func TestHandler_UpdateWeeklyPlan(t *testing.T) {
	t.Run("success updates plan", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.updateWeeklyPlanFunc = func(ctx context.Context, curatorID, clientID int64, planID string, req UpdateWeeklyPlanRequest) (*WeeklyPlanView, error) {
			return &WeeklyPlanView{
				ID:        planID,
				Calories:  2200,
				Protein:   150,
				Fat:       70,
				Carbs:     250,
				StartDate: "2026-03-10",
				EndDate:   "2026-03-16",
				IsActive:  true,
				CreatedAt: "2026-03-10T12:00:00Z",
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		cal := 2200.0
		body, _ := json.Marshal(UpdateWeeklyPlanRequest{Calories: &cal})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/weekly-plan/plan-123", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "planId", Value: "plan-123"}}

		handler.UpdateWeeklyPlan(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("plan not found returns 404", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.updateWeeklyPlanFunc = func(ctx context.Context, curatorID, clientID int64, planID string, req UpdateWeeklyPlanRequest) (*WeeklyPlanView, error) {
			return nil, errors.New("weekly plan not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		cal := 2200.0
		body, _ := json.Marshal(UpdateWeeklyPlanRequest{Calories: &cal})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/weekly-plan/nonexistent", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "planId", Value: "nonexistent"}}

		handler.UpdateWeeklyPlan(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.updateWeeklyPlanFunc = func(ctx context.Context, curatorID, clientID int64, planID string, req UpdateWeeklyPlanRequest) (*WeeklyPlanView, error) {
			return nil, errors.New("unauthorized: no active relationship")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		cal := 2200.0
		body, _ := json.Marshal(UpdateWeeklyPlanRequest{Calories: &cal})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/weekly-plan/plan-123", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "planId", Value: "plan-123"}}

		handler.UpdateWeeklyPlan(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

// ============================================================================
// DeleteWeeklyPlan Handler Tests
// ============================================================================

func TestHandler_DeleteWeeklyPlan(t *testing.T) {
	t.Run("success deletes plan", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.deleteWeeklyPlanFunc = func(ctx context.Context, curatorID, clientID int64, planID string) error {
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/curator/clients/10/weekly-plan/plan-123", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "planId", Value: "plan-123"}}

		handler.DeleteWeeklyPlan(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("plan not found returns 404", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.deleteWeeklyPlanFunc = func(ctx context.Context, curatorID, clientID int64, planID string) error {
			return errors.New("weekly plan not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/curator/clients/10/weekly-plan/nonexistent", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "planId", Value: "nonexistent"}}

		handler.DeleteWeeklyPlan(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.deleteWeeklyPlanFunc = func(ctx context.Context, curatorID, clientID int64, planID string) error {
			return errors.New("unauthorized: no active relationship")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/curator/clients/10/weekly-plan/plan-123", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "planId", Value: "plan-123"}}

		handler.DeleteWeeklyPlan(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/curator/clients/abc/weekly-plan/plan-123", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}, {Key: "planId", Value: "plan-123"}}

		handler.DeleteWeeklyPlan(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

// ============================================================================
// GetWeeklyPlans Handler Tests
// ============================================================================

func TestHandler_GetWeeklyPlans(t *testing.T) {
	t.Run("success returns plans", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getWeeklyPlansFunc = func(ctx context.Context, curatorID, clientID int64) ([]WeeklyPlanView, error) {
			return []WeeklyPlanView{
				{ID: "plan-1", Calories: 2000, IsActive: true},
				{ID: "plan-2", Calories: 1800, IsActive: false},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10/weekly-plans", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetWeeklyPlans(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].([]interface{})
		assert.Len(t, data, 2)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getWeeklyPlansFunc = func(ctx context.Context, curatorID, clientID int64) ([]WeeklyPlanView, error) {
			return nil, errors.New("unauthorized: no active relationship")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10/weekly-plans", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetWeeklyPlans(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/abc/weekly-plans", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}}

		handler.GetWeeklyPlans(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10/weekly-plans", nil)
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetWeeklyPlans(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

// ============================================================================
// CreateTask Handler Tests
// ============================================================================

func TestHandler_CreateTask(t *testing.T) {
	t.Run("success creates task and returns 201", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.createTaskFunc = func(ctx context.Context, curatorID, clientID int64, req CreateTaskRequest) (*TaskView, error) {
			return &TaskView{
				ID:         "task-uuid-1",
				Title:      req.Title,
				Type:       req.Type,
				Deadline:   req.Deadline,
				Recurrence: req.Recurrence,
				Status:     "active",
				CreatedAt:  "2026-03-10T12:00:00Z",
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(CreateTaskRequest{
			Title:      "Take measurements",
			Type:       "measurement",
			Deadline:   "2026-03-15",
			Recurrence: "once",
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/curator/clients/10/tasks", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.CreateTask(c)

		assert.Equal(t, http.StatusCreated, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].(map[string]interface{})
		assert.Equal(t, "task-uuid-1", data["id"])
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(CreateTaskRequest{Title: "Test", Type: "habit", Deadline: "2026-03-15", Recurrence: "once"})
		c.Request = httptest.NewRequest(http.MethodPost, "/curator/clients/abc/tasks", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}}

		handler.CreateTask(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("missing required fields returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(map[string]interface{}{"title": "Test"})
		c.Request = httptest.NewRequest(http.MethodPost, "/curator/clients/10/tasks", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.CreateTask(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.createTaskFunc = func(ctx context.Context, curatorID, clientID int64, req CreateTaskRequest) (*TaskView, error) {
			return nil, errors.New("unauthorized: no active relationship between curator 1 and client 10")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(CreateTaskRequest{Title: "Test", Type: "habit", Deadline: "2026-03-15", Recurrence: "once"})
		c.Request = httptest.NewRequest(http.MethodPost, "/curator/clients/10/tasks", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.CreateTask(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/curator/clients/10/tasks", nil)

		handler.CreateTask(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

// ============================================================================
// UpdateTask Handler Tests
// ============================================================================

func TestHandler_UpdateTask(t *testing.T) {
	t.Run("success updates task", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.updateTaskFunc = func(ctx context.Context, curatorID, clientID int64, taskID string, req UpdateTaskRequest) (*TaskView, error) {
			return &TaskView{
				ID:         taskID,
				Title:      "Updated title",
				Type:       "habit",
				Deadline:   "2026-03-15",
				Recurrence: "once",
				Status:     "active",
				CreatedAt:  "2026-03-10T12:00:00Z",
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		title := "Updated title"
		body, _ := json.Marshal(UpdateTaskRequest{Title: &title})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/tasks/task-123", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "taskId", Value: "task-123"}}

		handler.UpdateTask(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("task not found returns 404", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.updateTaskFunc = func(ctx context.Context, curatorID, clientID int64, taskID string, req UpdateTaskRequest) (*TaskView, error) {
			return nil, errors.New("task not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		title := "Updated"
		body, _ := json.Marshal(UpdateTaskRequest{Title: &title})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/tasks/nonexistent", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "taskId", Value: "nonexistent"}}

		handler.UpdateTask(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.updateTaskFunc = func(ctx context.Context, curatorID, clientID int64, taskID string, req UpdateTaskRequest) (*TaskView, error) {
			return nil, errors.New("unauthorized: no active relationship")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		title := "Updated"
		body, _ := json.Marshal(UpdateTaskRequest{Title: &title})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/10/tasks/task-123", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "taskId", Value: "task-123"}}

		handler.UpdateTask(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

// ============================================================================
// DeleteTask Handler Tests
// ============================================================================

func TestHandler_DeleteTask(t *testing.T) {
	t.Run("success deletes task", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.deleteTaskFunc = func(ctx context.Context, curatorID, clientID int64, taskID string) error {
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/curator/clients/10/tasks/task-123", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "taskId", Value: "task-123"}}

		handler.DeleteTask(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("task not found returns 404", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.deleteTaskFunc = func(ctx context.Context, curatorID, clientID int64, taskID string) error {
			return errors.New("task not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/curator/clients/10/tasks/nonexistent", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "taskId", Value: "nonexistent"}}

		handler.DeleteTask(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.deleteTaskFunc = func(ctx context.Context, curatorID, clientID int64, taskID string) error {
			return errors.New("unauthorized: no active relationship")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/curator/clients/10/tasks/task-123", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}, {Key: "taskId", Value: "task-123"}}

		handler.DeleteTask(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/curator/clients/abc/tasks/task-123", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}, {Key: "taskId", Value: "task-123"}}

		handler.DeleteTask(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

// ============================================================================
// GetTasks Handler Tests
// ============================================================================

func TestHandler_GetTasks(t *testing.T) {
	t.Run("success returns tasks", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getTasksFunc = func(ctx context.Context, curatorID, clientID int64, status string) ([]TaskView, error) {
			return []TaskView{
				{ID: "task-1", Title: "Drink water", Type: "habit", Status: "active"},
				{ID: "task-2", Title: "Take measurements", Type: "measurement", Status: "completed"},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10/tasks", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetTasks(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].([]interface{})
		assert.Len(t, data, 2)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getTasksFunc = func(ctx context.Context, curatorID, clientID int64, status string) ([]TaskView, error) {
			return nil, errors.New("unauthorized: no active relationship")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10/tasks", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetTasks(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/abc/tasks", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}}

		handler.GetTasks(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/10/tasks", nil)
		c.Params = gin.Params{{Key: "id", Value: "10"}}

		handler.GetTasks(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}
