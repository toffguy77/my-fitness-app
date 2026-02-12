package foodtracker

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// Mock Service Implementation
// ============================================================================

// MockService is a mock implementation of the ServiceInterface
type MockService struct {
	mock.Mock
}

func (m *MockService) GetEntriesByDate(ctx context.Context, userID int64, date time.Time) (*GetEntriesResponse, error) {
	args := m.Called(ctx, userID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*GetEntriesResponse), args.Error(1)
}

func (m *MockService) CreateEntry(ctx context.Context, userID int64, req *CreateEntryRequest) (*FoodEntry, error) {
	args := m.Called(ctx, userID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*FoodEntry), args.Error(1)
}

func (m *MockService) UpdateEntry(ctx context.Context, userID int64, entryID string, req *UpdateEntryRequest) (*FoodEntry, error) {
	args := m.Called(ctx, userID, entryID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*FoodEntry), args.Error(1)
}

func (m *MockService) DeleteEntry(ctx context.Context, userID int64, entryID string) error {
	args := m.Called(ctx, userID, entryID)
	return args.Error(0)
}

func (m *MockService) SearchFoods(ctx context.Context, query string, limit int) (*SearchFoodsResponse, error) {
	args := m.Called(ctx, query, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*SearchFoodsResponse), args.Error(1)
}

func (m *MockService) LookupBarcode(ctx context.Context, barcode string) (*BarcodeResponse, error) {
	args := m.Called(ctx, barcode)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*BarcodeResponse), args.Error(1)
}

func (m *MockService) GetRecentFoods(ctx context.Context, userID int64, limit int) (*GetRecentFoodsResponse, error) {
	args := m.Called(ctx, userID, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*GetRecentFoodsResponse), args.Error(1)
}

func (m *MockService) GetFavoriteFoods(ctx context.Context, userID int64, limit int) (*GetFavoriteFoodsResponse, error) {
	args := m.Called(ctx, userID, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*GetFavoriteFoodsResponse), args.Error(1)
}

func (m *MockService) AddToFavorites(ctx context.Context, userID int64, foodID string) error {
	args := m.Called(ctx, userID, foodID)
	return args.Error(0)
}

func (m *MockService) RemoveFromFavorites(ctx context.Context, userID int64, foodID string) error {
	args := m.Called(ctx, userID, foodID)
	return args.Error(0)
}

func (m *MockService) GetWaterIntake(ctx context.Context, userID int64, date time.Time) (*WaterLog, error) {
	args := m.Called(ctx, userID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*WaterLog), args.Error(1)
}

func (m *MockService) AddWater(ctx context.Context, userID int64, date time.Time, glasses int) (*WaterLog, error) {
	args := m.Called(ctx, userID, date, glasses)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*WaterLog), args.Error(1)
}

func (m *MockService) GetRecommendations(ctx context.Context, userID int64) (*GetRecommendationsResponse, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*GetRecommendationsResponse), args.Error(1)
}

func (m *MockService) GetRecommendationDetail(ctx context.Context, nutrientID string, userID int64) (*NutrientDetailResponse, error) {
	args := m.Called(ctx, nutrientID, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*NutrientDetailResponse), args.Error(1)
}

func (m *MockService) UpdateNutrientPreferences(ctx context.Context, userID int64, nutrientIDs []string) error {
	args := m.Called(ctx, userID, nutrientIDs)
	return args.Error(0)
}

func (m *MockService) CreateCustomRecommendation(ctx context.Context, userID int64, req *CreateCustomRecommendationRequest) (*UserCustomRecommendation, error) {
	args := m.Called(ctx, userID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*UserCustomRecommendation), args.Error(1)
}

// ============================================================================
// Test Setup Helpers
// ============================================================================

func setupTestHandlerWithMock() (*Handler, *MockService) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		Env:       "test",
		JWTSecret: "test-secret",
	}
	log := logger.New()
	mockService := new(MockService)

	handler := &Handler{
		cfg:     cfg,
		log:     log,
		service: mockService,
	}

	return handler, mockService
}

// ============================================================================
// GetEntries Handler Tests
// **Validates: Requirements 16.4, 18.2**
// ============================================================================

func TestGetEntries_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	entryID := uuid.New().String()
	foodID := uuid.New().String()
	now := time.Now()
	_ = time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC) // Used for reference

	entries := map[MealType][]FoodEntry{
		MealBreakfast: {
			{
				ID:            entryID,
				UserID:        1,
				FoodID:        foodID,
				FoodName:      "Овсянка",
				MealType:      MealBreakfast,
				PortionType:   PortionGrams,
				PortionAmount: 100,
				Nutrition:     KBZHU{Calories: 350, Protein: 12, Fat: 6, Carbs: 60},
				Time:          "08:00",
				Date:          "2024-01-15",
				CreatedAt:     now,
				UpdatedAt:     now,
			},
		},
	}

	response := &GetEntriesResponse{
		Entries:     entries,
		DailyTotals: KBZHU{Calories: 350, Protein: 12, Fat: 6, Carbs: 60},
		TargetGoals: &KBZHU{Calories: 2000, Protein: 150, Fat: 70, Carbs: 250},
	}

	mockService.On("GetEntriesByDate", mock.Anything, int64(1), mock.MatchedBy(func(d time.Time) bool {
		return d.Year() == 2024 && d.Month() == 1 && d.Day() == 15
	})).Return(response, nil)

	router := gin.New()
	router.GET("/entries", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetEntries(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/entries?date=2024-01-15", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.Equal(t, "success", resp["status"])
	assert.NotNil(t, resp["data"])

	mockService.AssertExpectations(t)
}

func TestGetEntries_MissingDate(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/entries", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetEntries(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/entries", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.Equal(t, "error", resp["status"])
	// Error message must be in Russian
	assert.Equal(t, "Неверные параметры запроса", resp["message"])
}
