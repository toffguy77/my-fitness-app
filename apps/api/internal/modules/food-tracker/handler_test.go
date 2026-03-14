package foodtracker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/openrouter"
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

func (m *MockService) SearchFoods(ctx context.Context, userID int64, query string, limit int, offset int) (*SearchFoodsResponse, error) {
	args := m.Called(ctx, userID, query, limit, offset)
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

func (m *MockService) CheckRecognitionLimit(ctx context.Context, userID int64, dailyLimit int) (int, error) {
	args := m.Called(ctx, userID, dailyLimit)
	return args.Int(0), args.Error(1)
}

func (m *MockService) RecordRecognitionUsage(ctx context.Context, userID int64, photoURL string, foodsCount int) error {
	args := m.Called(ctx, userID, photoURL, foodsCount)
	return args.Error(0)
}

func (m *MockService) RecognizeFood(ctx context.Context, userID int64, imageData []byte, contentType string, s3PhotoURL string, dailyLimit int, orClient *openrouter.Client) (*AIRecognitionResponse, error) {
	args := m.Called(ctx, userID, imageData, contentType, s3PhotoURL, dailyLimit, orClient)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*AIRecognitionResponse), args.Error(1)
}

func (m *MockService) CreateUserFood(ctx context.Context, userID int64, req *CreateUserFoodRequest) (*UserFood, error) {
	args := m.Called(ctx, userID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*UserFood), args.Error(1)
}

func (m *MockService) CloneUserFood(ctx context.Context, userID int64, req *CloneUserFoodRequest) (*UserFood, error) {
	args := m.Called(ctx, userID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*UserFood), args.Error(1)
}

func (m *MockService) GetUserFoods(ctx context.Context, userID int64) ([]UserFood, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]UserFood), args.Error(1)
}

func (m *MockService) UpdateUserFood(ctx context.Context, userID int64, foodID string, req *UpdateUserFoodRequest) (*UserFood, error) {
	args := m.Called(ctx, userID, foodID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*UserFood), args.Error(1)
}

func (m *MockService) DeleteUserFood(ctx context.Context, userID int64, foodID string) error {
	args := m.Called(ctx, userID, foodID)
	return args.Error(0)
}

// ============================================================================
// Test Setup Helpers
// ============================================================================

