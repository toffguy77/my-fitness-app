package leads

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler exposes the lead endpoints: four public ones the guest wizard
// uses (Create, UpdateStep, Resume, Unsubscribe), and two behind the
// curator workspace (List, MarkHandled) — open to coordinator and
// super_admin alike, not the administrative section alone.
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
		response.ErrorCode(c, http.StatusGone,
			apperrors.CodeTokenExpired, "Срок действия ссылки истёк", nil)
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

// List handles GET /api/v1/curator/leads.
//
// This is a work queue, not a history: by default it holds only what nobody
// has marked handled, oldest first — a curator should see who to pick up next,
// not scroll a timeline. ?include_handled=true adds back everyone already
// dealt with, for whoever wants the full picture.
func (h *Handler) List(c *gin.Context) {
	page := response.ParsePage(c)
	// Queue clamps its own offset before it reaches the database — but that
	// clamp is invisible here unless the same bound is applied before page
	// is echoed back. Left alone, the response would claim an offset the
	// query never actually used, and a curator paging past the clamp would
	// see the same handful of rows forever under a climbing offset number
	// that no longer means anything.
	if page.Offset > maxQueueOffset {
		page.Offset = maxQueueOffset
	}
	includeHandled := parseIncludeHandled(c)

	entries, total, err := h.service.Queue(c.Request.Context(), includeHandled, page.Limit, page.Offset)
	if err != nil {
		h.log.Error("Failed to list lead queue", "error", err)
		response.InternalError(c, "Не удалось загрузить заявки")
		return
	}

	response.Success(c, http.StatusOK, response.Paginated(entries, total, page))
}

// parseIncludeHandled reads include_handled the way response.ParsePage reads
// limit and offset: leniently. An exact-match "== \"true\"" made "=1",
// "=TRUE", "=on" and a bare flag with no value at all fall back to false —
// silently, and indistinguishably from "there are no handled leads at all".
// A curator staring at an empty history has no way to tell those apart.
func parseIncludeHandled(c *gin.Context) bool {
	raw, present := c.GetQuery("include_handled")
	if raw == "" {
		// Absent (present == false) means "not asked for", the default.
		// Present with no value (?include_handled) is the common flag
		// shorthand and means "yes".
		return present
	}
	if value, err := strconv.ParseBool(raw); err == nil {
		return value
	}
	return strings.EqualFold(raw, "on")
}

// MarkHandled handles POST /api/v1/curator/leads/:id/handled.
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
	case errors.Is(err, apperrors.ErrConflict):
		// Not response.Error: on a 409 that falls back to CodeConflict, which
		// the dictionary renders as "Действие невозможно в текущем
		// состоянии" — true but useless, since it drops the one thing the
		// server actually knew (who marked it, and that it was already
		// marked). Worded to hold regardless of who got there first: it may
		// be the same coordinator retrying after a dropped response, not
		// necessarily "another" one, so the text does not claim that.
		response.ErrorCode(c, http.StatusConflict, apperrors.CodeLeadAlreadyClaimed,
			"Заявка уже отмечена обработанной", nil)
		return
	default:
		h.log.Error("Failed to mark lead handled", "error", err)
		response.InternalError(c, "Не удалось отметить заявку")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"handled": true})
}
