package content

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler handles content module requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service ServiceInterface
}

// NewHandler creates a new content handler with the given service.
func NewHandler(cfg *config.Config, log *logger.Logger, svc ServiceInterface) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: svc,
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

// isAdmin checks whether the authenticated user has the super_admin role.
func (h *Handler) isAdmin(c *gin.Context) bool {
	role, exists := c.Get("user_role")
	if !exists {
		return false
	}
	return role.(string) == "super_admin"
}

// --- Curator/Admin handlers ---

// CreateArticle handles POST /api/v1/content/articles
func (h *Handler) CreateArticle(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	var req CreateArticleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные: "+err.Error())
		return
	}

	article, err := h.service.CreateArticle(c.Request.Context(), userID, req)
	if err != nil {
		h.log.Error("Failed to create article", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось создать статью")
		return
	}

	response.Success(c, http.StatusCreated, article)
}

// GetArticle handles GET /api/v1/content/articles/:id
func (h *Handler) GetArticle(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	articleID := c.Param("id")
	if articleID == "" {
		response.Error(c, http.StatusBadRequest, "Не указан идентификатор статьи")
		return
	}

	article, err := h.service.GetArticle(c.Request.Context(), userID, articleID, h.isAdmin(c))
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Статья не найдена")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") || strings.Contains(err.Error(), "не принадлежит") {
			response.Forbidden(c, "Нет доступа к этой статье")
			return
		}
		h.log.Error("Failed to get article", "error", err, "user_id", userID, "article_id", articleID)
		response.InternalError(c, "Не удалось загрузить статью")
		return
	}

	response.Success(c, http.StatusOK, article)
}

// ListArticles handles GET /api/v1/content/articles
func (h *Handler) ListArticles(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	status := c.Query("status")
	category := c.Query("category")
	admin := h.isAdmin(c)

	result, err := h.service.ListArticles(c.Request.Context(), userID, status, category, admin)
	if err != nil {
		h.log.Error("Failed to list articles", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось загрузить список статей")
		return
	}

	role, _ := c.Get("user_role")
	h.log.Info("ListArticles result",
		"user_id", userID,
		"user_role", role,
		"is_admin", admin,
		"count", result.Total,
		"status_filter", status,
		"category_filter", category,
		"request_id", c.GetHeader("X-Request-Id"),
	)

	response.Success(c, http.StatusOK, result)
}

// UpdateArticle handles PUT /api/v1/content/articles/:id
func (h *Handler) UpdateArticle(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	articleID := c.Param("id")
	if articleID == "" {
		response.Error(c, http.StatusBadRequest, "Не указан идентификатор статьи")
		return
	}

	var req UpdateArticleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные: "+err.Error())
		return
	}

	article, err := h.service.UpdateArticle(c.Request.Context(), userID, articleID, req, h.isAdmin(c))
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Статья не найдена")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") || strings.Contains(err.Error(), "не принадлежит") {
			response.Forbidden(c, "Нет доступа к этой статье")
			return
		}
		h.log.Error("Failed to update article", "error", err, "user_id", userID, "article_id", articleID)
		response.InternalError(c, "Не удалось обновить статью")
		return
	}

	response.Success(c, http.StatusOK, article)
}

// DeleteArticle handles DELETE /api/v1/content/articles/:id
func (h *Handler) DeleteArticle(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	articleID := c.Param("id")
	if articleID == "" {
		response.Error(c, http.StatusBadRequest, "Не указан идентификатор статьи")
		return
	}

	err := h.service.DeleteArticle(c.Request.Context(), userID, articleID, h.isAdmin(c))
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Статья не найдена")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") || strings.Contains(err.Error(), "не принадлежит") {
			response.Forbidden(c, "Нет доступа к этой статье")
			return
		}
		h.log.Error("Failed to delete article", "error", err, "user_id", userID, "article_id", articleID)
		response.InternalError(c, "Не удалось удалить статью")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"message": "Статья удалена"})
}

// PublishArticle handles POST /api/v1/content/articles/:id/publish
func (h *Handler) PublishArticle(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	articleID := c.Param("id")
	if articleID == "" {
		response.Error(c, http.StatusBadRequest, "Не указан идентификатор статьи")
		return
	}

	err := h.service.PublishArticle(c.Request.Context(), userID, articleID, h.isAdmin(c))
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Статья не найдена")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") || strings.Contains(err.Error(), "не принадлежит") {
			response.Forbidden(c, "Нет доступа к этой статье")
			return
		}
		h.log.Error("Failed to publish article", "error", err, "user_id", userID, "article_id", articleID)
		response.InternalError(c, "Не удалось опубликовать статью")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"message": "Статья опубликована"})
}

// ScheduleArticle handles POST /api/v1/content/articles/:id/schedule
func (h *Handler) ScheduleArticle(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	articleID := c.Param("id")
	if articleID == "" {
		response.Error(c, http.StatusBadRequest, "Не указан идентификатор статьи")
		return
	}

	var req ScheduleArticleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные: "+err.Error())
		return
	}

	err := h.service.ScheduleArticle(c.Request.Context(), userID, articleID, req, h.isAdmin(c))
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Статья не найдена")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") || strings.Contains(err.Error(), "не принадлежит") {
			response.Forbidden(c, "Нет доступа к этой статье")
			return
		}
		h.log.Error("Failed to schedule article", "error", err, "user_id", userID, "article_id", articleID)
		response.InternalError(c, "Не удалось запланировать публикацию")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"message": "Публикация запланирована"})
}

