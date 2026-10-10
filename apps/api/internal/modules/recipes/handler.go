package recipes

import (
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"strconv"

	"github.com/burcev/api/internal/config"
	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/response"
	"github.com/burcev/api/internal/shared/upload"
	"github.com/gin-gonic/gin"
)

// ServiceInterface is what the handler needs; the handler tests use a fake.
type ServiceInterface interface {
	ListAdmin(ctx context.Context, q ListQuery) ([]RecipeSummary, int, error)
	Create(ctx context.Context, userID int64, in VersionInput) (*RecipeSummary, *RecipeVersion, error)
	Detail(ctx context.Context, recipeID string) (*RecipeDetail, error)
	SaveDraft(ctx context.Context, userID int64, recipeID string, in VersionInput) (*RecipeVersion, error)
	Submit(ctx context.Context, recipeID string) (*RecipeVersion, error)
	SetStatus(ctx context.Context, recipeID, status string) (*RecipeSummary, error)
	UploadPhoto(ctx context.Context, file *multipart.FileHeader) (*UploadedPhoto, error)
	SearchCatalogue(ctx context.Context, q string) ([]foodtracker.CatalogueFood, error)
	SearchVkusvill(ctx context.Context, q string, page int) (*VkusvillResults, error)
	ImportVkusvill(ctx context.Context, userID int64, ref, q string) (string, bool, error)

	ListReview(ctx context.Context, q ListQuery) ([]RecipeSummary, int, error)
	ListPublished(ctx context.Context, q ListQuery) ([]RecipeSummary, int, error)
	Approve(ctx context.Context, curatorID int64, recipeID string, edits *VersionInput) (*RecipeVersion, error)
	Return(ctx context.Context, curatorID int64, recipeID, comment string) (*RecipeVersion, error)

	ListAvailable(ctx context.Context, userID int64, q ListQuery) ([]RecipeSummary, int, error)
	GetAvailable(ctx context.Context, userID int64, recipeID string) (*RecipeVersion, error)
	Reject(ctx context.Context, userID int64, recipeID string) error
	Unreject(ctx context.Context, userID int64, recipeID string) error

	Restrictions(ctx context.Context, userID int64, forCurator bool) (*FoodRestrictions, error)
	SetRestrictions(ctx context.Context, userID int64, in RestrictionsInput, forCurator bool) (*FoodRestrictions, error)
	ListHidden(ctx context.Context, clientID int64) ([]RecipeSummary, error)
	Hide(ctx context.Context, curatorID, clientID int64, recipeID string) error
	Unhide(ctx context.Context, clientID int64, recipeID string) error
}

// Handler serves the recipe catalogue to the team, curators and clients.
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service ServiceInterface
}

// NewHandler builds the handler.
func NewHandler(cfg *config.Config, log *logger.Logger, service ServiceInterface) *Handler {
	return &Handler{cfg: cfg, log: log, service: service}
}

func (h *Handler) userID(c *gin.Context) (int64, bool) {
	if v, ok := c.Get("user_id"); ok {
		if id, ok := v.(int64); ok {
			return id, true
		}
	}
	response.Unauthorized(c, "Пользователь не аутентифицирован")
	return 0, false
}

// clientID is the id RequireClientRelationship verified — never the raw path
// parameter, so a handler cannot act on an id nobody checked.
func (h *Handler) clientID(c *gin.Context) (int64, bool) {
	if v, ok := c.Get(middleware.ContextClientID); ok {
		if id, ok := v.(int64); ok {
			return id, true
		}
	}
	response.Forbidden(c, "Нет доступа к данным этого клиента")
	return 0, false
}

const maxPageSize = 100

func listQuery(c *gin.Context) ListQuery {
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	size, _ := strconv.Atoi(c.Query("page_size"))
	if size < 1 {
		size = response.DefaultLimit
	}
	size = min(size, maxPageSize)
	return ListQuery{
		Q:        c.Query("q"),
		State:    c.Query("state"),
		MealType: c.Query("meal_type"),
		Limit:    size,
		Offset:   (page - 1) * size,
	}
}

func paginated(c *gin.Context, items []RecipeSummary, total int, q ListQuery) {
	response.Success(c, http.StatusOK,
		response.Paginated(items, total, response.Page{Limit: q.Limit, Offset: q.Offset}))
}

