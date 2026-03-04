package foodtracker

import (
	"net/http"

	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// CreateUserFood handles POST /api/v1/food-tracker/user-foods
func (h *Handler) CreateUserFood(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	var req CreateUserFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	if err := req.Validate(); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	food, err := h.service.CreateUserFood(c.Request.Context(), userID, &req)
	if err != nil {
		h.log.Errorw("Failed to create user food", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось создать продукт")
		return
	}

	response.Success(c, http.StatusCreated, food)
}

// CloneUserFood handles POST /api/v1/food-tracker/user-foods/clone
func (h *Handler) CloneUserFood(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	var req CloneUserFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	if err := req.Validate(); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	food, err := h.service.CloneUserFood(c.Request.Context(), userID, &req)
	if err != nil {
		h.log.Errorw("Failed to clone user food", "error", err, "user_id", userID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(c, http.StatusCreated, food)
}

// GetUserFoods handles GET /api/v1/food-tracker/user-foods
func (h *Handler) GetUserFoods(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	foods, err := h.service.GetUserFoods(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Failed to get user foods", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить пользовательские продукты")
		return
	}

	response.Success(c, http.StatusOK, foods)
}

// UpdateUserFood handles PUT /api/v1/food-tracker/user-foods/:id
func (h *Handler) UpdateUserFood(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	foodID := c.Param("id")

	var req UpdateUserFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	food, err := h.service.UpdateUserFood(c.Request.Context(), userID, foodID, &req)
	if err != nil {
		h.log.Errorw("Failed to update user food", "error", err, "user_id", userID, "food_id", foodID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(c, http.StatusOK, food)
}

// DeleteUserFood handles DELETE /api/v1/food-tracker/user-foods/:id
func (h *Handler) DeleteUserFood(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	foodID := c.Param("id")

	if err := h.service.DeleteUserFood(c.Request.Context(), userID, foodID); err != nil {
		h.log.Errorw("Failed to delete user food", "error", err, "user_id", userID, "food_id", foodID)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.SuccessWithMessage(c, http.StatusOK, "Продукт удалён", nil)
}
