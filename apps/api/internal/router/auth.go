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

	// A single-use credential for opening the chat socket. Rate limited like
	// the other credential-minting endpoints.
	g.POST("/ws-ticket", d.AuthRateLimiter.Limit("ws-ticket"),
		middleware.RequireAuth(d.Cfg), d.Auth.WSTicket)

	// External sign-in. The list is public so the sign-in screen only offers
	// providers this deployment can actually use.
	g.GET("/providers", d.OAuth.Providers)
	g.GET("/oauth/:provider", d.OAuth.Start)
	g.GET("/oauth/:provider/callback", d.OAuth.Callback)
	// Finishing a sign-in the callback could not: proving ownership of an
	// address that already has an account, or supplying one the provider did
	// not give us. Both are unauthenticated by necessity and both are guessing
	// targets, so both are rate limited.
	g.POST("/oauth/link", d.AuthRateLimiter.Limit("oauth-link"), d.OAuth.ConfirmLink)
	g.POST("/oauth/email", d.AuthRateLimiter.Limit("oauth-link"), d.OAuth.CompleteEmail)
	g.GET("/providers/linked", middleware.RequireAuth(d.Cfg), d.OAuth.LinkedProviders)
	g.DELETE("/providers/:provider", middleware.RequireAuth(d.Cfg), d.OAuth.Unlink)

	g.POST("/forgot-password", d.Reset.ForgotPassword)
	g.POST("/reset-password", d.Reset.ResetPassword)
	g.GET("/validate-reset-token", d.Reset.ValidateResetToken)
}