// fail answers an error from the service with the status it means.
func (h *Handler) fail(c *gin.Context, err error, what string) {
	var missing *MissingFieldsError
	switch {
	case errors.As(err, &missing):
		response.ErrorCode(c, http.StatusUnprocessableEntity, apperrors.CodeValidation,
			"Рецепт заполнен не полностью", map[string]any{"missing": missing.Missing})
	case errors.Is(err, upload.ErrHEIC):
		response.Error(c, http.StatusBadRequest, upload.ErrHEIC.Error())
	case errors.Is(err, apperrors.ErrUnsupportedMedia):
		response.Error(c, http.StatusUnsupportedMediaType,
			"Поддерживаются только изображения (JPEG, PNG, WebP, GIF)")
	case errors.Is(err, apperrors.ErrValidation):
		response.ErrorCode(c, http.StatusUnprocessableEntity, apperrors.CodeValidation, err.Error(), nil)
	case errors.Is(err, apperrors.ErrNotFound):
		response.NotFound(c, "Рецепт не найден")
	case errors.Is(err, apperrors.ErrConflict):
		response.Error(c, http.StatusConflict, "Версия рецепта не в том состоянии для этого действия")
	case errors.Is(err, apperrors.ErrFeatureUnavailable):
		response.FeatureUnavailable(c, "Возможность недоступна в этом окружении")
	case errors.Is(err, ErrUpstream):
		h.log.Warn("VkusVill is unavailable", "error", err, "action", what)
		response.ErrorCode(c, http.StatusBadGateway, apperrors.CodeInternal,
			"ВкусВилл сейчас недоступен, попробуйте позже", nil)
	default:
		h.log.Error("Recipe catalogue request failed", "error", err, "action", what)
		response.InternalError(c, "Не удалось выполнить запрос")
	}
}

func bindVersion(c *gin.Context) (VersionInput, bool) {
	var in VersionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный формат рецепта")
		return in, false
	}
	return in, true
}

// --- Team (super_admin) ---

// AdminList handles GET /admin/recipes.
func (h *Handler) AdminList(c *gin.Context) {
	q := listQuery(c)
	items, total, err := h.service.ListAdmin(c.Request.Context(), q)
	if err != nil {
		h.fail(c, err, "list")
		return
	}
	paginated(c, items, total, q)
}

// AdminCreate handles POST /admin/recipes.
func (h *Handler) AdminCreate(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	in, ok := bindVersion(c)
	if !ok {
		return
	}
	recipe, version, err := h.service.Create(c.Request.Context(), userID, in)
	if err != nil {
		h.fail(c, err, "create")
		return
	}
	response.Success(c, http.StatusCreated, gin.H{"recipe": recipe, "version": version})
}

// Detail handles GET /admin/recipes/:id and GET /curator/recipes/:id.
func (h *Handler) Detail(c *gin.Context) {
	detail, err := h.service.Detail(c.Request.Context(), c.Param("id"))
	if err != nil {
		h.fail(c, err, "detail")
		return
	}
	response.Success(c, http.StatusOK, detail)
}

// AdminSaveDraft handles PUT /admin/recipes/:id/draft.
func (h *Handler) AdminSaveDraft(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	in, ok := bindVersion(c)
	if !ok {
		return
	}
	version, err := h.service.SaveDraft(c.Request.Context(), userID, c.Param("id"), in)
	if err != nil {
		h.fail(c, err, "save draft")
		return
	}
	response.Success(c, http.StatusOK, version)
}

// AdminSubmit handles POST /admin/recipes/:id/submit.
func (h *Handler) AdminSubmit(c *gin.Context) {
	version, err := h.service.Submit(c.Request.Context(), c.Param("id"))
	if err != nil {
		h.fail(c, err, "submit")
		return
	}
	response.Success(c, http.StatusOK, version)
}

func (h *Handler) setStatus(c *gin.Context, status string) {
	recipe, err := h.service.SetStatus(c.Request.Context(), c.Param("id"), status)
	if err != nil {
		h.fail(c, err, "set status")
		return
	}
	response.Success(c, http.StatusOK, recipe)
}

// AdminUnpublish handles POST /admin/recipes/:id/unpublish.
func (h *Handler) AdminUnpublish(c *gin.Context) { h.setStatus(c, StatusUnpublished) }

// AdminPublish handles POST /admin/recipes/:id/publish.
func (h *Handler) AdminPublish(c *gin.Context) { h.setStatus(c, StatusPublished) }

