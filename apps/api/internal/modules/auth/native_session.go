package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/response"
	"github.com/burcev/api/internal/shared/telemetry"
	"github.com/gin-gonic/gin"
)

// Сессия нативного приложения: /api/v1/auth/native/*.
//
// Refresh-токен здесь ездит только в теле — в запросе и в ответе. Cookie
// refresh_token эти обработчики не читают и не ставят: приложение хранит
// токен в Keychain, а не в HTTPCookieStorage, который не переживает выгрузку
// и не делится с ASWebAuthenticationSession.
//
// Так XSS на сайте не получает через эти пути веб-сессию: чтобы обменять
// что-то на токен в теле, скрипту нужен сам токен (он в HttpOnly-cookie,
// а cookie здесь игнорируется), пароль или код из письма. Отдельная группа,
// а не заголовок X-Client на общих эндпоинтах, ровно поэтому — заголовок
// поставит и скрипт на странице.

// DeviceUnregisterer forgets a phone's push token. Declared here as the
// narrowest thing auth needs, so auth does not depend on the notifications
// module; *notifications.Service satisfies it.
type DeviceUnregisterer interface {
	UnregisterDevice(ctx context.Context, userID int64, token string) error
}

// WithDevices attaches the push registry native sign-out forgets the phone in.
// Optional: without it sign-out still ends the session.
func (h *Handler) WithDevices(devices DeviceUnregisterer) *Handler {
	h.devices = devices
	return h
}

// NativeSessionResponse is the body of every native sign-in.
//
// Unlike LoginResult the refresh token is in it: the app has nowhere else to
// receive it from.
type NativeSessionResponse struct {
	// Status is set by the provider sign-ins (Apple, oauth/exchange,
	// oauth/link, consents): signed_in or registered, so one response type
	// tells a session from {status, pending_token}.
	Status       string `json:"status,omitempty"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	// ExpiresIn and RefreshExpiresIn are seconds from now.
	ExpiresIn        int              `json:"expires_in"`
	RefreshExpiresIn int              `json:"refresh_expires_in"`
	User             *User            `json:"user"`
	PendingDeletion  *PendingDeletion `json:"pending_deletion,omitempty"`
	// Created is set by native/magic-link/consume: true when the letter
	// produced a new account.
	Created *bool `json:"created,omitempty"`
}

func (h *Handler) nativeSession(result *LoginResult) NativeSessionResponse {
	return nativeSessionBody(result)
}

func nativeSessionBody(result *LoginResult) NativeSessionResponse {
	refreshIn := int(time.Until(result.RefreshExpiresAt).Seconds())
	if result.RefreshExpiresAt.IsZero() || refreshIn < 0 {
		refreshIn = 0
	}
	return NativeSessionResponse{
		AccessToken:      result.Token,
		RefreshToken:     result.RefreshToken,
		ExpiresIn:        int(AccessTokenTTL.Seconds()),
		RefreshExpiresIn: refreshIn,
		User:             result.User,
		PendingDeletion:  result.PendingDeletion,
	}
}

// NativeLoginRequest — вход по паролю из приложения.
type NativeLoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
	// DeviceName — модель телефона («iPhone 15»), без имени владельца.
	DeviceName string `json:"device_name"`
}

// NativeRegisterRequest — регистрация из приложения.
type NativeRegisterRequest struct {
	Email      string         `json:"email" binding:"required,email"`
	Password   string         `json:"password" binding:"required,min=8,max=128"`
	Name       string         `json:"name"`
	Consents   *ConsentsInput `json:"consents"`
	LeadToken  string         `json:"lead_token"`
	DeviceName string         `json:"device_name"`
}

// NativeRefreshRequest — обновление и выход: токен только из тела.
type NativeRefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// NativeLogoutRequest — выход из приложения.
type NativeLogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
	// DeviceToken — APNs-токен этого телефона, если он подписан на пуши:
	// следующий человек с этим телефоном не должен получать чужие уведомления.
	DeviceToken string `json:"device_token"`
}

// NativeMagicLinkConsumeRequest — вход по ссылке из письма, открытой в приложении.
type NativeMagicLinkConsumeRequest struct {
	Token      string `json:"token"`
	LeadToken  string `json:"lead_token"`
	DeviceName string `json:"device_name"`
}

// NativeChangePasswordRequest — смена пароля из приложения.
type NativeChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8,max=128"`
	DeviceName      string `json:"device_name"`
}

