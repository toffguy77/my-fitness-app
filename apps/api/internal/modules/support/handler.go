package support

import (
	"errors"
	"net/http"
	"unicode/utf8"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/burcev/api/internal/shared/telegram"
	"github.com/gin-gonic/gin"
)

// Handler receives Telegram updates and serves the operator's queue — and, for
// the web widget, the anonymous visitor themself.
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

// Пределы публичного разговора. Ни один не защищает в одиночку: маршрутный
// лимитер (по IP) сдерживает поток запросов, MaxWebMessageRunes — стоимость
// одного вопроса, MaxWebMessagesPerConversation — число сообщений в
// разговоре, который ведут не ради ответа, а чтобы удерживать модель на
// одном и том же токене сколь угодно долго.
const (
	MaxWebMessageRunes            = 1000
	MaxWebMessagesPerConversation = 30
)

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

	// Заявка на вступление в группу кураторов. Разводится до сообщений: это не
	// вопрос к поддержке, обращения из него быть не должно.
	if update.ChatJoinRequest != nil {
		if err := h.service.HandleJoinRequest(c.Request.Context(),
			update.ChatJoinRequest.Chat.ID,
			update.ChatJoinRequest.From.ID,
			update.ChatJoinRequest.From.Username); err != nil {
			h.log.Error("Failed to decide a join request", "error", err)
		}
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
		fileID, fileName := attachmentOf(&update)
		text := update.Message.Text
		if text == "" {
			text = update.Message.Caption
		}
		if err := h.service.HandleCuratorReply(c.Request.Context(), CuratorReply{
			ThreadID:         update.Message.MessageThreadID,
			ReplyToMessageID: replyTo,
			TelegramUserID:   operatorID,
			Text:             text,
			FileID:           fileID,
			FileName:         fileName,
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

// StartWeb handles POST /api/v1/public/support/web.
//
// Public by necessity — a visitor before registration has no session — so the
// token this mints is the only thing standing between the conversation it
// opens and anybody who guesses it. It is generated, not chosen, and only its
// hash is ever stored (web.go).
func (h *Handler) StartWeb(c *gin.Context) {
	if h.service == nil {
		response.FeatureUnavailable(c, "Бот поддержки не настроен")
		return
	}

	id, token, err := h.service.StartWebConversation(c.Request.Context())
	if err != nil {
		h.log.Error("Failed to start web conversation", "error", err)
		response.InternalError(c, "Не удалось открыть чат")
		return
	}

	response.Success(c, http.StatusCreated, gin.H{"token": token, "conversation_id": id})
}

// WebMessage handles POST /api/v1/public/support/web/message.
//
// A forged, foreign or deleted token answers the same 404 as one that never
// existed: telling them apart would let a stranger learn something about a
// conversation they cannot open by trying tokens against this endpoint.
func (h *Handler) WebMessage(c *gin.Context) {
	if h.service == nil {
		response.FeatureUnavailable(c, "Бот поддержки не настроен")
		return
	}

	var req struct {
		Token string `json:"token" binding:"required"`
		Text  string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}
	if utf8.RuneCountInString(req.Text) > MaxWebMessageRunes {
		response.Error(c, http.StatusBadRequest, "Вопрос получился длинным — напишите короче")
		return
	}

	conversation, err := h.service.WebConversationByToken(c.Request.Context(), req.Token)
	if err != nil {
		// Поддельный, чужой и удалённый токен неразличимы наружу.
		response.NotFound(c, "Чат не найден — откройте его заново")
		return
	}

	err = h.service.HandleMessage(c.Request.Context(), IncomingMessage{
		Conversation: conversation,
		Text:         req.Text,
	})
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrRateLimited):
		response.ErrorCode(c, http.StatusTooManyRequests, apperrors.CodeRateLimited,
			"В этом чате слишком много сообщений — позовите человека", nil)
		return
	default:
		h.log.Error("Failed to handle web message", "error", err)
		response.InternalError(c, "Не удалось отправить сообщение")
		return
	}

	response.Success(c, http.StatusOK, nil)
}

// WebMessages handles GET /api/v1/public/support/web/messages.
//
// Returns the transcript and the conversation's status — nothing about the
// lead it may be attached to: a visitor with a bearer token has no business
// seeing what an operator sees about them.
func (h *Handler) WebMessages(c *gin.Context) {
	if h.service == nil {
		response.FeatureUnavailable(c, "Бот поддержки не настроен")
		return
	}

	conversation, err := h.service.WebConversationByToken(c.Request.Context(), c.Query("token"))
	if err != nil {
		response.NotFound(c, "Чат не найден — откройте его заново")
		return
	}

	messages, err := h.service.MessagesFor(c.Request.Context(), conversation.ID)
	if err != nil {
		h.log.Error("Failed to load web conversation messages", "error", err)
		response.InternalError(c, "Не удалось загрузить сообщения")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"messages": messages, "status": conversation.Status})
}

// WebHuman handles POST /api/v1/public/support/web/human.
//
// «Позвать человека» из виджета: тот же жест, что и /human в Telegram —
// сразу, без вопроса модели, и не требует, чтобы посетитель дожидался
// ответа на месте. Разговор уходит в общую операторскую очередь, а ответ
// посетитель заберёт своим токеном, когда вернётся (EscalateWeb, service.go).
//
// Поддельный, чужой и удалённый токен отвечают тем же 404, что и остальные
// веб-маршруты — не давая постороннему отличить их перебором.
func (h *Handler) WebHuman(c *gin.Context) {
	if h.service == nil {
		response.FeatureUnavailable(c, "Бот поддержки не настроен")
		return
	}

	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	err := h.service.EscalateWeb(c.Request.Context(), req.Token)
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrNotFound):
		response.NotFound(c, "Чат не найден — откройте его заново")
		return
	default:
		h.log.Error("Failed to escalate web conversation", "error", err)
		response.InternalError(c, "Не удалось позвать человека")
		return
	}

	response.Success(c, http.StatusOK, nil)
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
