package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerAuthRoutes wires authentication and password recovery.
//
// Registration and login carry their own rate limiters; the recovery endpoints
// are limited inside the reset service, which throttles per email and per IP.
func registerAuthRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/auth")

	g.POST("/register", d.AuthRateLimiter.Limit("register"), d.Auth.Register)
	g.POST("/login", d.AuthRateLimiter.Limit("login"), d.Auth.Login)
	g.POST("/refresh", d.Auth.Refresh)
	g.POST("/logout", d.Auth.Logout)

	g.GET("/me", middleware.RequireAuth(d.Cfg), d.Auth.GetCurrentUser)
	g.POST("/verify-email", middleware.RequireAuth(d.Cfg), d.Auth.VerifyEmail)
	g.POST("/resend-verification", d.AuthRateLimiter.Limit("resend-verification"),
		middleware.RequireAuth(d.Cfg), d.Auth.ResendVerification)
	g.POST("/change-password", middleware.RequireAuth(d.Cfg), d.Auth.ChangePassword)

	g.POST("/forgot-password", d.Reset.ForgotPassword)
	g.POST("/reset-password", d.Reset.ResetPassword)
	g.GET("/validate-reset-token", d.Reset.ValidateResetToken)
}
