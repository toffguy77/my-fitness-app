package curator

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler handles curator dashboard requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service ServiceInterface
}

// NewHandler creates a new curator handler
func NewHandler(cfg *config.Config, log *logger.Logger, db *database.DB) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: NewService(db, log),
	}
}

// getUserID extracts the authenticated user ID from the Gin context
func (h *Handler) getUserID(c *gin.Context) (int64, bool) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return 0, false
	}
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор пользователя")
		return 0, false
	}
	return userID, true
}

// GetClients handles GET /api/v1/curator/clients
// Returns all active clients for the authenticated curator with KBZHU summaries and alerts
func (h *Handler) GetClients(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clients, err := h.service.GetClients(c.Request.Context(), userID)
	if err != nil {
		h.log.Error("Failed to get clients", "error", err, "curator_id", userID)
		response.InternalError(c, "Не удалось загрузить список клиентов")
		return
	}

	response.Success(c, http.StatusOK, clients)
}

// GetClientDetail handles GET /api/v1/curator/clients/:id?date=YYYY-MM-DD&days=7
// Returns detailed view of a specific client including multi-day food entries, plan, and alerts.
// If `date` is provided, returns a single day. Otherwise returns the last `days` days (default 7, max 30).
func (h *Handler) GetClientDetail(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientIDStr := c.Param("id")
	clientID, err := strconv.ParseInt(clientIDStr, 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	date := c.Query("date")

	days := 7
	if daysStr := c.Query("days"); daysStr != "" {
		if d, err := strconv.Atoi(daysStr); err == nil && d > 0 {
			days = d
		}
	}
	if days > 30 {
		days = 30
	}

	detail, err := h.service.GetClientDetail(c.Request.Context(), userID, clientID, date, days)
	if err != nil {
		h.log.Error("Failed to get client detail", "error", err, "curator_id", userID, "client_id", clientID)
		// Check if it's an authorization error
		if err.Error() == "unauthorized: no active relationship between curator "+strconv.FormatInt(userID, 10)+" and client "+strconv.FormatInt(clientID, 10) {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		if err.Error() == "client not found" {
			response.NotFound(c, "Клиент не найден")
			return
		}
		response.InternalError(c, "Не удалось загрузить данные клиента")
		return
	}

	response.Success(c, http.StatusOK, detail)
}

// SetTargetWeightRequest represents the request to set a client's target weight
type SetTargetWeightRequest struct {
	TargetWeight *float64 `json:"target_weight"`
}

// SetTargetWeight handles PUT /api/v1/curator/clients/:id/target-weight
func (h *Handler) SetTargetWeight(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	var req SetTargetWeightRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные")
		return
	}

	if err := h.service.SetTargetWeight(c.Request.Context(), userID, clientID, req.TargetWeight); err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		h.log.Error("Failed to set target weight", "error", err, "curator_id", userID, "client_id", clientID)
		response.InternalError(c, "Не удалось обновить целевой вес")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"message": "Целевой вес обновлён"})
}

// SetWaterGoalRequest represents the request to set a client's water goal
type SetWaterGoalRequest struct {
	WaterGoal *int `json:"water_goal"`
}

// SetWaterGoal handles PUT /api/v1/curator/clients/:id/water-goal
func (h *Handler) SetWaterGoal(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	var req SetWaterGoalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные")
		return
	}

	// Validate range if value is provided
	if req.WaterGoal != nil && (*req.WaterGoal < 1 || *req.WaterGoal > 30) {
		response.Error(c, http.StatusBadRequest, "Цель по воде должна быть от 1 до 30 стаканов")
		return
	}

	if err := h.service.SetWaterGoal(c.Request.Context(), userID, clientID, req.WaterGoal); err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		h.log.Error("Failed to set water goal", "error", err, "curator_id", userID, "client_id", clientID)
		response.InternalError(c, "Не удалось обновить цель по воде")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"message": "Цель по воде обновлена"})
}

// CreateWeeklyPlan handles POST /api/v1/curator/clients/:id/weekly-plan
func (h *Handler) CreateWeeklyPlan(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	var req CreateWeeklyPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные: "+err.Error())
		return
	}

	plan, err := h.service.CreateWeeklyPlan(c.Request.Context(), userID, clientID, req)
	if err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		h.log.Error("Failed to create weekly plan", "error", err, "curator_id", userID, "client_id", clientID)
		response.InternalError(c, "Не удалось создать план питания")
		return
	}

	response.Success(c, http.StatusCreated, plan)
}

