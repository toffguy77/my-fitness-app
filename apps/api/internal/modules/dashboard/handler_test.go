package dashboard

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
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

// MockService is a mock implementation of the ServiceInterface
type MockService struct {
	mock.Mock
}

func (m *MockService) GetDailyMetrics(ctx context.Context, userID int64, date time.Time) (*DailyMetrics, error) {
	args := m.Called(ctx, userID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*DailyMetrics), args.Error(1)
}

func (m *MockService) SaveMetric(ctx context.Context, userID int64, date time.Time, metricUpdate MetricUpdate) (*DailyMetrics, error) {
	args := m.Called(ctx, userID, date, metricUpdate)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*DailyMetrics), args.Error(1)
}

func (m *MockService) GetWeekMetrics(ctx context.Context, userID int64, startDate, endDate time.Time) ([]DailyMetrics, error) {
	args := m.Called(ctx, userID, startDate, endDate)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]DailyMetrics), args.Error(1)
}

func (m *MockService) GetActivePlan(ctx context.Context, userID int64) (*WeeklyPlan, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*WeeklyPlan), args.Error(1)
}

func (m *MockService) CreatePlan(ctx context.Context, curatorID int64, clientID int64, plan *WeeklyPlan) (*WeeklyPlan, error) {
	args := m.Called(ctx, curatorID, clientID, plan)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*WeeklyPlan), args.Error(1)
}

func (m *MockService) UpdatePlan(ctx context.Context, curatorID int64, planID string, updates *WeeklyPlan) (*WeeklyPlan, error) {
	args := m.Called(ctx, curatorID, planID, updates)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*WeeklyPlan), args.Error(1)
}

func (m *MockService) GetTasksByWeek(ctx context.Context, userID int64, weekNumber int) ([]*Task, error) {
	args := m.Called(ctx, userID, weekNumber)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*Task), args.Error(1)
}

func (m *MockService) GetActiveTasks(ctx context.Context, userID int64) ([]*Task, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*Task), args.Error(1)
}

func (m *MockService) CreateTask(ctx context.Context, curatorID int64, clientID int64, task *Task) (*Task, error) {
	args := m.Called(ctx, curatorID, clientID, task)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*Task), args.Error(1)
}

func (m *MockService) UpdateTaskStatus(ctx context.Context, userID int64, taskID string, status TaskStatus) (*Task, error) {
	args := m.Called(ctx, userID, taskID, status)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*Task), args.Error(1)
}

func (m *MockService) CompleteTaskForDate(ctx context.Context, userID int64, taskID string, date string) (*Task, error) {
	args := m.Called(ctx, userID, taskID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*Task), args.Error(1)
}

func (m *MockService) AutoCompleteMatchingTasks(ctx context.Context, userID int64, taskType string, date time.Time) error {
	args := m.Called(ctx, userID, taskType, date)
	return args.Error(0)
}

func (m *MockService) GetReportFeedback(ctx context.Context, userID int64, reportID string) (*ReportFeedback, error) {
	args := m.Called(ctx, userID, reportID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*ReportFeedback), args.Error(1)
}

func (m *MockService) ValidateWeekData(ctx context.Context, userID int64, weekStart, weekEnd time.Time) (bool, []string, error) {
	args := m.Called(ctx, userID, weekStart, weekEnd)
	return args.Bool(0), args.Get(1).([]string), args.Error(2)
}

func (m *MockService) CreateWeeklyReport(ctx context.Context, userID int64, weekStart, weekEnd time.Time) (*WeeklyReport, error) {
	args := m.Called(ctx, userID, weekStart, weekEnd)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*WeeklyReport), args.Error(1)
}

func (m *MockService) ValidatePhoto(fileSize int, mimeType string) error {
	args := m.Called(fileSize, mimeType)
	return args.Error(0)
}

func (m *MockService) UploadPhoto(ctx context.Context, userID int64, weekIdentifier string, fileData io.Reader, fileSize int, mimeType string) (*PhotoData, error) {
	args := m.Called(ctx, userID, weekIdentifier, fileData, fileSize, mimeType)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*PhotoData), args.Error(1)
}

func (m *MockService) GetProgressData(ctx context.Context, userID int64, weeks int) (*ProgressData, error) {
	args := m.Called(ctx, userID, weeks)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*ProgressData), args.Error(1)
}

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

