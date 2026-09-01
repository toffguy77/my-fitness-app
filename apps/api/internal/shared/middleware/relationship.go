package middleware

import (
	"net/http"
	"strconv"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// ContextClientID is the key under which RequireClientRelationship stores the
// verified client id. Handlers read it instead of re-parsing the path param,
// so a handler cannot accidentally act on an id nobody checked.
const ContextClientID = "verified_client_id"

// RequireClientRelationship rejects requests where the authenticated curator
// has no active relationship with the client named in the path.
//
// This is deliberately a route-group concern rather than a per-service call.
// Every curator service already calls verifyRelationship by hand, and exactly
// one route — implemented in a different module — was missed, which made any
// client's target history readable by any curator. Attaching the check to the
// group makes a new route safe by default, including routes whose handlers
// live outside the curator module.
//
// Must be applied after RequireAuth.
func RequireClientRelationship(db *database.DB, log *logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		curatorIDValue, exists := c.Get("user_id")
		if !exists {
			response.Error(c, http.StatusUnauthorized, "Пользователь не аутентифицирован")
			c.Abort()
			return
		}
		curatorID, ok := curatorIDValue.(int64)
		if !ok {
			response.Error(c, http.StatusUnauthorized, "Пользователь не аутентифицирован")
			c.Abort()
			return
		}

		clientID, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			response.Error(c, http.StatusBadRequest, "Неверный ID клиента")
			c.Abort()
			return
		}

		var allowed bool
		err = db.QueryRowContext(c.Request.Context(),
			`SELECT EXISTS (
				SELECT 1 FROM curator_client_relationships
				WHERE curator_id = $1 AND client_id = $2 AND status = 'active'
			)`, curatorID, clientID).Scan(&allowed)
		if err != nil {
			log.Errorw("Failed to verify curator-client relationship", "error", err,
				"curator_id", curatorID, "client_id", clientID)
			response.InternalError(c, "Не удалось проверить доступ к клиенту")
			c.Abort()
			return
		}
		if !allowed {
			// 403 rather than 404: a curator already knows which clients exist
			// on the platform, and one status keeps the client simple.
			log.Warn("Curator requested a client they are not assigned to",
				"curator_id", curatorID, "client_id", clientID)
			response.Forbidden(c, "Нет доступа к данным этого клиента")
			c.Abort()
			return
		}

		c.Set(ContextClientID, clientID)
		c.Next()
	}
}
