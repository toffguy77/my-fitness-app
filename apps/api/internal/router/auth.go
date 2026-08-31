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

	// External sign-in. The list is public so the sign-in screen only offers
	// providers this deployment can actually use.
	g.GET("/providers", d.OAuth.Providers)
	g.GET("/oauth/:provider", d.OAuth.Start)
	g.GET("/oauth/:provider/callback", d.OAuth.Callback)
	g.GET("/providers/linked", middleware.RequireAuth(d.Cfg), d.OAuth.LinkedProviders)
	g.DELETE("/providers/:provider", middleware.RequireAuth(d.Cfg), d.OAuth.Unlink)

	g.POST("/forgot-password", d.Reset.ForgotPassword)
	g.POST("/reset-password", d.Reset.ResetPassword)
	g.GET("/validate-reset-token", d.Reset.ValidateResetToken)
}
