package dashboard

import (
	"context"
	"io"
	"net/http"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/gin-gonic/gin"
)

// ServiceInterface defines the interface for dashboard service operations
type ServiceInterface interface {
	GetDailyMetrics(ctx context.Context, userID int64, date time.Time) (*DailyMetrics, error)
	SaveMetric(ctx context.Context, userID int64, date time.Time, metricUpdate MetricUpdate) (*DailyMetrics, error)
	GetWeekMetrics(ctx context.Context, userID int64, startDate, endDate time.Time) ([]DailyMetrics, error)
	GetActivePlan(ctx context.Context, userID int64) (*WeeklyPlan, error)
	CreatePlan(ctx context.Context, curatorID int64, clientID int64, plan *WeeklyPlan) (*WeeklyPlan, error)
	UpdatePlan(ctx context.Context, curatorID int64, planID string, updates *WeeklyPlan) (*WeeklyPlan, error)
	GetTasksByWeek(ctx context.Context, userID int64, weekNumber int) ([]*Task, error)
	CreateTask(ctx context.Context, curatorID int64, clientID int64, task *Task) (*Task, error)
	UpdateTaskStatus(ctx context.Context, userID int64, taskID string, status TaskStatus) (*Task, error)
	ValidateWeekData(ctx context.Context, userID int64, weekStart, weekEnd time.Time) (bool, []string, error)
	CreateWeeklyReport(ctx context.Context, userID int64, weekStart, weekEnd time.Time) (*WeeklyReport, error)
	ValidatePhoto(fileSize int, mimeType string) error
	UploadPhoto(ctx context.Context, userID int64, weekIdentifier string, fileData io.Reader, fileSize int, mimeType string) (*PhotoData, error)
}

// Handler handles dashboard requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service ServiceInterface
}

// NewHandler creates a new dashboard handler
func NewHandler(cfg *config.Config, log *logger.Logger, db *database.DB, s3Client *storage.S3Client, notificationsSvc *notifications.Service) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: NewService(db, log, s3Client, notificationsSvc),
	}
}

// GetDailyMetricsRequest represents the request to get daily metrics
type GetDailyMetricsRequest struct {
	Date string `form:"date" binding:"required"` // ISO date string
}

// SaveMetricRequest represents the request to save a metric
type SaveMetricRequest struct {
	Date   string       `json:"date" binding:"required"`
	Metric MetricUpdate `json:"metric" binding:"required"`
}

// GetWeekMetricsRequest represents the request to get week metrics
type GetWeekMetricsRequest struct {
	Start string `form:"start" binding:"required"` // ISO date string
	End   string `form:"end" binding:"required"`   // ISO date string
}

// GetDailyMetrics handles GET /api/dashboard/daily/:date
// Retrieves daily metrics for a specific date
func (h *Handler) GetDailyMetrics(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Get date from URL parameter
	dateStr := c.Param("date")
	if dateStr == "" {
		response.Error(c, http.StatusBadRequest, "Дата обязательна")
		return
	}

	// Parse date
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		h.log.Errorw("Invalid date format", "error", err, "date", dateStr)
		response.Error(c, http.StatusBadRequest, "Неверный формат даты. Используйте YYYY-MM-DD")
		return
	}

	// Call service to get daily metrics
	metrics, err := h.service.GetDailyMetrics(c.Request.Context(), userID, date)
	if err != nil {
		h.log.Errorw("Failed to get daily metrics", "error", err, "user_id", userID, "date", date)
		response.InternalError(c, "Не удалось получить дневные метрики")
		return
	}

	response.Success(c, http.StatusOK, metrics)
}