// Test GetDailyMetrics
func TestGetDailyMetrics_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	testDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	metrics := &DailyMetrics{
		ID:       uuid.New().String(),
		UserID:   1,
		Date:     testDate,
		Calories: 2000,
		Protein:  150,
		Fat:      60,
		Carbs:    200,
	}

	mockService.On("GetDailyMetrics", mock.Anything, int64(1), mock.AnythingOfType("time.Time")).Return(metrics, nil)

	router := gin.New()
	router.GET("/daily/:date", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetDailyMetrics(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/daily/2024-01-15", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

func TestGetDailyMetrics_InvalidDate(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/daily/:date", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetDailyMetrics(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/daily/invalid-date", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetDailyMetrics_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/daily/:date", handler.GetDailyMetrics)

	req := httptest.NewRequest(http.MethodGet, "/daily/2024-01-15", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Test SaveMetric
func TestSaveMetric_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	testDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	metricUpdate := MetricUpdate{
		Type: MetricUpdateTypeNutrition,
		Data: map[string]interface{}{
			"calories": float64(2000),
			"protein":  float64(150),
			"fat":      float64(60),
			"carbs":    float64(200),
		},
	}

	metrics := &DailyMetrics{
		ID:       uuid.New().String(),
		UserID:   1,
		Date:     testDate,
		Calories: 2000,
		Protein:  150,
		Fat:      60,
		Carbs:    200,
	}

	mockService.On("SaveMetric", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), metricUpdate).Return(metrics, nil)

	router := gin.New()
	router.POST("/daily", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SaveMetric(c)
	})

	reqBody := SaveMetricRequest{
		Date:   "2024-01-15",
		Metric: metricUpdate,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/daily", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

// Test GetWeekMetrics
func TestGetWeekMetrics_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	startDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	metrics := []DailyMetrics{
		{ID: uuid.New().String(), UserID: 1, Date: startDate, Calories: 2000},
		{ID: uuid.New().String(), UserID: 1, Date: startDate.AddDate(0, 0, 1), Calories: 2100},
	}

	mockService.On("GetWeekMetrics", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).Return(metrics, nil)

	router := gin.New()
	router.GET("/week", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetWeekMetrics(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/week?start=2024-01-15&end=2024-01-21", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

// Test GetWeeklyPlan
func TestGetWeeklyPlan_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	plan := &WeeklyPlan{
		ID:           uuid.New().String(),
		UserID:       1,
		CuratorID:    2,
		CaloriesGoal: 2000,
		ProteinGoal:  150,
		IsActive:     true,
	}

	mockService.On("GetActivePlan", mock.Anything, int64(1)).Return(plan, nil)

	router := gin.New()
	router.GET("/weekly-plan", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetWeeklyPlan(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/weekly-plan", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

func TestGetWeeklyPlan_NoPlan(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	mockService.On("GetActivePlan", mock.Anything, int64(1)).Return(nil, nil)

	router := gin.New()
	router.GET("/weekly-plan", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetWeeklyPlan(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/weekly-plan", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

// Test CreateWeeklyPlan
func TestCreateWeeklyPlan_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	startDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(2024, 1, 21, 0, 0, 0, 0, time.UTC)

	plan := &WeeklyPlan{
		ID:           uuid.New().String(),
		UserID:       1,
		CuratorID:    2,
		CaloriesGoal: 2000,
		ProteinGoal:  150,
		StartDate:    startDate,
		EndDate:      endDate,
		IsActive:     true,
	}

	mockService.On("CreatePlan", mock.Anything, int64(2), int64(1), mock.AnythingOfType("*dashboard.WeeklyPlan")).Return(plan, nil)

	router := gin.New()
	router.POST("/weekly-plan", func(c *gin.Context) {
		c.Set("user_id", int64(2))
		c.Set("user_role", "curator")
		handler.CreateWeeklyPlan(c)
	})

	reqBody := CreateWeeklyPlanRequest{
		UserID:       1,
		CaloriesGoal: 2000,
		ProteinGoal:  150,
		StartDate:    startDate,
		EndDate:      endDate,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-plan", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	mockService.AssertExpectations(t)
}

func TestCreateWeeklyPlan_NotCurator(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/weekly-plan", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		c.Set("user_role", "client")
		handler.CreateWeeklyPlan(c)
	})

	reqBody := CreateWeeklyPlanRequest{
		UserID:       1,
		CaloriesGoal: 2000,
		ProteinGoal:  150,
		StartDate:    time.Now(),
		EndDate:      time.Now().AddDate(0, 0, 7),
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-plan", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

// Test GetTasks
func TestGetTasks_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	tasks := []*Task{
		{
			ID:         uuid.New().String(),
			UserID:     1,
			CuratorID:  2,
			Title:      "Test Task",
			WeekNumber: 1,
			Status:     TaskStatusActive,
		},
	}

	mockService.On("GetActiveTasks", mock.Anything, int64(1)).Return(tasks, nil)

	router := gin.New()
	router.GET("/tasks", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetTasks(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/tasks", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

// Test CreateTask
func TestCreateTask_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	task := &Task{
		ID:         uuid.New().String(),
		UserID:     1,
		CuratorID:  2,
		Title:      "Test Task",
		WeekNumber: 1,
		DueDate:    time.Now().AddDate(0, 0, 7),
		Status:     TaskStatusActive,
	}

	mockService.On("CreateTask", mock.Anything, int64(2), int64(1), mock.AnythingOfType("*dashboard.Task")).Return(task, nil)

	router := gin.New()
	router.POST("/tasks", func(c *gin.Context) {
		c.Set("user_id", int64(2))
		c.Set("user_role", "curator")
		handler.CreateTask(c)
	})

	reqBody := CreateTaskRequest{
		UserID:     1,
		Title:      "Test Task",
		WeekNumber: 1,
		DueDate:    time.Now().AddDate(0, 0, 7),
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/tasks", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	mockService.AssertExpectations(t)
}

func TestCreateTask_NotCurator(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/tasks", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		c.Set("user_role", "client")
		handler.CreateTask(c)
	})

	reqBody := CreateTaskRequest{
		UserID:     1,
		Title:      "Test Task",
		WeekNumber: 1,
		DueDate:    time.Now().AddDate(0, 0, 7),
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/tasks", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

// Test UpdateTaskStatus
func TestUpdateTaskStatus_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	taskID := uuid.New().String()
	task := &Task{
		ID:          taskID,
		UserID:      1,
		CuratorID:   2,
		Title:       "Test Task",
		WeekNumber:  1,
		Status:      TaskStatusCompleted,
		CompletedAt: &time.Time{},
	}

	mockService.On("UpdateTaskStatus", mock.Anything, int64(1), taskID, TaskStatusCompleted).Return(task, nil)

	router := gin.New()
	router.PATCH("/tasks/:id", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.UpdateTaskStatus(c)
	})

	reqBody := UpdateTaskStatusRequest{
		Status: TaskStatusCompleted,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/tasks/%s", taskID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

// Test SubmitWeeklyReport
func TestSubmitWeeklyReport_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	weekStart := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	weekEnd := time.Date(2024, 1, 21, 0, 0, 0, 0, time.UTC)

	report := &WeeklyReport{
		ID:        uuid.New().String(),
		UserID:    1,
		CuratorID: 2,
		WeekStart: weekStart,
		WeekEnd:   weekEnd,
	}

	mockService.On("ValidateWeekData", mock.Anything, int64(1), weekStart, weekEnd).Return(true, []string{}, nil)
	mockService.On("CreateWeeklyReport", mock.Anything, int64(1), weekStart, weekEnd).Return(report, nil)

	router := gin.New()
	router.POST("/weekly-report", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SubmitWeeklyReport(c)
	})

	reqBody := SubmitWeeklyReportRequest{
		WeekStart: weekStart,
		WeekEnd:   weekEnd,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-report", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	mockService.AssertExpectations(t)
}

func TestSubmitWeeklyReport_ValidationFailed(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	weekStart := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	weekEnd := time.Date(2024, 1, 21, 0, 0, 0, 0, time.UTC)

	validationErrors := []string{"nutrition logged for only 3 days (minimum 5 required)"}
	mockService.On("ValidateWeekData", mock.Anything, int64(1), weekStart, weekEnd).Return(false, validationErrors, nil)

	router := gin.New()
	router.POST("/weekly-report", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SubmitWeeklyReport(c)
	})

	reqBody := SubmitWeeklyReportRequest{
		WeekStart: weekStart,
		WeekEnd:   weekEnd,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-report", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	mockService.AssertExpectations(t)
}

// Test UploadPhoto
func TestUploadPhoto_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	photo := &PhotoData{
		ID:             uuid.New().String(),
		UserID:         1,
		WeekIdentifier: "2024-W03",
		PhotoURL:       "https://storage.example.com/photo.jpg",
		FileSize:       15,
		MimeType:       "application/octet-stream",
	}

	mockService.On("ValidatePhoto", mock.AnythingOfType("int"), mock.AnythingOfType("string")).Return(nil)
	mockService.On("UploadPhoto", mock.Anything, int64(1), "2024-W03", mock.Anything, mock.AnythingOfType("int"), mock.AnythingOfType("string")).Return(photo, nil)

	router := gin.New()
	router.POST("/photo-upload", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.UploadPhoto(c)
	})

	// Create multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("week_identifier", "2024-W03")

	part, err := writer.CreateFormFile("photo", "test.jpg")
	require.NoError(t, err)
	part.Write([]byte("fake image data"))
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/photo-upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	mockService.AssertExpectations(t)
}

func TestUploadPhoto_ValidationFailed(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	mockService.On("ValidatePhoto", mock.AnythingOfType("int"), mock.AnythingOfType("string")).Return(fmt.Errorf("file size must be 10MB or less"))

	router := gin.New()
	router.POST("/photo-upload", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.UploadPhoto(c)
	})

	// Create multipart form with large file
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("week_identifier", "2024-W03")

	part, err := writer.CreateFormFile("photo", "test.jpg")
	require.NoError(t, err)
	part.Write(make([]byte, 11*1024*1024)) // 11MB
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/photo-upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	mockService.AssertExpectations(t)
}

func TestUploadPhoto_MissingWeekIdentifier(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/photo-upload", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.UploadPhoto(c)
	})

	// Create multipart form without week_identifier
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("photo", "test.jpg")
	require.NoError(t, err)
	part.Write([]byte("fake image data"))
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/photo-upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// Additional comprehensive tests for authentication, authorization, and validation

// Test SaveMetric - Invalid Request Body
func TestSaveMetric_InvalidRequestBody(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/daily", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SaveMetric(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/daily", bytes.NewBuffer([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestSaveMetric_InvalidDateFormat(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/daily", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SaveMetric(c)
	})

	reqBody := SaveMetricRequest{
		Date: "invalid-date",
		Metric: MetricUpdate{
			Type: MetricUpdateTypeNutrition,
			Data: map[string]interface{}{"calories": float64(2000)},
		},
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/daily", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestSaveMetric_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/daily", handler.SaveMetric)

	reqBody := SaveMetricRequest{
		Date: "2024-01-15",
		Metric: MetricUpdate{
			Type: MetricUpdateTypeNutrition,
			Data: map[string]interface{}{"calories": float64(2000)},
		},
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/daily", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Test GetWeekMetrics - Invalid Query Parameters
func TestGetWeekMetrics_MissingQueryParams(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/week", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetWeekMetrics(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/week", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetWeekMetrics_InvalidDateRange(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/week", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetWeekMetrics(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/week?start=2024-01-21&end=2024-01-15", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetWeekMetrics_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/week", handler.GetWeekMetrics)

	req := httptest.NewRequest(http.MethodGet, "/week?start=2024-01-15&end=2024-01-21", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Test GetWeeklyPlan - Unauthorized
func TestGetWeeklyPlan_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/weekly-plan", handler.GetWeeklyPlan)

	req := httptest.NewRequest(http.MethodGet, "/weekly-plan", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Test CreateWeeklyPlan - Invalid Request Body
func TestCreateWeeklyPlan_InvalidRequestBody(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/weekly-plan", func(c *gin.Context) {
		c.Set("user_id", int64(2))
		c.Set("user_role", "curator")
		handler.CreateWeeklyPlan(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/weekly-plan", bytes.NewBuffer([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateWeeklyPlan_InvalidDateRange(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/weekly-plan", func(c *gin.Context) {
		c.Set("user_id", int64(2))
		c.Set("user_role", "curator")
		handler.CreateWeeklyPlan(c)
	})

	startDate := time.Date(2024, 1, 21, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

	reqBody := CreateWeeklyPlanRequest{
		UserID:       1,
		CaloriesGoal: 2000,
		ProteinGoal:  150,
		StartDate:    startDate,
		EndDate:      endDate,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-plan", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateWeeklyPlan_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/weekly-plan", handler.CreateWeeklyPlan)

	reqBody := CreateWeeklyPlanRequest{
		UserID:       1,
		CaloriesGoal: 2000,
		ProteinGoal:  150,
		StartDate:    time.Now(),
		EndDate:      time.Now().AddDate(0, 0, 7),
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-plan", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Test GetTasks - Unauthorized
func TestGetTasks_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/tasks", handler.GetTasks)

	req := httptest.NewRequest(http.MethodGet, "/tasks", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Test CreateTask - Invalid Request Body
func TestCreateTask_InvalidRequestBody(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/tasks", func(c *gin.Context) {
		c.Set("user_id", int64(2))
		c.Set("user_role", "curator")
		handler.CreateTask(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/tasks", bytes.NewBuffer([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateTask_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/tasks", handler.CreateTask)

	reqBody := CreateTaskRequest{
		UserID:     1,
		Title:      "Test Task",
		WeekNumber: 1,
		DueDate:    time.Now().AddDate(0, 0, 7),
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/tasks", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Test UpdateTaskStatus - Missing Task ID
func TestUpdateTaskStatus_MissingTaskID(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.PATCH("/tasks/:id", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.UpdateTaskStatus(c)
	})

	reqBody := UpdateTaskStatusRequest{
		Status: TaskStatusCompleted,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPatch, "/tasks/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestUpdateTaskStatus_InvalidRequestBody(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	taskID := uuid.New().String()

	router := gin.New()
	router.PATCH("/tasks/:id", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.UpdateTaskStatus(c)
	})

	req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/tasks/%s", taskID), bytes.NewBuffer([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestUpdateTaskStatus_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	taskID := uuid.New().String()

	router := gin.New()
	router.PATCH("/tasks/:id", handler.UpdateTaskStatus)

	reqBody := UpdateTaskStatusRequest{
		Status: TaskStatusCompleted,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/tasks/%s", taskID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Test SubmitWeeklyReport - Invalid Request Body
func TestSubmitWeeklyReport_InvalidRequestBody(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/weekly-report", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SubmitWeeklyReport(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/weekly-report", bytes.NewBuffer([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestSubmitWeeklyReport_InvalidDateRange(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/weekly-report", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SubmitWeeklyReport(c)
	})

	weekStart := time.Date(2024, 1, 21, 0, 0, 0, 0, time.UTC)
	weekEnd := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

	reqBody := SubmitWeeklyReportRequest{
		WeekStart: weekStart,
		WeekEnd:   weekEnd,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-report", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestSubmitWeeklyReport_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/weekly-report", handler.SubmitWeeklyReport)

	weekStart := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	weekEnd := time.Date(2024, 1, 21, 0, 0, 0, 0, time.UTC)

	reqBody := SubmitWeeklyReportRequest{
		WeekStart: weekStart,
		WeekEnd:   weekEnd,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-report", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Test UploadPhoto - Missing Photo File
func TestUploadPhoto_MissingPhotoFile(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/photo-upload", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.UploadPhoto(c)
	})

	// Create multipart form without photo file
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("week_identifier", "2024-W03")
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/photo-upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestUploadPhoto_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/photo-upload", handler.UploadPhoto)

	// Create multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("week_identifier", "2024-W03")

	part, err := writer.CreateFormFile("photo", "test.jpg")
	require.NoError(t, err)
	part.Write([]byte("fake image data"))
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/photo-upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Test service error handling
func TestGetDailyMetrics_ServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	mockService.On("GetDailyMetrics", mock.Anything, int64(1), mock.AnythingOfType("time.Time")).Return(nil, fmt.Errorf("database error"))

	router := gin.New()
	router.GET("/daily/:date", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetDailyMetrics(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/daily/2024-01-15", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	mockService.AssertExpectations(t)
}

func TestSaveMetric_ServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	metricUpdate := MetricUpdate{
		Type: MetricUpdateTypeNutrition,
		Data: map[string]interface{}{"calories": float64(2000)},
	}

	mockService.On("SaveMetric", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), metricUpdate).Return(nil, fmt.Errorf("validation error"))

	router := gin.New()
	router.POST("/daily", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SaveMetric(c)
	})

	reqBody := SaveMetricRequest{
		Date:   "2024-01-15",
		Metric: metricUpdate,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/daily", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	mockService.AssertExpectations(t)
}

func TestGetWeekMetrics_ServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	mockService.On("GetWeekMetrics", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).Return(nil, fmt.Errorf("database error"))

	router := gin.New()
	router.GET("/week", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetWeekMetrics(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/week?start=2024-01-15&end=2024-01-21", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	mockService.AssertExpectations(t)
}

func TestGetWeeklyPlan_ServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	mockService.On("GetActivePlan", mock.Anything, int64(1)).Return(nil, fmt.Errorf("database error"))

	router := gin.New()
	router.GET("/weekly-plan", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetWeeklyPlan(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/weekly-plan", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	mockService.AssertExpectations(t)
}

func TestCreateWeeklyPlan_ServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	startDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(2024, 1, 21, 0, 0, 0, 0, time.UTC)

	mockService.On("CreatePlan", mock.Anything, int64(2), int64(1), mock.AnythingOfType("*dashboard.WeeklyPlan")).Return(nil, fmt.Errorf("curator not authorized"))

	router := gin.New()
	router.POST("/weekly-plan", func(c *gin.Context) {
		c.Set("user_id", int64(2))
		c.Set("user_role", "curator")
		handler.CreateWeeklyPlan(c)
	})

	reqBody := CreateWeeklyPlanRequest{
		UserID:       1,
		CaloriesGoal: 2000,
		ProteinGoal:  150,
		StartDate:    startDate,
		EndDate:      endDate,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-plan", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	mockService.AssertExpectations(t)
}

func TestGetTasks_ServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	mockService.On("GetActiveTasks", mock.Anything, int64(1)).Return(nil, fmt.Errorf("database error"))

	router := gin.New()
	router.GET("/tasks", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetTasks(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/tasks", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	mockService.AssertExpectations(t)
}

func TestCreateTask_ServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	mockService.On("CreateTask", mock.Anything, int64(2), int64(1), mock.AnythingOfType("*dashboard.Task")).Return(nil, fmt.Errorf("curator not authorized"))

	router := gin.New()
	router.POST("/tasks", func(c *gin.Context) {
		c.Set("user_id", int64(2))
		c.Set("user_role", "curator")
		handler.CreateTask(c)
	})

	reqBody := CreateTaskRequest{
		UserID:     1,
		Title:      "Test Task",
		WeekNumber: 1,
		DueDate:    time.Now().AddDate(0, 0, 7),
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/tasks", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	mockService.AssertExpectations(t)
}

func TestUpdateTaskStatus_ServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	taskID := uuid.New().String()
	mockService.On("UpdateTaskStatus", mock.Anything, int64(1), taskID, TaskStatusCompleted).Return(nil, fmt.Errorf("task not found"))

	router := gin.New()
	router.PATCH("/tasks/:id", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.UpdateTaskStatus(c)
	})

	reqBody := UpdateTaskStatusRequest{
		Status: TaskStatusCompleted,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/tasks/%s", taskID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	mockService.AssertExpectations(t)
}

func TestSubmitWeeklyReport_ValidationServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	weekStart := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	weekEnd := time.Date(2024, 1, 21, 0, 0, 0, 0, time.UTC)

	mockService.On("ValidateWeekData", mock.Anything, int64(1), weekStart, weekEnd).Return(false, []string{}, fmt.Errorf("database error"))

	router := gin.New()
	router.POST("/weekly-report", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SubmitWeeklyReport(c)
	})

	reqBody := SubmitWeeklyReportRequest{
		WeekStart: weekStart,
		WeekEnd:   weekEnd,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-report", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	mockService.AssertExpectations(t)
}

func TestSubmitWeeklyReport_CreateServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	weekStart := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	weekEnd := time.Date(2024, 1, 21, 0, 0, 0, 0, time.UTC)

	mockService.On("ValidateWeekData", mock.Anything, int64(1), weekStart, weekEnd).Return(true, []string{}, nil)
	mockService.On("CreateWeeklyReport", mock.Anything, int64(1), weekStart, weekEnd).Return(nil, fmt.Errorf("report already exists"))

	router := gin.New()
	router.POST("/weekly-report", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SubmitWeeklyReport(c)
	})

	reqBody := SubmitWeeklyReportRequest{
		WeekStart: weekStart,
		WeekEnd:   weekEnd,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/weekly-report", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	mockService.AssertExpectations(t)
}

func TestUploadPhoto_ServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	mockService.On("ValidatePhoto", mock.AnythingOfType("int"), mock.AnythingOfType("string")).Return(nil)
	mockService.On("UploadPhoto", mock.Anything, int64(1), "2024-W03", mock.Anything, mock.AnythingOfType("int"), mock.AnythingOfType("string")).Return(nil, fmt.Errorf("S3 upload failed"))

	router := gin.New()
	router.POST("/photo-upload", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.UploadPhoto(c)
	})

	// Create multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("week_identifier", "2024-W03")

	part, err := writer.CreateFormFile("photo", "test.jpg")
	require.NoError(t, err)
	part.Write([]byte("fake image data"))
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/photo-upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	mockService.AssertExpectations(t)
}

// ===== Bidirectional Sync Tests =====

// --- metricTypeToTaskType ---

func TestMetricTypeToTaskType(t *testing.T) {
	tests := []struct {
		metric   MetricUpdateType
		expected string
	}{
		{MetricUpdateTypeWorkout, "workout"},
		{MetricUpdateTypeWeight, "measurement"},
		{MetricUpdateTypeNutrition, ""},
		{MetricUpdateTypeSteps, ""},
	}
	for _, tt := range tests {
		t.Run(string(tt.metric), func(t *testing.T) {
			assert.Equal(t, tt.expected, metricTypeToTaskType(tt.metric))
		})
	}
}

// --- SaveMetric with auto-complete ---

func TestSaveMetric_WorkoutTriggersAutoComplete(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	testDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	metricUpdate := MetricUpdate{
		Type: MetricUpdateTypeWorkout,
		Data: map[string]interface{}{
			"completed": true,
			"type":      "Силовая",
		},
	}

	metrics := &DailyMetrics{
		ID:               uuid.New().String(),
		UserID:           1,
		Date:             testDate,
		WorkoutCompleted: true,
	}

	mockService.On("SaveMetric", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), metricUpdate).Return(metrics, nil)
	mockService.On("AutoCompleteMatchingTasks", mock.Anything, int64(1), "workout", mock.AnythingOfType("time.Time")).Return(nil)

	router := gin.New()
	router.POST("/daily", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SaveMetric(c)
	})

	reqBody := SaveMetricRequest{Date: "2024-01-15", Metric: metricUpdate}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/daily", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
	mockService.AssertCalled(t, "AutoCompleteMatchingTasks", mock.Anything, int64(1), "workout", mock.AnythingOfType("time.Time"))
}

func TestSaveMetric_WeightTriggersAutoComplete(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	testDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	weight := 75.5
	metricUpdate := MetricUpdate{
		Type: MetricUpdateTypeWeight,
		Data: map[string]interface{}{
			"weight": weight,
		},
	}

	metrics := &DailyMetrics{
		ID:     uuid.New().String(),
		UserID: 1,
		Date:   testDate,
		Weight: &weight,
	}

	mockService.On("SaveMetric", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), metricUpdate).Return(metrics, nil)
	mockService.On("AutoCompleteMatchingTasks", mock.Anything, int64(1), "measurement", mock.AnythingOfType("time.Time")).Return(nil)

	router := gin.New()
	router.POST("/daily", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SaveMetric(c)
	})

	reqBody := SaveMetricRequest{Date: "2024-01-15", Metric: metricUpdate}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/daily", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
	mockService.AssertCalled(t, "AutoCompleteMatchingTasks", mock.Anything, int64(1), "measurement", mock.AnythingOfType("time.Time"))
}

func TestSaveMetric_NutritionDoesNotTriggerAutoComplete(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	testDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	metricUpdate := MetricUpdate{
		Type: MetricUpdateTypeNutrition,
		Data: map[string]interface{}{
			"calories": float64(2000),
			"protein":  float64(150),
			"fat":      float64(60),
			"carbs":    float64(200),
		},
	}

	metrics := &DailyMetrics{
		ID:       uuid.New().String(),
		UserID:   1,
		Date:     testDate,
		Calories: 2000,
	}

	mockService.On("SaveMetric", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), metricUpdate).Return(metrics, nil)

	router := gin.New()
	router.POST("/daily", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SaveMetric(c)
	})

	reqBody := SaveMetricRequest{Date: "2024-01-15", Metric: metricUpdate}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/daily", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertNotCalled(t, "AutoCompleteMatchingTasks", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestSaveMetric_AutoCompleteErrorDoesNotFailRequest(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	testDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	metricUpdate := MetricUpdate{
		Type: MetricUpdateTypeWorkout,
		Data: map[string]interface{}{
			"completed": true,
			"type":      "Бег",
		},
	}

	metrics := &DailyMetrics{
		ID:               uuid.New().String(),
		UserID:           1,
		Date:             testDate,
		WorkoutCompleted: true,
	}

	mockService.On("SaveMetric", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), metricUpdate).Return(metrics, nil)
	mockService.On("AutoCompleteMatchingTasks", mock.Anything, int64(1), "workout", mock.AnythingOfType("time.Time")).Return(fmt.Errorf("db connection lost"))

	router := gin.New()
	router.POST("/daily", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.SaveMetric(c)
	})

	reqBody := SaveMetricRequest{Date: "2024-01-15", Metric: metricUpdate}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/daily", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

// --- CompleteTaskForDate ---

func TestCompleteTaskForDate_BasicCompletion(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	task := &Task{
		ID:         "task-123",
		UserID:     1,
		Type:       "habit",
		Title:      "Drink water",
		Status:     TaskStatusActive,
		Recurrence: "daily",
	}

	mockService.On("CompleteTaskForDate", mock.Anything, int64(1), "task-123", mock.AnythingOfType("string")).Return(task, nil)

	router := gin.New()
	router.POST("/tasks/:id/complete", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.CompleteTaskForDate(c)
	})

	body, _ := json.Marshal(map[string]string{"date": "2024-01-15"})
	req := httptest.NewRequest(http.MethodPost, "/tasks/task-123/complete", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	data, ok := resp["data"].(map[string]interface{})
	require.True(t, ok, "response should have data field")

	assert.NotNil(t, data["task"])
	assert.Equal(t, false, data["metric_synced"])

	mockService.AssertExpectations(t)
}

func TestCompleteTaskForDate_WorkoutWithData(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	workoutType := "Силовая"
	task := &Task{
		ID:         "task-456",
		UserID:     1,
		Type:       "workout",
		Title:      "Morning workout",
		Status:     TaskStatusActive,
		Recurrence: "weekly",
	}

	metrics := &DailyMetrics{
		ID:               uuid.New().String(),
		UserID:           1,
		WorkoutCompleted: true,
		WorkoutType:      &workoutType,
	}

	mockService.On("CompleteTaskForDate", mock.Anything, int64(1), "task-456", "2024-01-15").Return(task, nil)
	mockService.On("SaveMetric", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), mock.MatchedBy(func(mu MetricUpdate) bool {
		if mu.Type != MetricUpdateTypeWorkout {
			return false
		}
		data, ok := mu.Data.(map[string]interface{})
		if !ok {
			return false
		}
		return data["completed"] == true && data["type"] == "Силовая"
	})).Return(metrics, nil)

	router := gin.New()
	router.POST("/tasks/:id/complete", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.CompleteTaskForDate(c)
	})

	reqBody := map[string]interface{}{
		"date":         "2024-01-15",
		"workout_type": "Силовая",
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/tasks/task-456/complete", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	data := resp["data"].(map[string]interface{})
	assert.Equal(t, true, data["metric_synced"])

	mockService.AssertExpectations(t)
}

func TestCompleteTaskForDate_WorkoutWithDuration(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	workoutType := "HIIT"
	dur := 45
	task := &Task{
		ID:         "task-789",
		UserID:     1,
		Type:       "workout",
		Title:      "HIIT session",
		Status:     TaskStatusActive,
		Recurrence: "once",
	}

	metrics := &DailyMetrics{
		ID:               uuid.New().String(),
		UserID:           1,
		WorkoutCompleted: true,
		WorkoutType:      &workoutType,
		WorkoutDuration:  &dur,
	}

	mockService.On("CompleteTaskForDate", mock.Anything, int64(1), "task-789", "2024-01-15").Return(task, nil)
	mockService.On("SaveMetric", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), mock.MatchedBy(func(mu MetricUpdate) bool {
		data, ok := mu.Data.(map[string]interface{})
		if !ok {
			return false
		}
		return data["completed"] == true && data["type"] == "HIIT" && data["duration"] == float64(45)
	})).Return(metrics, nil)

	router := gin.New()
	router.POST("/tasks/:id/complete", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.CompleteTaskForDate(c)
	})

	reqBody := map[string]interface{}{
		"date":             "2024-01-15",
		"workout_type":     "HIIT",
		"workout_duration": 45,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/tasks/task-789/complete", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, true, data["metric_synced"])

	mockService.AssertExpectations(t)
}

func TestCompleteTaskForDate_NonWorkoutTaskIgnoresWorkoutData(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	task := &Task{
		ID:         "task-nutrition",
		UserID:     1,
		Type:       "nutrition",
		Title:      "Log meals",
		Status:     TaskStatusActive,
		Recurrence: "daily",
	}

	mockService.On("CompleteTaskForDate", mock.Anything, int64(1), "task-nutrition", "2024-01-15").Return(task, nil)

	router := gin.New()
	router.POST("/tasks/:id/complete", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.CompleteTaskForDate(c)
	})

	reqBody := map[string]interface{}{
		"date":         "2024-01-15",
		"workout_type": "Силовая",
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/tasks/task-nutrition/complete", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, false, data["metric_synced"])

	mockService.AssertNotCalled(t, "SaveMetric", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	mockService.AssertExpectations(t)
}

func TestCompleteTaskForDate_WorkoutSaveMetricFailure(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	task := &Task{
		ID:         "task-fail",
		UserID:     1,
		Type:       "workout",
		Title:      "Workout",
		Status:     TaskStatusActive,
		Recurrence: "once",
	}

	mockService.On("CompleteTaskForDate", mock.Anything, int64(1), "task-fail", "2024-01-15").Return(task, nil)
	mockService.On("SaveMetric", mock.Anything, int64(1), mock.AnythingOfType("time.Time"), mock.Anything).Return(nil, fmt.Errorf("save failed"))

	router := gin.New()
	router.POST("/tasks/:id/complete", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.CompleteTaskForDate(c)
	})

	reqBody := map[string]interface{}{
		"date":         "2024-01-15",
		"workout_type": "Йога",
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/tasks/task-fail/complete", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, false, data["metric_synced"])

	mockService.AssertExpectations(t)
}

func TestCompleteTaskForDate_DefaultsToToday(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	today := time.Now().Format("2006-01-02")
	task := &Task{
		ID:         "task-today",
		UserID:     1,
		Type:       "habit",
		Title:      "Daily check",
		Status:     TaskStatusActive,
		Recurrence: "daily",
	}

	mockService.On("CompleteTaskForDate", mock.Anything, int64(1), "task-today", today).Return(task, nil)

	router := gin.New()
	router.POST("/tasks/:id/complete", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.CompleteTaskForDate(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/tasks/task-today/complete", bytes.NewBuffer([]byte("{}")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

func TestCompleteTaskForDate_ServiceError(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	mockService.On("CompleteTaskForDate", mock.Anything, int64(1), "task-err", "2024-01-15").Return(nil, fmt.Errorf("задача уже выполнена за 2024-01-15"))

	router := gin.New()
	router.POST("/tasks/:id/complete", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.CompleteTaskForDate(c)
	})

	body, _ := json.Marshal(map[string]string{"date": "2024-01-15"})
	req := httptest.NewRequest(http.MethodPost, "/tasks/task-err/complete", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	mockService.AssertExpectations(t)
}

func TestCompleteTaskForDate_Unauthorized(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/tasks/:id/complete", handler.CompleteTaskForDate)

	body, _ := json.Marshal(map[string]string{"date": "2024-01-15"})
	req := httptest.NewRequest(http.MethodPost, "/tasks/task-123/complete", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
