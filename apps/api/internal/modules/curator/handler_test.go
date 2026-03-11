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
	getClientsFunc           func(ctx context.Context, curatorID int64) ([]ClientCard, error)
	getClientDetailFunc      func(ctx context.Context, curatorID int64, clientID int64, date string, days int) (*ClientDetail, error)
	setTargetWeightFunc      func(ctx context.Context, curatorID int64, clientID int64, targetWeight *float64) error
	setWaterGoalFunc         func(ctx context.Context, curatorID int64, clientID int64, waterGoal *int) error
	createWeeklyPlanFunc     func(ctx context.Context, curatorID, clientID int64, req CreateWeeklyPlanRequest) (*WeeklyPlanView, error)
	updateWeeklyPlanFunc     func(ctx context.Context, curatorID, clientID int64, planID string, req UpdateWeeklyPlanRequest) (*WeeklyPlanView, error)
	deleteWeeklyPlanFunc     func(ctx context.Context, curatorID, clientID int64, planID string) error
	getWeeklyPlansFunc       func(ctx context.Context, curatorID, clientID int64) ([]WeeklyPlanView, error)
	createTaskFunc           func(ctx context.Context, curatorID, clientID int64, req CreateTaskRequest) (*TaskView, error)
	updateTaskFunc           func(ctx context.Context, curatorID, clientID int64, taskID string, req UpdateTaskRequest) (*TaskView, error)
	deleteTaskFunc           func(ctx context.Context, curatorID, clientID int64, taskID string) error
	getTasksFunc             func(ctx context.Context, curatorID, clientID int64, status string) ([]TaskView, error)
	submitFeedbackFunc       func(ctx context.Context, curatorID, clientID int64, reportID string, req SubmitFeedbackRequest) error
	getWeeklyReportsFunc     func(ctx context.Context, curatorID, clientID int64) ([]WeeklyReportView, error)
	getAnalyticsFunc         func(ctx context.Context, curatorID int64) (*AnalyticsSummary, error)
	getAttentionListFunc     func(ctx context.Context, curatorID int64) ([]AttentionItem, error)
	getAnalyticsHistoryFunc  func(ctx context.Context, curatorID int64, period string, count int) (interface{}, error)
	getBenchmarkFunc         func(ctx context.Context, curatorID int64, weeks int) (*BenchmarkData, error)
	collectDailySnapshotFunc func(ctx context.Context, curatorID int64) error
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

func (m *mockCuratorService) SubmitFeedback(ctx context.Context, curatorID, clientID int64, reportID string, req SubmitFeedbackRequest) error {
	if m.submitFeedbackFunc != nil {
		return m.submitFeedbackFunc(ctx, curatorID, clientID, reportID, req)
	}
	return nil
}

func (m *mockCuratorService) GetWeeklyReports(ctx context.Context, curatorID, clientID int64) ([]WeeklyReportView, error) {
	if m.getWeeklyReportsFunc != nil {
		return m.getWeeklyReportsFunc(ctx, curatorID, clientID)
	}
	return []WeeklyReportView{}, nil
}

func (m *mockCuratorService) GetAnalytics(ctx context.Context, curatorID int64) (*AnalyticsSummary, error) {
	if m.getAnalyticsFunc != nil {
		return m.getAnalyticsFunc(ctx, curatorID)
	}
	return &AnalyticsSummary{}, nil
}

func (m *mockCuratorService) GetAttentionList(ctx context.Context, curatorID int64) ([]AttentionItem, error) {
	if m.getAttentionListFunc != nil {
		return m.getAttentionListFunc(ctx, curatorID)
	}
	return []AttentionItem{}, nil
}

func (m *mockCuratorService) GetAnalyticsHistory(ctx context.Context, curatorID int64, period string, count int) (interface{}, error) {
	if m.getAnalyticsHistoryFunc != nil {
		return m.getAnalyticsHistoryFunc(ctx, curatorID, period, count)
	}
	return []DailySnapshot{}, nil
}

func (m *mockCuratorService) GetBenchmark(ctx context.Context, curatorID int64, weeks int) (*BenchmarkData, error) {
	if m.getBenchmarkFunc != nil {
		return m.getBenchmarkFunc(ctx, curatorID, weeks)
	}
	return &BenchmarkData{}, nil
}