// AdminUploadPhoto handles POST /admin/recipes/photos.
func (h *Handler) AdminUploadPhoto(c *gin.Context) {
	if !h.cfg.Features.ContentMedia {
		response.FeatureUnavailable(c, "Загрузка фото недоступна в этом окружении")
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Файл не загружен")
		return
	}
	photo, err := h.service.UploadPhoto(c.Request.Context(), file)
	if err != nil {
		h.fail(c, err, "upload photo")
		return
	}
	response.Success(c, http.StatusCreated, photo)
}

// AdminCatalogueSearch handles GET /admin/recipes/catalogue-search.
func (h *Handler) AdminCatalogueSearch(c *gin.Context) {
	items, err := h.service.SearchCatalogue(c.Request.Context(), c.Query("q"))
	if err != nil {
		h.fail(c, err, "catalogue search")
		return
	}
	response.Success(c, http.StatusOK, gin.H{"items": items})
}

// AdminVkusvillSearch handles GET /admin/recipes/import/vkusvill.
func (h *Handler) AdminVkusvillSearch(c *gin.Context) {
	if !h.cfg.Features.RecipeImport {
		response.FeatureUnavailable(c, "Импорт рецептов недоступен в этом окружении")
		return
	}
	page, _ := strconv.Atoi(c.Query("page"))
	results, err := h.service.SearchVkusvill(c.Request.Context(), c.Query("q"), page)
	if err != nil {
		h.fail(c, err, "vkusvill search")
		return
	}
	response.Success(c, http.StatusOK, results)
}

// AdminVkusvillImport handles POST /admin/recipes/import/vkusvill/:sourceRef.
func (h *Handler) AdminVkusvillImport(c *gin.Context) {
	if !h.cfg.Features.RecipeImport {
		response.FeatureUnavailable(c, "Импорт рецептов недоступен в этом окружении")
		return
	}
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	id, existing, err := h.service.ImportVkusvill(c.Request.Context(), userID, c.Param("sourceRef"), c.Query("q"))
	if err != nil {
		h.fail(c, err, "vkusvill import")
		return
	}
	if existing {
		response.Success(c, http.StatusOK, gin.H{"recipe_id": id, "existing": true})
		return
	}
	response.Success(c, http.StatusCreated, gin.H{"recipe_id": id})
}

// --- Curator (coordinator) ---

// CuratorList handles GET /curator/recipes: published recipes to pick from.
func (h *Handler) CuratorList(c *gin.Context) {
	q := listQuery(c)
	items, total, err := h.service.ListPublished(c.Request.Context(), q)
	if err != nil {
		h.fail(c, err, "list published")
		return
	}
	paginated(c, items, total, q)
}

// CuratorReviewQueue handles GET /curator/recipes/review.
func (h *Handler) CuratorReviewQueue(c *gin.Context) {
	q := listQuery(c)
	items, total, err := h.service.ListReview(c.Request.Context(), q)
	if err != nil {
		h.fail(c, err, "review queue")
		return
	}
	paginated(c, items, total, q)
}

// CuratorApprove handles POST /curator/recipes/:id/approve, with optional edits.
func (h *Handler) CuratorApprove(c *gin.Context) {
	curatorID, ok := h.userID(c)
	if !ok {
		return
	}
	var body struct {
		Version *VersionInput `json:"version"`
	}
	if c.Request.ContentLength != 0 {
		if err := c.ShouldBindJSON(&body); err != nil {
			response.Error(c, http.StatusBadRequest, "Неверный формат рецепта")
			return
		}
	}
	version, err := h.service.Approve(c.Request.Context(), curatorID, c.Param("id"), body.Version)
	if err != nil {
		h.fail(c, err, "approve")
		return
	}
	response.Success(c, http.StatusOK, version)
}

// CuratorReturn handles POST /curator/recipes/:id/return.
func (h *Handler) CuratorReturn(c *gin.Context) {
	curatorID, ok := h.userID(c)
	if !ok {
		return
	}
	var body struct {
		Comment string `json:"comment"`
	}
	if c.Request.ContentLength != 0 {
		if err := c.ShouldBindJSON(&body); err != nil {
			response.Error(c, http.StatusBadRequest, "Неверный формат запроса")
			return
		}
	}
	version, err := h.service.Return(c.Request.Context(), curatorID, c.Param("id"), body.Comment)
	if err != nil {
		h.fail(c, err, "return")
		return
	}
	response.Success(c, http.StatusOK, version)
}