// SaveMetric handles POST /api/dashboard/daily
// Creates or updates daily metrics
func (h *Handler) SaveMetric(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Bind and validate request body
	var req SaveMetricRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Errorw("Неверные данные запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Parse date
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		h.log.Errorw("Invalid date format", "error", err, "date", req.Date)
		response.Error(c, http.StatusBadRequest, "Неверный формат даты. Используйте YYYY-MM-DD")
		return
	}

	// Call service to save metric
	metrics, err := h.service.SaveMetric(c.Request.Context(), userID, date, req.Metric)
	if err != nil {
		h.log.Errorw("Failed to save metric", "error", err, "user_id", userID, "date", date)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(c, http.StatusOK, metrics)
}

// GetWeekMetrics handles GET /api/dashboard/week
// Retrieves daily metrics for a week range
func (h *Handler) GetWeekMetrics(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Bind and validate query parameters
	var req GetWeekMetricsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		h.log.Errorw("Неверные параметры запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные параметры запроса")
		return
	}

	// Parse dates
	startDate, err := time.Parse("2006-01-02", req.Start)
	if err != nil {
		h.log.Errorw("Invalid start date format", "error", err, "start", req.Start)
		response.Error(c, http.StatusBadRequest, "Неверный формат даты начала. Используйте YYYY-MM-DD")
		return
	}

	endDate, err := time.Parse("2006-01-02", req.End)
	if err != nil {
		h.log.Errorw("Invalid end date format", "error", err, "end", req.End)
		response.Error(c, http.StatusBadRequest, "Неверный формат даты окончания. Используйте YYYY-MM-DD")
		return
	}

	// Validate date range
	if endDate.Before(startDate) {
		response.Error(c, http.StatusBadRequest, "Дата окончания должна быть не раньше даты начала")
		return
	}

	// Call service to get week metrics
	metrics, err := h.service.GetWeekMetrics(c.Request.Context(), userID, startDate, endDate)
	if err != nil {
		h.log.Errorw("Failed to get week metrics", "error", err, "user_id", userID, "start", startDate, "end", endDate)
		response.InternalError(c, "Не удалось получить недельные метрики")
		return
	}

	response.Success(c, http.StatusOK, gin.H{
		"metrics": metrics,
		"count":   len(metrics),
	})
}

// GetWeeklyPlan handles GET /api/dashboard/weekly-plan
// Retrieves the active weekly plan for the authenticated user
func (h *Handler) GetWeeklyPlan(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Call service to get active plan
	plan, err := h.service.GetActivePlan(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Failed to get weekly plan", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить недельный план")
		return
	}

	// Return null if no active plan
	if plan == nil {
		response.Success(c, http.StatusOK, gin.H{"plan": nil})
		return
	}

	response.Success(c, http.StatusOK, plan)
}