func (m *mockCuratorService) CollectDailySnapshot(ctx context.Context, curatorID int64) error {
	if m.collectDailySnapshotFunc != nil {
		return m.collectDailySnapshotFunc(ctx, curatorID)
	}
	return nil
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

// ============================================================================
// SubmitFeedback Handler Tests
// ============================================================================

func TestHandler_SubmitFeedback(t *testing.T) {
	t.Run("success submits feedback", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.submitFeedbackFunc = func(ctx context.Context, curatorID, clientID int64, reportID string, req SubmitFeedbackRequest) error {
			assert.Equal(t, int64(1), curatorID)
			assert.Equal(t, int64(42), clientID)
			assert.Equal(t, "report-123", reportID)
			assert.Equal(t, "Good week overall", req.Summary)
			assert.NotNil(t, req.Nutrition)
			assert.Equal(t, "good", req.Nutrition.Rating)
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(map[string]interface{}{
			"summary":         "Good week overall",
			"nutrition":       map[string]interface{}{"rating": "good", "comment": "Nice"},
			"recommendations": "Keep it up",
		})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/42/weekly-reports/report-123/feedback", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "42"}, {Key: "reportId", Value: "report-123"}}

		handler.SubmitFeedback(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
	})

	t.Run("missing summary returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(map[string]interface{}{
			"nutrition": map[string]interface{}{"rating": "good", "comment": "Nice"},
		})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/42/weekly-reports/report-123/feedback", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "42"}, {Key: "reportId", Value: "report-123"}}

		handler.SubmitFeedback(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.submitFeedbackFunc = func(ctx context.Context, curatorID, clientID int64, reportID string, req SubmitFeedbackRequest) error {
			return errors.New("unauthorized: no active relationship between curator 1 and client 42")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(map[string]interface{}{"summary": "test"})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/42/weekly-reports/report-123/feedback", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "42"}, {Key: "reportId", Value: "report-123"}}

		handler.SubmitFeedback(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("report not found returns 404", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.submitFeedbackFunc = func(ctx context.Context, curatorID, clientID int64, reportID string, req SubmitFeedbackRequest) error {
			return errors.New("weekly report not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(map[string]interface{}{"summary": "test"})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/42/weekly-reports/nonexistent/feedback", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "42"}, {Key: "reportId", Value: "nonexistent"}}

		handler.SubmitFeedback(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(map[string]interface{}{"summary": "test"})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/abc/weekly-reports/report-123/feedback", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}, {Key: "reportId", Value: "report-123"}}

		handler.SubmitFeedback(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/42/weekly-reports/report-123/feedback", nil)
		c.Params = gin.Params{{Key: "id", Value: "42"}, {Key: "reportId", Value: "report-123"}}

		handler.SubmitFeedback(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("internal server error returns 500", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.submitFeedbackFunc = func(ctx context.Context, curatorID, clientID int64, reportID string, req SubmitFeedbackRequest) error {
			return errors.New("database connection failed")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(map[string]interface{}{"summary": "test"})
		c.Request = httptest.NewRequest(http.MethodPut, "/curator/clients/42/weekly-reports/report-123/feedback", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "42"}, {Key: "reportId", Value: "report-123"}}

		handler.SubmitFeedback(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

// ============================================================================
// GetWeeklyReports Handler Tests
// ============================================================================

func TestHandler_GetWeeklyReports(t *testing.T) {
	t.Run("success returns reports", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		feedback := json.RawMessage(`{"summary":"Good"}`)
		mock.getWeeklyReportsFunc = func(ctx context.Context, curatorID, clientID int64) ([]WeeklyReportView, error) {
			return []WeeklyReportView{
				{
					ID:              "r1",
					WeekStart:       "2026-03-02",
					WeekEnd:         "2026-03-08",
					WeekNumber:      10,
					Summary:         json.RawMessage(`{"calories":2000}`),
					SubmittedAt:     "2026-03-08T18:00:00Z",
					CuratorFeedback: &feedback,
					HasFeedback:     true,
				},
				{
					ID:          "r2",
					WeekStart:   "2026-02-23",
					WeekEnd:     "2026-03-01",
					WeekNumber:  9,
					Summary:     json.RawMessage(`{"calories":1800}`),
					SubmittedAt: "2026-03-01T18:00:00Z",
					HasFeedback: false,
				},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/42/weekly-reports", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "42"}}

		handler.GetWeeklyReports(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].([]interface{})
		assert.Len(t, data, 2)

		first := data[0].(map[string]interface{})
		assert.Equal(t, "r1", first["id"])
		assert.Equal(t, true, first["has_feedback"])

		second := data[1].(map[string]interface{})
		assert.Equal(t, "r2", second["id"])
		assert.Equal(t, false, second["has_feedback"])
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getWeeklyReportsFunc = func(ctx context.Context, curatorID, clientID int64) ([]WeeklyReportView, error) {
			return nil, errors.New("unauthorized: no active relationship")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/42/weekly-reports", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "42"}}

		handler.GetWeeklyReports(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("invalid client id returns 400", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/abc/weekly-reports", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "abc"}}

		handler.GetWeeklyReports(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/42/weekly-reports", nil)
		c.Params = gin.Params{{Key: "id", Value: "42"}}

		handler.GetWeeklyReports(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("internal server error returns 500", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getWeeklyReportsFunc = func(ctx context.Context, curatorID, clientID int64) ([]WeeklyReportView, error) {
			return nil, errors.New("database connection failed")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/clients/42/weekly-reports", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "42"}}

		handler.GetWeeklyReports(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

// ============================================================================
// GetAnalytics Handler Tests
// ============================================================================

func TestHandler_GetAnalytics(t *testing.T) {
	t.Run("success returns analytics summary", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getAnalyticsFunc = func(ctx context.Context, curatorID int64) (*AnalyticsSummary, error) {
			return &AnalyticsSummary{
				TotalClients:     5,
				AttentionClients: 2,
				AvgKBZHUPercent:  87.5,
				TotalUnread:      10,
				ClientsWaiting:   3,
				ActiveTasks:      12,
				OverdueTasks:     2,
				CompletedToday:   4,
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics", nil)
		c.Set("user_id", int64(1))

		handler.GetAnalytics(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].(map[string]interface{})
		assert.Equal(t, float64(5), data["total_clients"])
		assert.Equal(t, float64(2), data["attention_clients"])
		assert.Equal(t, 87.5, data["avg_kbzhu_percent"])
		assert.Equal(t, float64(10), data["total_unread"])
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getAnalyticsFunc = func(ctx context.Context, curatorID int64) (*AnalyticsSummary, error) {
			return nil, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics", nil)
		c.Set("user_id", int64(1))

		handler.GetAnalytics(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics", nil)

		handler.GetAnalytics(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

// ============================================================================
// GetAttentionList Handler Tests
// ============================================================================

func TestHandler_GetAttentionList(t *testing.T) {
	t.Run("success returns attention items", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getAttentionListFunc = func(ctx context.Context, curatorID int64) ([]AttentionItem, error) {
			return []AttentionItem{
				{ClientID: 1, ClientName: "Alice", Reason: AttentionReasonRedAlert, Detail: "Калории: 500 из 2000 (25%)", Priority: 1, ActionURL: "/curator/clients/1"},
				{ClientID: 2, ClientName: "Bob", Reason: AttentionReasonUnreadMessage, Detail: "Непрочитанных сообщений: 3", Priority: 4, ActionURL: "/curator/chat/2"},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/attention", nil)
		c.Set("user_id", int64(1))

		handler.GetAttentionList(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].([]interface{})
		assert.Len(t, data, 2)
		first := data[0].(map[string]interface{})
		assert.Equal(t, "red_alert", first["reason"])
		assert.Equal(t, float64(1), first["priority"])
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getAttentionListFunc = func(ctx context.Context, curatorID int64) ([]AttentionItem, error) {
			return nil, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/attention", nil)
		c.Set("user_id", int64(1))

		handler.GetAttentionList(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/attention", nil)

		handler.GetAttentionList(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

// ============================================================================
// GetAnalyticsHistory Handler Tests
// ============================================================================

func TestHandler_GetAnalyticsHistory(t *testing.T) {
	t.Run("success returns daily snapshots", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getAnalyticsHistoryFunc = func(ctx context.Context, curatorID int64, period string, count int) (interface{}, error) {
			assert.Equal(t, "daily", period)
			assert.Equal(t, 30, count)
			return []DailySnapshot{
				{Date: "2026-03-10", TotalClients: 5, AvgKBZHUPercent: 85.0},
				{Date: "2026-03-09", TotalClients: 5, AvgKBZHUPercent: 82.0},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics/history?period=daily&days=30", nil)
		c.Set("user_id", int64(1))

		handler.GetAnalyticsHistory(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].([]interface{})
		assert.Len(t, data, 2)
	})

	t.Run("defaults to weekly with 12 count", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getAnalyticsHistoryFunc = func(ctx context.Context, curatorID int64, period string, count int) (interface{}, error) {
			assert.Equal(t, "weekly", period)
			assert.Equal(t, 12, count)
			return []WeeklySnapshot{}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics/history", nil)
		c.Set("user_id", int64(1))

		handler.GetAnalyticsHistory(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("clamps invalid count to 12", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getAnalyticsHistoryFunc = func(ctx context.Context, curatorID int64, period string, count int) (interface{}, error) {
			assert.Equal(t, 12, count)
			return []DailySnapshot{}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics/history?period=daily&days=200", nil)
		c.Set("user_id", int64(1))

		handler.GetAnalyticsHistory(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getAnalyticsHistoryFunc = func(ctx context.Context, curatorID int64, period string, count int) (interface{}, error) {
			return nil, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics/history", nil)
		c.Set("user_id", int64(1))

		handler.GetAnalyticsHistory(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics/history", nil)

		handler.GetAnalyticsHistory(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

// ============================================================================
// GetBenchmark Handler Tests
// ============================================================================

func TestHandler_GetBenchmark(t *testing.T) {
	t.Run("success returns benchmark data", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getBenchmarkFunc = func(ctx context.Context, curatorID int64, weeks int) (*BenchmarkData, error) {
			assert.Equal(t, 12, weeks)
			return &BenchmarkData{
				OwnSnapshots: []WeeklySnapshot{
					{WeekStart: "2026-03-02", AvgKBZHUPercent: 85.0},
				},
				PlatformBenchmarks: []PlatformBenchmark{
					{WeekStart: "2026-03-02", AvgKBZHUPercent: 80.0, CuratorCount: 10},
				},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics/benchmark", nil)
		c.Set("user_id", int64(1))

		handler.GetBenchmark(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].(map[string]interface{})
		own := data["own_snapshots"].([]interface{})
		assert.Len(t, own, 1)
		platform := data["platform_benchmarks"].([]interface{})
		assert.Len(t, platform, 1)
	})

	t.Run("custom weeks parameter", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getBenchmarkFunc = func(ctx context.Context, curatorID int64, weeks int) (*BenchmarkData, error) {
			assert.Equal(t, 24, weeks)
			return &BenchmarkData{
				OwnSnapshots:       []WeeklySnapshot{},
				PlatformBenchmarks: []PlatformBenchmark{},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics/benchmark?weeks=24", nil)
		c.Set("user_id", int64(1))

		handler.GetBenchmark(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("clamps invalid weeks to 12", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getBenchmarkFunc = func(ctx context.Context, curatorID int64, weeks int) (*BenchmarkData, error) {
			assert.Equal(t, 12, weeks)
			return &BenchmarkData{
				OwnSnapshots:       []WeeklySnapshot{},
				PlatformBenchmarks: []PlatformBenchmark{},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics/benchmark?weeks=100", nil)
		c.Set("user_id", int64(1))

		handler.GetBenchmark(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupCuratorTestHandler()
		mock.getBenchmarkFunc = func(ctx context.Context, curatorID int64, weeks int) (*BenchmarkData, error) {
			return nil, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics/benchmark", nil)
		c.Set("user_id", int64(1))

		handler.GetBenchmark(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupCuratorTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/curator/analytics/benchmark", nil)

		handler.GetBenchmark(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}
