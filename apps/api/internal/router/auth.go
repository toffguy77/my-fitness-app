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

	g.GET("/me", middleware.RequireAuth(d.Cfg, d.TokenVersions), d.Auth.GetCurrentUser)
	g.POST("/verify-email", middleware.RequireAuth(d.Cfg, d.TokenVersions), d.Auth.VerifyEmail)
	g.POST("/resend-verification", d.AuthRateLimiter.Limit("resend-verification"),
		middleware.RequireAuth(d.Cfg, d.TokenVersions), d.Auth.ResendVerification)
	g.POST("/change-password", middleware.RequireAuth(d.Cfg, d.TokenVersions), d.Auth.ChangePassword)

	// A single-use credential for opening the chat socket. Rate limited like
	// the other credential-minting endpoints.
	g.POST("/ws-ticket", d.AuthRateLimiter.Limit("ws-ticket"),
		middleware.RequireAuth(d.Cfg, d.TokenVersions), d.Auth.WSTicket)

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
	// Согласия до создания аккаунта через провайдера: колбэк уводит на экран
	// согласий, а аккаунт появляется здесь.
	g.POST("/oauth/consents", d.AuthRateLimiter.Limit("oauth-link"), d.OAuth.CompleteConsents)
	g.POST("/oauth/app-exchange", d.AuthRateLimiter.Limit("oauth-link"), d.OAuth.AppExchange)
	g.GET("/providers/linked", middleware.RequireAuth(d.Cfg, d.TokenVersions), d.OAuth.LinkedProviders)
	g.DELETE("/providers/:provider", middleware.RequireAuth(d.Cfg, d.TokenVersions), d.OAuth.Unlink)

	g.POST("/forgot-password", d.Reset.ForgotPassword)
	g.POST("/reset-password", d.Reset.ResetPassword)
	g.GET("/validate-reset-token", d.Reset.ValidateResetToken)

	// Вход по одноразовой ссылке. Оба эндпоинта ограничены по частоте: первый
	// шлёт письма на чужой адрес, второй — угадываемая цель.
	g.POST("/magic-link/request", d.AuthRateLimiter.Limit("magic-link-request"), d.Auth.RequestMagicLink)
	g.POST("/magic-link/consume", d.AuthRateLimiter.Limit("magic-link-consume"), d.Auth.ConsumeMagicLink)

	registerNativeAuthRoutes(g, d)
}

// registerNativeAuthRoutes wires the app's session: /auth/native/*.
//
// The refresh token travels in the body here and nowhere else; none of these
// handlers reads or sets the refresh cookie (see auth/native_session.go).
//
// Sign-in and the sign-in letter are limited per address and IP, with a
// per-IP ceiling ten times the web's: a mobile carrier's NAT puts hundreds of
// people behind one address, and an IP-only limit would make them share ten
// attempts.
func registerNativeAuthRoutes(auth *gin.RouterGroup, d Deps) {
	g := auth.Group("/native")

	g.POST("/login", d.AuthRateLimiter.Limit("native-login-ip"),
		d.AuthRateLimiter.LimitBy("native-login", middleware.ByEmailAndIP), d.Auth.NativeLogin)
	g.POST("/register", d.AuthRateLimiter.Limit("register"), d.Auth.NativeRegister)
	g.POST("/refresh", d.AuthRateLimiter.LimitBy("native-refresh", middleware.ByRefreshToken), d.Auth.NativeRefresh)
	// Без access-токена: приложение выходит и тогда, когда тот давно истёк.
	g.POST("/logout", d.Auth.NativeLogout)
	// Письмо то же, что у сайта: ссылка открывает приложение через universal
	// link, и оно гасит токен на native/magic-link/consume.
	g.POST("/magic-link/request", d.AuthRateLimiter.Limit("native-magic-link-ip"),
		d.AuthRateLimiter.LimitBy("native-magic-link-request", middleware.ByEmailAndIP), d.Auth.RequestMagicLink)
	g.POST("/magic-link/consume", d.AuthRateLimiter.Limit("magic-link-consume"), d.Auth.NativeConsumeMagicLink)
	g.POST("/change-password", middleware.RequireAuth(d.Cfg, d.TokenVersions), d.Auth.NativeChangePassword)
}