// CreateWeeklyPlan handles POST /api/dashboard/weekly-plan (curator only)
// Creates a new weekly plan for a client
func (h *Handler) CreateWeeklyPlan(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	curatorID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Check if user is a curator
	userRole, roleExists := c.Get("user_role")
	if !roleExists || userRole != "curator" {
		response.Forbidden(c, "Только кураторы могут создавать недельные планы")
		return
	}

	// Bind and validate request body
	var req CreateWeeklyPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Errorw("Неверные данные запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Validate date range
	if req.EndDate.Before(req.StartDate) {
		response.Error(c, http.StatusBadRequest, "Дата окончания должна быть не раньше даты начала")
		return
	}

	// Create plan object
	plan := &WeeklyPlan{
		CaloriesGoal: req.CaloriesGoal,
		ProteinGoal:  req.ProteinGoal,
		FatGoal:      req.FatGoal,
		CarbsGoal:    req.CarbsGoal,
		StepsGoal:    req.StepsGoal,
		StartDate:    req.StartDate,
		EndDate:      req.EndDate,
	}

	// Call service to create plan
	createdPlan, err := h.service.CreatePlan(c.Request.Context(), curatorID, req.UserID, plan)
	if err != nil {
		h.log.Errorw("Failed to create weekly plan", "error", err, "curator_id", curatorID, "client_id", req.UserID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(c, http.StatusCreated, createdPlan)
}

// GetTasksRequest represents the request to get tasks
type GetTasksRequest struct {
	Week int `form:"week"` // Optional week number filter
}

// GetTasks handles GET /api/dashboard/tasks
// Retrieves tasks for the authenticated user, optionally filtered by week
func (h *Handler) GetTasks(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Bind and validate query parameters
	var req GetTasksRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		h.log.Errorw("Неверные параметры запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные параметры запроса")
		return
	}

	// If no week specified, use current week number
	weekNumber := req.Week
	if weekNumber == 0 {
		// Calculate current week number
		now := time.Now()
		weekNumber = int(now.Sub(time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.UTC)).Hours()/24/7) + 1
	}

	// Call service to get tasks
	tasks, err := h.service.GetTasksByWeek(c.Request.Context(), userID, weekNumber)
	if err != nil {
		h.log.Errorw("Failed to get tasks", "error", err, "user_id", userID, "week", weekNumber)
		response.InternalError(c, "Не удалось получить задачи")
		return
	}

	response.Success(c, http.StatusOK, gin.H{
		"tasks": tasks,
		"count": len(tasks),
		"week":  weekNumber,
	})
}

// CreateTask handles POST /api/dashboard/tasks (curator only)
// Creates a new task for a client
func (h *Handler) CreateTask(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	curatorID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Check if user is a curator
	userRole, roleExists := c.Get("user_role")
	if !roleExists || userRole != "curator" {
		response.Forbidden(c, "Только кураторы могут создавать задачи")
		return
	}

	// Bind and validate request body
	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Errorw("Неверные данные запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Create task object
	task := &Task{
		Title:       req.Title,
		Description: req.Description,
		WeekNumber:  req.WeekNumber,
		DueDate:     req.DueDate,
	}

	// Call service to create task
	createdTask, err := h.service.CreateTask(c.Request.Context(), curatorID, req.UserID, task)
	if err != nil {
		h.log.Errorw("Failed to create task", "error", err, "curator_id", curatorID, "client_id", req.UserID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(c, http.StatusCreated, createdTask)
}

// UpdateTaskStatus handles PATCH /api/dashboard/tasks/:id
// Updates the status of a task (mark as complete)
func (h *Handler) UpdateTaskStatus(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Get task ID from URL parameter
	taskID := c.Param("id")
	if taskID == "" {
		response.Error(c, http.StatusBadRequest, "ID задачи обязателен")
		return
	}

	// Bind and validate request body
	var req UpdateTaskStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Errorw("Неверные данные запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Call service to update task status
	updatedTask, err := h.service.UpdateTaskStatus(c.Request.Context(), userID, taskID, req.Status)
	if err != nil {
		h.log.Errorw("Failed to update task status", "error", err, "user_id", userID, "task_id", taskID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(c, http.StatusOK, updatedTask)
}

// SubmitWeeklyReport handles POST /api/dashboard/weekly-report
// Submits a weekly report for the authenticated user
func (h *Handler) SubmitWeeklyReport(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Bind and validate request body
	var req SubmitWeeklyReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Errorw("Неверные данные запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Validate date range
	if req.WeekEnd.Before(req.WeekStart) {
		response.Error(c, http.StatusBadRequest, "Конец недели должен быть не раньше начала недели")
		return
	}

	// Validate week data before creating report
	valid, validationErrors, err := h.service.ValidateWeekData(c.Request.Context(), userID, req.WeekStart, req.WeekEnd)
	if err != nil {
		h.log.Errorw("Не удалось проверить данные недели", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось проверить данные недели")
		return
	}

	if !valid {
		h.log.Infow("Week data validation failed", "user_id", userID, "errors", validationErrors)
		c.JSON(http.StatusBadRequest, gin.H{
			"message": "Validation failed",
			"errors":  validationErrors,
		})
		return
	}

	// Call service to create weekly report
	report, err := h.service.CreateWeeklyReport(c.Request.Context(), userID, req.WeekStart, req.WeekEnd)
	if err != nil {
		h.log.Errorw("Failed to create weekly report", "error", err, "user_id", userID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	// TODO: Trigger curator notification

	response.Success(c, http.StatusCreated, report)
}

// UploadPhoto handles POST /api/dashboard/photo-upload
// Uploads a weekly photo for the authenticated user
func (h *Handler) UploadPhoto(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Get week identifier from form data
	weekIdentifier := c.PostForm("week_identifier")
	if weekIdentifier == "" {
		response.Error(c, http.StatusBadRequest, "Идентификатор недели обязателен")
		return
	}

	// Get file from form data
	file, header, err := c.Request.FormFile("photo")
	if err != nil {
		h.log.Errorw("Failed to get file from form", "error", err)
		response.Error(c, http.StatusBadRequest, "Файл фото обязателен")
		return
	}
	defer file.Close()

	// Get file size and mime type
	fileSize := int(header.Size)
	mimeType := header.Header.Get("Content-Type")

	// Validate photo
	if err := h.service.ValidatePhoto(fileSize, mimeType); err != nil {
		h.log.Errorw("Photo validation failed", "error", err, "user_id", userID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	// Call service to upload photo
	photo, err := h.service.UploadPhoto(c.Request.Context(), userID, weekIdentifier, file, fileSize, mimeType)
	if err != nil {
		h.log.Errorw("Не удалось загрузить фото", "error", err, "user_id", userID, "week_identifier", weekIdentifier)
		response.InternalError(c, "Не удалось загрузить фото")
		return
	}

	response.Success(c, http.StatusCreated, photo)
}
