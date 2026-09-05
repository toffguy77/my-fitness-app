package middleware

import (
	"net/http"
	"strings"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// UserClaims represents JWT claims
type UserClaims struct {
	UserID int64  `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	// TokenVersion is the version the account had when this token was issued.
	// A token minted before a password change carries an older number and is
	// refused. Tokens issued before this field existed decode as 0, which is
	// also the version every account starts at — so the change does not sign
	// everybody out on deploy.
	TokenVersion int `json:"tv"`
	jwt.RegisteredClaims
}

// RequireAuth middleware validates JWT token.
//
// `versions` may be nil, which skips the version check — useful in tests that
// have no database and nothing to revoke.
func RequireAuth(cfg *config.Config, versions *TokenVersions) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get token from Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			response.Error(c, http.StatusUnauthorized, "Требуется заголовок авторизации")
			c.Abort()
			return
		}

		// Extract token
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			response.Error(c, http.StatusUnauthorized, "Неверный формат заголовка авторизации")
			c.Abort()
			return
		}

		tokenString := parts[1]

		// Parse and validate token
		token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			response.Error(c, http.StatusUnauthorized, "Неверный или истекший токен")
			c.Abort()
			return
		}

		// Extract claims
		if claims, ok := token.Claims.(*UserClaims); ok {
			if versions != nil {
				current, err := versions.Current(c.Request.Context(), claims.UserID)
				if err != nil {
					// Either the account is gone or the database is
					// unreachable. Neither is a request we should let through
					// on the strength of a signature alone.
					response.Error(c, http.StatusUnauthorized, "Сессия недействительна")
					c.Abort()
					return
				}
				if claims.TokenVersion != current {
					// Issued before a password change or an explicit sign-out
					// of every device.
					response.Error(c, http.StatusUnauthorized, "Сессия завершена, войдите заново")
					c.Abort()
					return
				}
			}

			c.Set("user_id", claims.UserID)
			c.Set("user_email", claims.Email)
			c.Set("user_role", claims.Role)
		} else {
			response.Error(c, http.StatusUnauthorized, "Неверные данные токена")
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequireRole middleware checks user role
func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userRole, exists := c.Get("user_role")
		if !exists {
			response.Error(c, http.StatusUnauthorized, "Роль пользователя не найдена")
			c.Abort()
			return
		}

		role := userRole.(string)
		for _, allowedRole := range roles {
			if role == allowedRole {
				c.Next()
				return
			}
		}

		response.Error(c, http.StatusForbidden, "Недостаточно прав")
		c.Abort()
	}
}
