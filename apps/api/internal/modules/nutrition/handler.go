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
	userID, _ := c.Get("user_id")

	entries, err := h.service.GetEntries(c.Request.Context(), userID.(string))
	if err != nil {
		h.log.Errorw("Failed to get entries", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Failed to get entries")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"entries": entries})
}

// CreateEntry creates a new nutrition entry
func (h *Handler) CreateEntry(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req CreateEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request data")
		return
	}

	entry, err := h.service.CreateEntry(c.Request.Context(), userID.(string), &req)
	if err != nil {
		h.log.Errorw("Failed to create entry", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Failed to create entry")
		return
	}

	response.Success(c, http.StatusCreated, gin.H{"entry": entry})
}

// GetEntry returns a single nutrition entry
func (h *Handler) GetEntry(c *gin.Context) {
	entryID := c.Param("id")
	userID, _ := c.Get("user_id")

	entry, err := h.service.GetEntry(c.Request.Context(), userID.(string), entryID)
	if err != nil {
		h.log.Errorw("Failed to get entry", "error", err, "entry_id", entryID)
		response.Error(c, http.StatusNotFound, "Entry not found")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"entry": entry})
}

// UpdateEntry updates a nutrition entry
func (h *Handler) UpdateEntry(c *gin.Context) {
	entryID := c.Param("id")
	userID, _ := c.Get("user_id")

	var req CreateEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request data")
		return
	}

	entry, err := h.service.UpdateEntry(c.Request.Context(), userID.(string), entryID, &req)
	if err != nil {
		h.log.Errorw("Failed to update entry", "error", err, "entry_id", entryID)
		response.Error(c, http.StatusInternalServerError, "Failed to update entry")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"entry": entry})
}

// DeleteEntry deletes a nutrition entry
func (h *Handler) DeleteEntry(c *gin.Context) {
	entryID := c.Param("id")
	userID, _ := c.Get("user_id")

	if err := h.service.DeleteEntry(c.Request.Context(), userID.(string), entryID); err != nil {
		h.log.Errorw("Failed to delete entry", "error", err, "entry_id", entryID)
		response.Error(c, http.StatusInternalServerError, "Failed to delete entry")
		return
	}

	response.SuccessWithMessage(c, http.StatusOK, "Entry deleted successfully", nil)
}
