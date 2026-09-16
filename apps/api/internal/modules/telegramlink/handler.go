package telegramlink

import (
	"context"
	"fmt"
	"net/http"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler обслуживает подключение и отвязку Telegram из профиля.
type Handler struct {
	service     *Service
	log         *logger.Logger
	botUsername string
	// invites может быть nil: без группы приглашать некуда.
	invites GroupInviter
}

func NewHandler(service *Service, log *logger.Logger, botUsername string) *Handler {
	return &Handler{service: service, log: log, botUsername: botUsername}
}

// Status отвечает, подключён ли Telegram.
//
// Состояние определяется наличием привязки, а не полем `telegram_username` в
// настройках: имя там человек вписывает сам, и оно ничего не говорит о том,
// может ли бот ему написать.
func (h *Handler) Status(c *gin.Context) {
	userID, ok := callerID(c)
	if !ok {
		return
	}

	link, err := h.service.Of(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Не удалось прочитать привязку Telegram", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось получить состояние привязки")
		return
	}

	if link == nil {
		response.Success(c, http.StatusOK, gin.H{"linked": false})
		return
	}
	response.Success(c, http.StatusOK, gin.H{
		"linked":    true,
		"username":  link.Username,
		"linked_at": link.LinkedAt,
	})
}

// Connect выдаёт одноразовую ссылку на бота.
//
// Ссылка действует минуты и ровно один раз: она даёт право получать
// уведомления этой учётной записи.
func (h *Handler) Connect(c *gin.Context) {
	userID, ok := callerID(c)
	if !ok {
		return
	}

	if h.botUsername == "" {
		// Ссылку построить не из чего. Отвечаем как о выключенной возможности,
		// а не пятисоткой: настройка отсутствует, а не сломана.
		response.ErrorCode(c, http.StatusServiceUnavailable, apperrors.CodeFeatureUnavailable,
			"Подключение Telegram недоступно: бот не настроен", nil)
		return
	}

	ticket, err := h.service.Issue(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Не удалось выдать билет привязки", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось создать ссылку")
		return
	}

	response.Success(c, http.StatusOK, gin.H{
		"url":        fmt.Sprintf("https://t.me/%s?start=%s", h.botUsername, ticket),
		"expires_in": int(TTL.Seconds()),
	})
}

// Disconnect снимает привязку.
func (h *Handler) Disconnect(c *gin.Context) {
	userID, ok := callerID(c)
	if !ok {
		return
	}

	if err := h.service.Unlink(c.Request.Context(), userID); err != nil {
		h.log.Errorw("Не удалось снять привязку Telegram", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось отключить Telegram")
		return
	}
	response.Success(c, http.StatusOK, gin.H{"linked": false})
}

func callerID(c *gin.Context) (int64, bool) {
	value, _ := c.Get("user_id")
	userID, ok := value.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return 0, false
	}
	return userID, true
}

// GroupInvite отдаёт ссылку в рабочую группу.
//
// Нужна тем, кто не привязал Telegram: боту некуда им написать — он не пишет
// первым, — и единственное место, где ссылку можно увидеть, это профиль.
func (h *Handler) GroupInvite(c *gin.Context) {
	userID, ok := callerID(c)
	if !ok {
		return
	}
	if h.invites == nil {
		response.ErrorCode(c, http.StatusServiceUnavailable, apperrors.CodeFeatureUnavailable,
			"Рабочая группа не настроена", nil)
		return
	}

	link, err := h.invites.InviteLinkFor(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Не удалось выдать приглашение в группу", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось получить ссылку")
		return
	}
	if link == "" {
		// Приглашение положено кураторам; всем остальным отвечаем тем же, чем и
		// на выключенную возможность — без намёка на то, кому оно положено.
		response.ErrorCode(c, http.StatusServiceUnavailable, apperrors.CodeFeatureUnavailable,
			"Рабочая группа не настроена", nil)
		return
	}
	response.Success(c, http.StatusOK, gin.H{"invite_link": link})
}

// GroupInviter выдаёт приглашение в рабочую группу.
type GroupInviter interface {
	InviteLinkFor(ctx context.Context, userID int64) (string, error)
}

// WithInvites подключает выдачу приглашений.
func (h *Handler) WithInvites(invites GroupInviter) *Handler {
	h.invites = invites
	return h
}
