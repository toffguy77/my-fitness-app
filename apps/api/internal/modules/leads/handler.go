package leads

import (
	"errors"
	"net/http"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler exposes the lead endpoints: two public ones the guest wizard uses,
// and two behind the administrative section.
type Handler struct {
	service *Service
	log     *logger.Logger
}

// NewHandler creates the handler.
func NewHandler(service *Service, log *logger.Logger) *Handler {
	return &Handler{service: service, log: log}
}

// Create handles POST /api/v1/public/leads.
func (h *Handler) Create(c *gin.Context) {
	var in CreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		response.Error(c, http.StatusBadRequest, "Проверьте адрес почты")
		return
	}

	lead, token, err := h.service.Create(c.Request.Context(), in, c.ClientIP(), c.Request.UserAgent())
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrValidation):
		response.Error(c, http.StatusBadRequest,
			"Нужно согласие на обработку персональных данных")
		return
	default:
		h.log.Error("Failed to save lead", "error", err)
		response.InternalError(c, "Не удалось сохранить результат")
		return
	}

	// The same token as a cookie, because the two ways of registering read it
	// from different places: registering with a password sends it in the
	// request body, while registering through an external provider never
	// reaches our JavaScript again — the browser leaves for the provider and
	// comes back to the callback, which can only see cookies.
	//
	// Without this the provider path silently dropped everything the visitor
	// entered before signing up, and asked for it a second time.
	//
	// SameSite=Lax for that same return trip: Strict withholds the cookie on
	// the cross-site redirect back from the provider, which is precisely the
	// request that needs it. HttpOnly because script keeps its own copy.
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(LeadCookieName, token, int(ResumeTTL.Seconds()), "/", "", true, true)

	response.Success(c, http.StatusCreated, gin.H{
		// The token is what the browser keeps: it is the only thing that opens
		// this lead again, and it cannot be guessed from a neighbouring one.
		"token": token,
		"lead":  lead,
	})
}

// UpdateStep handles POST /api/v1/public/leads/step.
func (h *Handler) UpdateStep(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
		Step  string `json:"step" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	err := h.service.UpdateStep(c.Request.Context(), req.Token, req.Step)
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrTokenInvalid), errors.Is(err, apperrors.ErrTokenExpired),
		errors.Is(err, apperrors.ErrNotFound):
		// Nothing the visitor can do about it, and nothing worth an error
		// screen: the step is a hint for follow-up, not their data.
		response.Success(c, http.StatusOK, gin.H{"recorded": false})
		return
	default:
		h.log.Error("Failed to update lead step", "error", err)
		response.InternalError(c, "Не удалось сохранить прогресс")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"recorded": true})
}

// Resume handles GET /api/v1/public/leads/resume?token=...
//
// Behind the link in the reminder: it hands back what the person entered so the
// wizard opens where they left it.
func (h *Handler) Resume(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		response.Error(c, http.StatusBadRequest, "Ссылка неполная")
		return
	}

	lead, err := h.service.ByToken(c.Request.Context(), token)
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrTokenExpired):
		response.Error(c, http.StatusGone, "Срок действия ссылки истёк")
		return
	case errors.Is(err, apperrors.ErrTokenInvalid), errors.Is(err, apperrors.ErrNotFound):
		response.Error(c, http.StatusBadRequest, "Ссылка недействительна")
		return
	default:
		h.log.Error("Failed to resume lead", "error", err)
		response.InternalError(c, "Не удалось открыть сохранённый результат")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"lead": lead})
}

// Unsubscribe handles GET /api/v1/public/leads/unsubscribe?token=...
//
// Reached from the reminder. It answers the same way whether or not the lead
// was still there: somebody who clicked "delete my data" should be told it is
// gone, not that their record could not be found.
func (h *Handler) Unsubscribe(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		response.Error(c, http.StatusBadRequest, "Ссылка неполная")
		return
	}

	if err := h.service.Unsubscribe(c.Request.Context(), token); err != nil {
		if !errors.Is(err, apperrors.ErrTokenInvalid) && !errors.Is(err, apperrors.ErrTokenExpired) {
			h.log.Error("Failed to unsubscribe lead", "error", err)
			response.InternalError(c, "Не удалось удалить данные")
			return
		}
	}

	response.Success(c, http.StatusOK, gin.H{"deleted": true})
}

// List handles GET /api/v1/admin/leads.
func (h *Handler) List(c *gin.Context) {
	page := response.ParsePage(c)

	leads, total, err := h.service.List(c.Request.Context(), page.Limit, page.Offset)
	if err != nil {
		h.log.Error("Failed to list leads", "error", err)
		response.InternalError(c, "Не удалось загрузить заявки")
		return
	}

	response.Success(c, http.StatusOK, response.Paginated(leads, total, page))
}

// MarkHandled handles POST /api/v1/admin/leads/:id/handled.
func (h *Handler) MarkHandled(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	err := h.service.MarkHandled(c.Request.Context(), c.Param("id"), userID.(int64))
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrNotFound):
		response.NotFound(c, "Заявка не найдена")
		return
	default:
		h.log.Error("Failed to mark lead handled", "error", err)
		response.InternalError(c, "Не удалось отметить заявку")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"handled": true})
}
