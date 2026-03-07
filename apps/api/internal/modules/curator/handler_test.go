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
	getClientsFunc      func(ctx context.Context, curatorID int64) ([]ClientCard, error)
	getClientDetailFunc func(ctx context.Context, curatorID int64, clientID int64, date string, days int) (*ClientDetail, error)
	setTargetWeightFunc func(ctx context.Context, curatorID int64, clientID int64, targetWeight *float64) error
	setWaterGoalFunc    func(ctx context.Context, curatorID int64, clientID int64, waterGoal *int) error
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