// CuratorClientRestrictions handles GET /curator/clients/:id/food-restrictions.
func (h *Handler) CuratorClientRestrictions(c *gin.Context) {
	clientID, ok := h.clientID(c)
	if !ok {
		return
	}
	out, err := h.service.Restrictions(c.Request.Context(), clientID, true)
	if err != nil {
		h.fail(c, err, "client restrictions")
		return
	}
	response.Success(c, http.StatusOK, out)
}

// CuratorSetClientRestrictions handles PUT /curator/clients/:id/food-restrictions.
func (h *Handler) CuratorSetClientRestrictions(c *gin.Context) {
	clientID, ok := h.clientID(c)
	if !ok {
		return
	}
	var in RestrictionsInput
	if err := c.ShouldBindJSON(&in); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный формат ограничений")
		return
	}
	out, err := h.service.SetRestrictions(c.Request.Context(), clientID, in, true)
	if err != nil {
		h.fail(c, err, "set client restrictions")
		return
	}
	response.Success(c, http.StatusOK, out)
}

// CuratorHiddenRecipes handles GET /curator/clients/:id/hidden-recipes.
func (h *Handler) CuratorHiddenRecipes(c *gin.Context) {
	clientID, ok := h.clientID(c)
	if !ok {
		return
	}
	items, err := h.service.ListHidden(c.Request.Context(), clientID)
	if err != nil {
		h.fail(c, err, "hidden recipes")
		return
	}
	response.Success(c, http.StatusOK, gin.H{"items": items})
}

// CuratorHide handles PUT /curator/clients/:id/hidden-recipes/:recipeId.
func (h *Handler) CuratorHide(c *gin.Context) {
	curatorID, ok := h.userID(c)
	if !ok {
		return
	}
	clientID, ok := h.clientID(c)
	if !ok {
		return
	}
	if err := h.service.Hide(c.Request.Context(), curatorID, clientID, c.Param("recipeId")); err != nil {
		h.fail(c, err, "hide")
		return
	}
	c.Status(http.StatusNoContent)
}

// CuratorUnhide handles DELETE /curator/clients/:id/hidden-recipes/:recipeId.
func (h *Handler) CuratorUnhide(c *gin.Context) {
	clientID, ok := h.clientID(c)
	if !ok {
		return
	}
	if err := h.service.Unhide(c.Request.Context(), clientID, c.Param("recipeId")); err != nil {
		h.fail(c, err, "unhide")
		return
	}
	c.Status(http.StatusNoContent)
}

// --- Client ---

// List handles GET /recipes: the caller's available catalogue.
func (h *Handler) List(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	q := listQuery(c)
	items, total, err := h.service.ListAvailable(c.Request.Context(), userID, q)
	if err != nil {
		h.fail(c, err, "catalogue")
		return
	}
	paginated(c, items, total, q)
}

// Get handles GET /recipes/:id.
func (h *Handler) Get(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	version, err := h.service.GetAvailable(c.Request.Context(), userID, c.Param("id"))
	if err != nil {
		h.fail(c, err, "card")
		return
	}
	response.Success(c, http.StatusOK, version)
}

// Reject handles POST /recipes/:id/reject.
func (h *Handler) Reject(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	if err := h.service.Reject(c.Request.Context(), userID, c.Param("id")); err != nil {
		h.fail(c, err, "reject")
		return
	}
	c.Status(http.StatusNoContent)
}

// Unreject handles DELETE /recipes/:id/reject.
func (h *Handler) Unreject(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	if err := h.service.Unreject(c.Request.Context(), userID, c.Param("id")); err != nil {
		h.fail(c, err, "unreject")
		return
	}
	c.Status(http.StatusNoContent)
}

// MyRestrictions handles GET /food-restrictions.
func (h *Handler) MyRestrictions(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	out, err := h.service.Restrictions(c.Request.Context(), userID, false)
	if err != nil {
		h.fail(c, err, "restrictions")
		return
	}
	response.Success(c, http.StatusOK, out)
}

// SetMyRestrictions handles PUT /food-restrictions.
func (h *Handler) SetMyRestrictions(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	var in RestrictionsInput
	if err := c.ShouldBindJSON(&in); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный формат ограничений")
		return
	}
	out, err := h.service.SetRestrictions(c.Request.Context(), userID, in, false)
	if err != nil {
		h.fail(c, err, "set restrictions")
		return
	}
	response.Success(c, http.StatusOK, out)
}