// UpdateWeeklyPlan handles PUT /api/v1/curator/clients/:id/weekly-plan/:planId
func (h *Handler) UpdateWeeklyPlan(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	planID := c.Param("planId")
	if planID == "" {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор плана")
		return
	}

	var req UpdateWeeklyPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные: "+err.Error())
		return
	}

	plan, err := h.service.UpdateWeeklyPlan(c.Request.Context(), userID, clientID, planID, req)
	if err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "План питания не найден")
			return
		}
		h.log.Error("Failed to update weekly plan", "error", err, "curator_id", userID, "client_id", clientID, "plan_id", planID)
		response.InternalError(c, "Не удалось обновить план питания")
		return
	}

	response.Success(c, http.StatusOK, plan)
}

// DeleteWeeklyPlan handles DELETE /api/v1/curator/clients/:id/weekly-plan/:planId
func (h *Handler) DeleteWeeklyPlan(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	planID := c.Param("planId")
	if planID == "" {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор плана")
		return
	}

	err = h.service.DeleteWeeklyPlan(c.Request.Context(), userID, clientID, planID)
	if err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "План питания не найден")
			return
		}
		h.log.Error("Failed to delete weekly plan", "error", err, "curator_id", userID, "client_id", clientID, "plan_id", planID)
		response.InternalError(c, "Не удалось удалить план питания")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"message": "План питания удалён"})
}

// CreateTask handles POST /api/v1/curator/clients/:id/tasks
func (h *Handler) CreateTask(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные: "+err.Error())
		return
	}

	task, err := h.service.CreateTask(c.Request.Context(), userID, clientID, req)
	if err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		h.log.Error("Failed to create task", "error", err, "curator_id", userID, "client_id", clientID)
		response.InternalError(c, "Не удалось создать задание")
		return
	}

	response.Success(c, http.StatusCreated, task)
}

// UpdateTask handles PUT /api/v1/curator/clients/:id/tasks/:taskId
func (h *Handler) UpdateTask(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	taskID := c.Param("taskId")
	if taskID == "" {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор задания")
		return
	}

	var req UpdateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные: "+err.Error())
		return
	}

	task, err := h.service.UpdateTask(c.Request.Context(), userID, clientID, taskID, req)
	if err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Задание не найдено")
			return
		}
		h.log.Error("Failed to update task", "error", err, "curator_id", userID, "client_id", clientID, "task_id", taskID)
		response.InternalError(c, "Не удалось обновить задание")
		return
	}

	response.Success(c, http.StatusOK, task)
}

// DeleteTask handles DELETE /api/v1/curator/clients/:id/tasks/:taskId
func (h *Handler) DeleteTask(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	taskID := c.Param("taskId")
	if taskID == "" {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор задания")
		return
	}

	err = h.service.DeleteTask(c.Request.Context(), userID, clientID, taskID)
	if err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Задание не найдено")
			return
		}
		h.log.Error("Failed to delete task", "error", err, "curator_id", userID, "client_id", clientID, "task_id", taskID)
		response.InternalError(c, "Не удалось удалить задание")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"message": "Задание удалено"})
}

// GetTasks handles GET /api/v1/curator/clients/:id/tasks
func (h *Handler) GetTasks(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	status := c.Query("status")

	tasks, err := h.service.GetTasks(c.Request.Context(), userID, clientID, status)
	if err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		h.log.Error("Failed to get tasks", "error", err, "curator_id", userID, "client_id", clientID)
		response.InternalError(c, "Не удалось загрузить задания")
		return
	}

	response.Success(c, http.StatusOK, tasks)
}

// GetWeeklyPlans handles GET /api/v1/curator/clients/:id/weekly-plans
func (h *Handler) GetWeeklyPlans(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор клиента")
		return
	}

	plans, err := h.service.GetWeeklyPlans(c.Request.Context(), userID, clientID)
	if err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Forbidden(c, "Нет активной связи с данным клиентом")
			return
		}
		h.log.Error("Failed to get weekly plans", "error", err, "curator_id", userID, "client_id", clientID)
		response.InternalError(c, "Не удалось загрузить планы питания")
		return
	}

	response.Success(c, http.StatusOK, plans)
}