// NativeLogin handles POST /api/v1/auth/native/login.
func (h *Handler) NativeLogin(c *gin.Context) {
	var req NativeLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation, "Укажите почту и пароль")
		return
	}

	result, err := h.service.LoginFor(c.Request.Context(), NativeSession(req.DeviceName),
		req.Email, req.Password, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		telemetry.Record(telemetry.EventLoginFailed)
		if errors.Is(err, apperrors.ErrInvalidCredentials) {
			response.Fail(c, http.StatusUnauthorized, err, "Неверная почта или пароль")
			return
		}
		h.log.Errorw("Native login failed", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось войти")
		return
	}

	telemetry.Record(telemetry.EventLoginSucceeded)
	if h.analytics != nil {
		h.analytics.RecordServerEvent(c.Request.Context(), "signed_in", result.User.ID,
			map[string]any{"method": "password", "client": string(ClientIOS)})
	}
	response.Success(c, http.StatusOK, h.nativeSession(result))
}

// NativeRegister handles POST /api/v1/auth/native/register.
func (h *Handler) NativeRegister(c *gin.Context) {
	var req NativeRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation, "Проверьте почту и пароль")
		return
	}

	result, err := h.service.RegisterFor(c.Request.Context(), NativeSession(req.DeviceName),
		req.Email, req.Password, req.Name, c.ClientIP(), c.Request.UserAgent(), req.Consents)
	if err != nil {
		var policy *PolicyError
		switch {
		case errors.As(err, &policy):
			response.ErrorCode(c, http.StatusUnprocessableEntity,
				apperrors.CodePasswordPolicy, policy.ForPerson(), nil)
		case errors.Is(err, apperrors.ErrConflict):
			response.ErrorCode(c, http.StatusConflict, apperrors.CodeConflict,
				"Этот адрес уже зарегистрирован. Попробуйте войти или восстановить пароль.", nil)
		default:
			h.log.Errorw("Native registration failed", "error", err)
			response.Fail(c, http.StatusInternalServerError, err, "Не удалось зарегистрировать. Попробуйте позже.")
		}
		return
	}

	carryArrival(c, h.leads, h.log, result.User.ID, req.LeadToken)
	telemetry.Record(telemetry.EventUserRegistered)
	h.recordSignUp(c, "", result.User.ID)

	if h.verificationService != nil {
		if err := h.verificationService.SendCode(c.Request.Context(), result.User.ID, result.User.Email, c.ClientIP(), c.Request.UserAgent()); err != nil {
			h.log.Errorw("Failed to send verification code after registration", "error", err, "user_id", result.User.ID)
		}
	}

	response.Success(c, http.StatusCreated, h.nativeSession(result))
}

// NativeRefresh handles POST /api/v1/auth/native/refresh.
//
// The cookie is ignored even when it is there: a request with a browser's
// cookie and no body is a page script trying to turn the web session into a
// token it can read, and it gets a validation error, not a rotation.
func (h *Handler) NativeRefresh(c *gin.Context) {
	var req NativeRefreshRequest
	_ = c.ShouldBindJSON(&req)
	token := strings.TrimSpace(req.RefreshToken)
	if token == "" {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation, "Нет refresh_token в теле запроса")
		return
	}

	result, err := h.service.RefreshTokensFor(c.Request.Context(), ClientIOS, token, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		h.failNativeRefresh(c, err)
		return
	}
	response.Success(c, http.StatusOK, h.nativeSession(result))
}

