package middleware

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/curatoraccess"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// RequireCuratorAccess закрывает запись в переписку, когда у её клиента нет
// действующего права на работу с куратором.
//
// Стоит middleware на маршрутах записи, а не проверкой внутри обработчиков, —
// по той же причине, по которой так сделана проверка связи куратора и клиента:
// маршрут, добавленный в группу, защищён даже когда его обработчик живёт в
// другом модуле. Обратный случай — IDOR в истории целей — произошёл там, где
// проверка была в обработчике.
//
// Право спрашивается у клиента переписки, а не у обращающегося: правило
// одинаково для обеих сторон. Куратор, продолжающий переписку с клиентом без
// права, работает бесплатно, не зная об этом, — поэтому запрет симметричный.
//
// Чтение остаётся разрешённым: написанное человеком не становится недоступным
// ему из-за окончания оплаты.
func RequireCuratorAccess(db *database.DB, log *logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		conversationID := c.Param("id")
		if conversationID == "" {
			response.Error(c, http.StatusBadRequest, "Не указан идентификатор переписки")
			c.Abort()
			return
		}

		var clientID int64
		err := db.QueryRowContext(c.Request.Context(),
			`SELECT client_id FROM conversations WHERE id = $1`, conversationID).Scan(&clientID)
		if errors.Is(err, sql.ErrNoRows) {
			// 403, не 404: участник переписки уже знает, что она существует, а
			// не-участника отсюда отсеивает проверка участия в обработчике.
			response.Forbidden(c, "Нет доступа к этому чату")
			c.Abort()
			return
		}
		if err != nil {
			log.Errorw("Failed to resolve conversation client", "error", err,
				"conversation_id", conversationID)
			response.InternalError(c, "Не удалось проверить доступ к переписке")
			c.Abort()
			return
		}

		state, err := curatoraccess.Of(c.Request.Context(), db.DB, clientID)
		if err != nil {
			log.Errorw("Failed to read curator access", "error", err, "client_id", clientID)
			response.InternalError(c, "Не удалось проверить доступ к переписке")
			c.Abort()
			return
		}
		if !state.Allowed() {
			log.Warn("Write to a conversation without curator access",
				"conversation_id", conversationID, "client_id", clientID)
			response.ErrorCode(c, http.StatusForbidden, apperrors.CodeCuratorAccessRequired,
				"Работа с куратором входит в платную подписку", nil)
			c.Abort()
			return
		}

		c.Next()
	}
}
