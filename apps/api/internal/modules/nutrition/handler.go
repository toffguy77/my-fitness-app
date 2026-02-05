package nutrition

import (
	"net/http"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler handles nutrition requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service *Service
}

// NewHandler creates a new nutrition handler
func NewHandler(cfg *config.Config, log *logger.Logger) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: NewService(cfg, log),
	}
}

// CreateEntryRequest represents nutrition entry creation request
type CreateEntryRequest struct {
	Date     string  `json:"date" binding:"required"`
	Meal     string  `json:"meal" binding:"required"`
	Food     string  `json:"food" binding:"required"`
	Calories float64 `json:"calories" binding:"required"`
	Protein  float64 `json:"protein"`
	Carbs    float64 `json:"carbs"`
	Fat      float64 `json:"fat"`
}

// GetEntries returns nutrition entries
func (h *Handler) GetEntries(c *gin.Context) {
	userIDInterface, _ := c.Get("user_id")
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	entries, err := h.service.GetEntries(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Не удалось получить записи", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось получить записи")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"entries": entries})
}

// CreateEntry creates a new nutrition entry
func (h *Handler) CreateEntry(c *gin.Context) {
	userIDInterface, _ := c.Get("user_id")
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	var req CreateEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	entry, err := h.service.CreateEntry(c.Request.Context(), userID, &req)
	if err != nil {
		h.log.Errorw("Не удалось создать запись", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось создать запись")
		return
	}

	response.Success(c, http.StatusCreated, gin.H{"entry": entry})
}

// GetEntry returns a single nutrition entry
func (h *Handler) GetEntry(c *gin.Context) {
	entryID := c.Param("id")
	userIDInterface, _ := c.Get("user_id")
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	entry, err := h.service.GetEntry(c.Request.Context(), userID, entryID)
	if err != nil {
		h.log.Errorw("Failed to get entry", "error", err, "entry_id", entryID)
		response.Error(c, http.StatusNotFound, "Запись не найдена")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"entry": entry})
}

// UpdateEntry updates a nutrition entry
func (h *Handler) UpdateEntry(c *gin.Context) {
	entryID := c.Param("id")
	userIDInterface, _ := c.Get("user_id")
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	var req CreateEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	entry, err := h.service.UpdateEntry(c.Request.Context(), userID, entryID, &req)
	if err != nil {
		h.log.Errorw("Не удалось обновить запись", "error", err, "entry_id", entryID)
		response.Error(c, http.StatusInternalServerError, "Не удалось обновить запись")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"entry": entry})
}

// DeleteEntry deletes a nutrition entry
func (h *Handler) DeleteEntry(c *gin.Context) {
	entryID := c.Param("id")
	userIDInterface, _ := c.Get("user_id")
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	if err := h.service.DeleteEntry(c.Request.Context(), userID, entryID); err != nil {
		h.log.Errorw("Не удалось удалить запись", "error", err, "entry_id", entryID)
		response.Error(c, http.StatusInternalServerError, "Не удалось удалить запись")
		return
	}

	response.SuccessWithMessage(c, http.StatusOK, "Entry deleted successfully", nil)
}