// failNativeRefresh tells the app which of three things happened, because each
// asks for something different: token_expired and token_invalid mean "sign in
// again" quietly, session_ended means somebody else ended it — a password
// change or a stolen token — and the app says so.
func (h *Handler) failNativeRefresh(c *gin.Context, err error) {
	switch {
	case errors.Is(err, apperrors.ErrSessionEnded):
		response.Fail(c, http.StatusUnauthorized, err, "Сессия завершена, войдите заново")
	case errors.Is(err, apperrors.ErrTokenExpired):
		response.Fail(c, http.StatusUnauthorized, err, "Сессия истекла, войдите заново")
	case errors.Is(err, apperrors.ErrTokenInvalid):
		response.Fail(c, http.StatusUnauthorized, err, "Сессия недействительна, войдите заново")
	default:
		h.log.Errorw("Native token refresh failed", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось обновить сессию")
	}
}

// NativeLogout handles POST /api/v1/auth/native/logout.
//
// No access token is required: the app signs out also when its access token
// has long expired, and the refresh token is proof enough of whose session
// this is. A token already revoked still answers 204 — signing out twice is
// still signing out.
func (h *Handler) NativeLogout(c *gin.Context) {
	var req NativeLogoutRequest
	_ = c.ShouldBindJSON(&req)
	token := strings.TrimSpace(req.RefreshToken)
	if token == "" {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation, "Нет refresh_token в теле запроса")
		return
	}

	userID, found, err := h.service.EndNativeSession(c.Request.Context(), token)
	if err != nil {
		h.log.Errorw("Failed to revoke native session on logout", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось выйти")
		return
	}
	if found && req.DeviceToken != "" && h.devices != nil {
		// Best effort: the session is already over, and failing sign-out over
		// a push row would leave the person signed in in their own eyes.
		if err := h.devices.UnregisterDevice(c.Request.Context(), userID, req.DeviceToken); err != nil {
			h.log.Errorw("Failed to forget the device on native logout", "error", err, "user_id", userID)
		}
	}
	c.Status(http.StatusNoContent)
}

// NativeConsumeMagicLink handles POST /api/v1/auth/native/magic-link/consume.
//
// The letter is the same one the site sends: the link opens the app through
// the universal link /auth/link/consume, and the app posts its token here.
func (h *Handler) NativeConsumeMagicLink(c *gin.Context) {
	var req NativeMagicLinkConsumeRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Token == "" {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrTokenInvalid, "Ссылка не подходит — запросите новую")
		return
	}

	result, created, err := h.service.ConsumeMagicLinkFor(c.Request.Context(), NativeSession(req.DeviceName),
		req.Token, c.ClientIP(), c.Request.UserAgent())
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrTokenInvalid):
		response.Fail(c, http.StatusBadRequest, err, "Ссылка не подходит — запросите новую")
		return
	case errors.Is(err, apperrors.ErrConflict):
		response.ErrorCode(c, http.StatusConflict, apperrors.CodeMagicLinkAccountExists,
			"Этот адрес уже зарегистрирован. Запросите ссылку для входа ещё раз.", nil)
		return
	default:
		h.log.Errorw("Failed to consume magic link from the app", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось войти")
		return
	}

	if created {
		carryArrival(c, h.leads, h.log, result.User.ID, req.LeadToken)
	}

	body := h.nativeSession(result)
	body.Created = &created
	response.Success(c, http.StatusOK, body)
}

// NativeChangePassword handles POST /api/v1/auth/native/change-password.
//
// Every session ends, the app's own included; the reply carries a new native
// pair for the phone that asked, so changing a password does not sign its
// owner out of the device in their hand.
func (h *Handler) NativeChangePassword(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		response.Fail(c, http.StatusUnauthorized, apperrors.ErrUnauthorized, "Требуется авторизация")
		return
	}

	var req NativeChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation, "Неверные данные запроса")
		return
	}

	var replacement LoginResult
	err := h.service.ChangePasswordFor(c.Request.Context(), NativeSession(req.DeviceName),
		userID.(int64), req.CurrentPassword, req.NewPassword, &replacement)
	if err != nil {
		var policy *PolicyError
		switch {
		case errors.Is(err, apperrors.ErrInvalidCredentials):
			response.ErrorCode(c, http.StatusUnauthorized,
				apperrors.CodePasswordIncorrect, "Неверный текущий пароль", nil)
		case errors.Is(err, apperrors.ErrConflict):
			response.ErrorCode(c, http.StatusConflict, apperrors.CodePasswordNotSet,
				"У этого аккаунта нет пароля: вход выполняется через внешний сервис или по ссылке.", nil)
		case errors.Is(err, apperrors.ErrPasswordUnchanged):
			response.Fail(c, http.StatusUnprocessableEntity, err, "Новый пароль должен отличаться от текущего")
		case errors.As(err, &policy):
			response.ErrorCode(c, http.StatusUnprocessableEntity,
				apperrors.CodePasswordPolicy, policy.ForPerson(), nil)
		default:
			h.log.Errorw("Native password change failed", "error", err, "user_id", userID)
			response.Fail(c, http.StatusInternalServerError, err, "Не удалось изменить пароль")
		}
		return
	}

	response.Success(c, http.StatusOK, h.nativeSession(&replacement))
}
