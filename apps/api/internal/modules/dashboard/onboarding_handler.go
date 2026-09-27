package dashboard

import (
	"net/http"

	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// GetOnboarding handles GET /api/v1/dashboard/onboarding.
//
// One answer for the whole first screen: which first-week tasks are left, and
// who the curator is. The route carries RequireRole("client") — curators and
// administrators have their own shell, and a first-week checklist means nothing
// there.
//
// Whether the plate-photo task exists at all is decided here, from the
// capability flag, rather than by the frontend. A task the frontend could decide
// to show while the capability is off would end in a 503 the person cannot act
// on.
func (h *Handler) GetOnboarding(c *gin.Context) {
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

	state, err := h.service.GetOnboardingState(c.Request.Context(), userID, h.cfg.Features.FoodRecognition)
	if err != nil {
		h.log.Errorw("Failed to get onboarding state", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить состояние первой недели")
		return
	}

	response.Success(c, http.StatusOK, state)
}
