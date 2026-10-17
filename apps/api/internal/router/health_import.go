package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerHealthImportRoutes wires the Apple Health import (healthkit-sync).
//
// Its own file and group rather than a line next to POST /dashboard/daily: the
// import is a separate contract with its own limit, and keeping it apart keeps
// tracker.go untouched.
func registerHealthImportRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/health")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))

	// Не больше 120 пачек в час на пользователя: зацикленная очередь на
	// телефоне не должна превратиться в нагрузку на базу.
	g.POST("/import", d.AuthRateLimiter.LimitBy("health-import", middleware.ByUser), d.Dashboard.ImportHealth)
}
