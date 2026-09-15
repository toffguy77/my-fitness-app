package support

import (
	"errors"
	"net/http"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/burcev/api/internal/shared/telegram"
	"github.com/gin-gonic/gin"
)

// Handler receives Telegram updates and serves the operator's queue.
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service *Service
}

// NewHandler creates the handler. service may be nil when the capability is
// off; every endpoint then answers 503, like every other disabled feature.
func NewHandler(cfg *config.Config, log *logger.Logger, service *Service) *Handler {
	return &Handler{cfg: cfg, log: log, service: service}
}

// Webhook handles POST /api/v1/public/support/telegram.
//
// Public by necessity — Telegram calls it — so the secret header is the only
// thing between a genuine update and anybody's POST.
func (h *Handler) Webhook(c *gin.Context) {
	if !telegram.ValidSecret(h.cfg.TelegramWebhookSecret, c.GetHeader(telegram.SecretHeader)) {
		h.log.Warn("Rejected Telegram update with a bad secret", "ip", c.ClientIP())
		// 401 rather than 404: Telegram retries on 5xx, and pretending the
		// endpoint is missing would hide a misconfigured secret from us too.
		response.Unauthorized(c, "unauthorized")
		return
	}

	if h.service == nil {
		response.FeatureUnavailable(c, "Бот поддержки не настроен")
		return
	}

	var update telegram.Update
	if err := c.ShouldBindJSON(&update); err != nil {
		// A malformed update is not worth a retry.
		response.Success(c, http.StatusOK, gin.H{"ok": true})
		return
	}

	if update.Message == nil {
		// Присоединения, выходы, служебные обновления: отвечать нечему.
		response.Success(c, http.StatusOK, gin.H{"ok": true})
		return
	}

	// Фотография или файл от клиента.
	//
	// Раньше здесь стояло «nothing to answer» и на фотографию не приходило
	// ничего: ни ответа, ни отказа. Молчание в ответ на отправленный файл
	// читается как поломка, а не как «не умею».
	if fileID, fileName := attachmentOf(&update); fileID != "" {
		if err := h.service.HandleAttachment(c.Request.Context(), Attachment{
			ChatID:   update.Message.Chat.ID,
			FileID:   fileID,
			FileName: fileName,
			Caption:  update.Message.Caption,
		}); err != nil {
			h.log.Error("Failed to handle a support attachment", "error", err)
		}
		response.Success(c, http.StatusOK, gin.H{"ok": true})
		return
	}

	if update.Message.Text == "" {
		// Стикеры и прочее без текста: отвечать не на что.
		response.Success(c, http.StatusOK, gin.H{"ok": true})
		return
	}

	// Сообщение из группы кураторов — это ответ куратора, а не вопрос клиента.
	// Разводится до всего остального: иначе ответ куратора уехал бы в модель как
	// обращение, а сам куратор завёл бы себе тему.
	if h.cfg.TelegramSupportGroupID != 0 && update.Message.Chat.ID == h.cfg.TelegramSupportGroupID {
		var replyTo int64
		if update.Message.ReplyToMessage != nil {
			replyTo = update.Message.ReplyToMessage.MessageID
		}
		var operatorID int64
		if update.Message.From != nil {
			operatorID = update.Message.From.ID
		}
		if err := h.service.HandleCuratorReply(c.Request.Context(), CuratorReply{
			ThreadID:         update.Message.MessageThreadID,
			ReplyToMessageID: replyTo,
			TelegramUserID:   operatorID,
			Text:             update.Message.Text,
		}); err != nil {
			h.log.Error("Failed to deliver a curator reply", "error", err)
		}
		response.Success(c, http.StatusOK, gin.H{"ok": true})
		return
	}

	in := IncomingMessage{
		ChatID: update.Message.Chat.ID,
		Text:   update.Message.Text,
	}
	if update.Message.From != nil {
		in.Username = update.Message.From.Username
		in.Name = update.Message.From.FirstName
	}

	if err := h.service.HandleMessage(c.Request.Context(), in); err != nil {
		h.log.Error("Failed to handle support message", "error", err)
		// Telegram retries on a non-2xx. A failure here has already been
		// logged, and a retry would re-answer a question the user may have
		// already had answered, so the update is acknowledged either way.
	}

	response.Success(c, http.StatusOK, gin.H{"ok": true})
}

// List handles GET /api/v1/admin/support/conversations.
func (h *Handler) List(c *gin.Context) {
	if h.service == nil {
		response.FeatureUnavailable(c, "Бот поддержки не настроен")
		return
	}

	page := response.ParsePage(c)
	conversations, total, err := h.service.ListConversations(c.Request.Context(),
		c.Query("status"), page.Limit, page.Offset)
	if err != nil {
		h.log.Error("Failed to list support conversations", "error", err)
		response.InternalError(c, "Не удалось загрузить обращения")
		return
	}

	response.Success(c, http.StatusOK, response.Paginated(conversations, total, page))
}

// Messages handles GET /api/v1/admin/support/conversations/:id.
func (h *Handler) Messages(c *gin.Context) {
	if h.service == nil {
		response.FeatureUnavailable(c, "Бот поддержки не настроен")
		return
	}

	conversation, messages, lead, err := h.service.Thread(c.Request.Context(), c.Param("id"))
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrNotFound):
		response.NotFound(c, "Обращение не найдено")
		return
	default:
		h.log.Error("Failed to load support conversation", "error", err)
		response.InternalError(c, "Не удалось загрузить обращение")
		return
	}

	response.Success(c, http.StatusOK, gin.H{
		"conversation": conversation,
		"messages":     messages,
		// What the person was doing when they got stuck, so the operator does
		// not have to ask them to repeat it.
		"lead": lead,
	})
}

// Reply handles POST /api/v1/admin/support/conversations/:id/reply.
func (h *Handler) Reply(c *gin.Context) {
	if h.service == nil {
		response.FeatureUnavailable(c, "Бот поддержки не настроен")
		return
	}

	operatorID, ok := c.Get("user_id")
	if !ok {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	var req struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Введите текст ответа")
		return
	}

	err := h.service.AnswerAsOperator(c.Request.Context(), c.Param("id"), operatorID.(int64), req.Text)
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrNotFound):
		response.NotFound(c, "Обращение не найдено")
		return
	default:
		h.log.Error("Failed to send operator reply", "error", err)
		response.InternalError(c, "Не удалось отправить ответ")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"sent": true})
}

// CloseConversation handles POST /api/v1/admin/support/conversations/:id/close.
func (h *Handler) CloseConversation(c *gin.Context) {
	if h.service == nil {
		response.FeatureUnavailable(c, "Бот поддержки не настроен")
		return
	}

	operatorID, ok := c.Get("user_id")
	if !ok {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	err := h.service.Close(c.Request.Context(), c.Param("id"), operatorID.(int64))
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrNotFound):
		response.NotFound(c, "Обращение не найдено")
		return
	default:
		h.log.Error("Failed to close support conversation", "error", err)
		response.InternalError(c, "Не удалось закрыть обращение")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"closed": true})
}

// attachmentOf достаёт присланный файл из обновления.
//
// Фотография приходит набором размеров; берётся последний — он самый крупный.
func attachmentOf(update *telegram.Update) (fileID, fileName string) {
	if n := len(update.Message.Photo); n > 0 {
		return update.Message.Photo[n-1].FileID, "photo.jpg"
	}
	if update.Message.Document != nil {
		return update.Message.Document.FileID, update.Message.Document.FileName
	}
	return "", ""
}