func setupTestHandlerWithMock() (*Handler, *MockService) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		Env:                       "test",
		JWTSecret:                 "test-secret",
		FoodRecognitionDailyLimit: 20,
	}
	log := logger.New()
	mockService := new(MockService)

	handler := &Handler{
		cfg:      cfg,
		log:      log,
		service:  mockService,
		orClient: openrouter.NewClient("test-key", "", log),
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

// ============================================================================
// User Foods Handler Tests
// ============================================================================

func TestCreateUserFood(t *testing.T) {
	t.Run("successful creation", func(t *testing.T) {
		gin.SetMode(gin.TestMode)
		mockService := new(MockService)
		handler := &Handler{
			cfg:     &config.Config{},
			log:     logger.New(),
			service: mockService,
		}

		expected := &UserFood{
			ID:             uuid.New().String(),
			UserID:         1,
			Name:           "Бабушкины блины",
			CaloriesPer100: 230,
			ProteinPer100:  8.5,
			FatPer100:      10.2,
			CarbsPer100:    27.0,
			ServingSize:    100,
			ServingUnit:    "г",
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		}

		mockService.On("CreateUserFood", mock.Anything, int64(1), mock.AnythingOfType("*foodtracker.CreateUserFoodRequest")).
			Return(expected, nil)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("user_id", int64(1))
		body := `{"name":"Бабушкины блины","calories_per_100":230,"protein_per_100":8.5,"fat_per_100":10.2,"carbs_per_100":27.0}`
		c.Request = httptest.NewRequest(http.MethodPost, "/food-tracker/user-foods", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.CreateUserFood(c)

		assert.Equal(t, http.StatusCreated, w.Code)
		mockService.AssertExpectations(t)
	})

	t.Run("missing name returns 400", func(t *testing.T) {
		gin.SetMode(gin.TestMode)
		handler := &Handler{
			cfg:     &config.Config{},
			log:     logger.New(),
			service: new(MockService),
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("user_id", int64(1))
		body := `{"calories_per_100":230}`
		c.Request = httptest.NewRequest(http.MethodPost, "/food-tracker/user-foods", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.CreateUserFood(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestGetUserFoods(t *testing.T) {
	t.Run("returns user foods list", func(t *testing.T) {
		gin.SetMode(gin.TestMode)
		mockService := new(MockService)
		handler := &Handler{
			cfg:     &config.Config{},
			log:     logger.New(),
			service: mockService,
		}

		foods := []UserFood{
			{ID: uuid.New().String(), UserID: 1, Name: "Food 1", CaloriesPer100: 100, CreatedAt: time.Now(), UpdatedAt: time.Now()},
			{ID: uuid.New().String(), UserID: 1, Name: "Food 2", CaloriesPer100: 200, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		}
		mockService.On("GetUserFoods", mock.Anything, int64(1)).Return(foods, nil)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("user_id", int64(1))
		c.Request = httptest.NewRequest(http.MethodGet, "/food-tracker/user-foods", nil)

		handler.GetUserFoods(c)

		assert.Equal(t, http.StatusOK, w.Code)
		mockService.AssertExpectations(t)
	})
}

func TestDeleteUserFood(t *testing.T) {
	t.Run("successful deletion", func(t *testing.T) {
		gin.SetMode(gin.TestMode)
		mockService := new(MockService)
		handler := &Handler{
			cfg:     &config.Config{},
			log:     logger.New(),
			service: mockService,
		}

		foodID := uuid.New().String()
		mockService.On("DeleteUserFood", mock.Anything, int64(1), foodID).Return(nil)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: foodID}}
		c.Request = httptest.NewRequest(http.MethodDelete, "/food-tracker/user-foods/"+foodID, nil)

		handler.DeleteUserFood(c)

		assert.Equal(t, http.StatusOK, w.Code)
		mockService.AssertExpectations(t)
	})
}

// ============================================================================
// AI Food Recognition Handler Tests
// ============================================================================

// createMultipartRequest creates a multipart/form-data request with a photo field
func createMultipartRequest(t *testing.T, fieldName, fileName, contentType string, fileData []byte) *http.Request {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile(fieldName, fileName)
	require.NoError(t, err)

	_, err = part.Write(fileData)
	require.NoError(t, err)

	err = writer.Close()
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/food-tracker/recognize", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Override the part content type in the multipart header
	// The multipart writer sets application/octet-stream by default.
	// We need to re-create with a custom header for proper content-type testing.
	if contentType != "" {
		body2 := &bytes.Buffer{}
		writer2 := multipart.NewWriter(body2)
		h := make(map[string][]string)
		h["Content-Disposition"] = []string{fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, fileName)}
		h["Content-Type"] = []string{contentType}
		part2, err := writer2.CreatePart(h)
		require.NoError(t, err)
		_, err = part2.Write(fileData)
		require.NoError(t, err)
		err = writer2.Close()
		require.NoError(t, err)
		req = httptest.NewRequest(http.MethodPost, "/food-tracker/recognize", body2)
		req.Header.Set("Content-Type", writer2.FormDataContentType())
	}

	return req
}

func TestRecognizeFood_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	imageData := []byte("fake-image-data")

	expectedResp := &AIRecognitionResponse{
		Foods: []RecognizedFood{
			{
				Name:            "Овсянка",
				Confidence:      0.9,
				EstimatedWeight: 200,
				Nutrition:       KBZHU{Calories: 350, Protein: 12, Fat: 6, Carbs: 60},
			},
		},
		Success:               true,
		RemainingRecognitions: 19,
	}

	mockService.On("RecognizeFood", mock.Anything, int64(1), imageData, "image/jpeg", "", 20, mock.AnythingOfType("*openrouter.Client")).
		Return(expectedResp, nil)

	req := createMultipartRequest(t, "photo", "test.jpg", "image/jpeg", imageData)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("user_id", int64(1))
	c.Request = req

	handler.RecognizeFood(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "success", resp["status"])

	mockService.AssertExpectations(t)
}

func TestRecognizeFood_NoFile(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	req := httptest.NewRequest(http.MethodPost, "/food-tracker/recognize", nil)
	req.Header.Set("Content-Type", "multipart/form-data")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("user_id", int64(1))
	c.Request = req

	handler.RecognizeFood(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "error", resp["status"])
	assert.Equal(t, "Файл фото обязателен", resp["message"])
}

func TestRecognizeFood_InvalidFileType(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	req := createMultipartRequest(t, "photo", "test.txt", "text/plain", []byte("not an image"))

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("user_id", int64(1))
	c.Request = req

	handler.RecognizeFood(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "Файл должен быть изображением", resp["message"])
}

func TestRecognizeFood_LimitExceeded(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	imageData := []byte("fake-image-data")

	mockService.On("RecognizeFood", mock.Anything, int64(1), imageData, "image/jpeg", "", 20, mock.AnythingOfType("*openrouter.Client")).
		Return(nil, fmt.Errorf("лимит распознаваний исчерпан на сегодня"))

	req := createMultipartRequest(t, "photo", "test.jpg", "image/jpeg", imageData)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("user_id", int64(1))
	c.Request = req

	handler.RecognizeFood(c)

	assert.Equal(t, http.StatusTooManyRequests, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Contains(t, resp["message"], "лимит распознаваний")

	mockService.AssertExpectations(t)
}

func TestRecognizeFood_ServiceUnavailable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mockService := new(MockService)

	handler := &Handler{
		cfg:      &config.Config{FoodRecognitionDailyLimit: 20},
		log:      logger.New(),
		service:  mockService,
		orClient: nil, // No OpenRouter client configured
	}

	req := createMultipartRequest(t, "photo", "test.jpg", "image/jpeg", []byte("fake-image-data"))

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("user_id", int64(1))
	c.Request = req

	handler.RecognizeFood(c)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "Сервис распознавания еды недоступен", resp["message"])
}