// UnpublishArticle handles POST /api/v1/content/articles/:id/unpublish
func (h *Handler) UnpublishArticle(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	articleID := c.Param("id")
	if articleID == "" {
		response.Error(c, http.StatusBadRequest, "Не указан идентификатор статьи")
		return
	}

	err := h.service.UnpublishArticle(c.Request.Context(), userID, articleID, h.isAdmin(c))
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Статья не найдена")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") || strings.Contains(err.Error(), "не принадлежит") {
			response.Forbidden(c, "Нет доступа к этой статье")
			return
		}
		h.log.Error("Failed to unpublish article", "error", err, "user_id", userID, "article_id", articleID)
		response.InternalError(c, "Не удалось снять статью с публикации")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"message": "Статья снята с публикации"})
}

// UploadMedia handles POST /api/v1/content/articles/:id/media
func (h *Handler) UploadMedia(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	articleID := c.Param("id")
	if articleID == "" {
		response.Error(c, http.StatusBadRequest, "Не указан идентификатор статьи")
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Файл не загружен")
		return
	}

	url, err := h.service.UploadMedia(c.Request.Context(), userID, articleID, file, h.isAdmin(c))
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Статья не найдена")
			return
		}
		if strings.Contains(err.Error(), "unauthorized") || strings.Contains(err.Error(), "не принадлежит") {
			response.Forbidden(c, "Нет доступа к этой статье")
			return
		}
		h.log.Error("Failed to upload media", "error", err, "user_id", userID, "article_id", articleID)
		response.InternalError(c, "Не удалось загрузить файл")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"url": url})
}

// UploadMarkdownFile handles POST /api/v1/content/articles/upload
func (h *Handler) UploadMarkdownFile(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Файл не загружен")
		return
	}

	// Read metadata from form fields
	req := CreateArticleRequest{
		Title:         c.PostForm("title"),
		Excerpt:       c.PostForm("excerpt"),
		Category:      c.PostForm("category"),
		AudienceScope: c.PostForm("audience_scope"),
	}

	if req.Title == "" || req.Category == "" || req.AudienceScope == "" {
		response.Error(c, http.StatusBadRequest, "Необходимо указать title, category и audience_scope")
		return
	}

	article, err := h.service.UploadMarkdownFile(c.Request.Context(), userID, file, req)
	if err != nil {
		h.log.Error("Failed to upload markdown file", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось загрузить markdown файл")
		return
	}

	response.Success(c, http.StatusCreated, article)
}

// --- Client feed handlers ---

// GetFeed handles GET /api/v1/feed
func (h *Handler) GetFeed(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	category := c.Query("category")

	limit := 20
	if limitStr := c.DefaultQuery("limit", "20"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	offset := 0
	if offsetStr := c.DefaultQuery("offset", "0"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	result, err := h.service.GetFeed(c.Request.Context(), userID, category, limit, offset)
	if err != nil {
		h.log.Error("Failed to get feed", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось загрузить ленту")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// GetFeedArticle handles GET /api/v1/feed/:id
func (h *Handler) GetFeedArticle(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	articleID := c.Param("id")
	if articleID == "" {
		response.Error(c, http.StatusBadRequest, "Не указан идентификатор статьи")
		return
	}

	article, err := h.service.GetFeedArticle(c.Request.Context(), userID, articleID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Статья не найдена")
			return
		}
		h.log.Error("Failed to get feed article", "error", err, "user_id", userID, "article_id", articleID)
		response.InternalError(c, "Не удалось загрузить статью")
		return
	}

	response.Success(c, http.StatusOK, article)
}

// --- Public handlers (no auth required) ---

// GetPublicFeed handles GET /api/v1/public/content
func (h *Handler) GetPublicFeed(c *gin.Context) {
	category := c.Query("category")

	limit := 20
	if limitStr := c.DefaultQuery("limit", "20"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	offset := 0
	if offsetStr := c.DefaultQuery("offset", "0"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	result, err := h.service.GetPublicFeed(c.Request.Context(), category, limit, offset)
	if err != nil {
		h.log.Error("Failed to get public feed", "error", err)
		response.InternalError(c, "Не удалось загрузить ленту")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// GetPublicArticle handles GET /api/v1/public/content/:id
func (h *Handler) GetPublicArticle(c *gin.Context) {
	articleID := c.Param("id")
	if articleID == "" {
		response.Error(c, http.StatusBadRequest, "Не указан идентификатор статьи")
		return
	}

	article, err := h.service.GetPublicArticle(c.Request.Context(), articleID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "Статья не найдена")
			return
		}
		h.log.Error("Failed to get public article", "error", err, "article_id", articleID)
		response.InternalError(c, "Не удалось загрузить статью")
		return
	}

	response.Success(c, http.StatusOK, article)
}
