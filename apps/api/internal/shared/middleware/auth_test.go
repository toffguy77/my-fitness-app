package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
)

func TestAuthMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	secret := "test-secret"

	// Helper to generate valid token
	generateToken := func(userID, email, role string) string {
		claims := jwt.MapClaims{
			"user_id": userID,
			"email":   email,
			"role":    role,
			"exp":     time.Now().Add(time.Hour).Unix(),
			"iat":     time.Now().Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(secret))
		return tokenString
	}

	tests := []struct {
		name           string
		token          string
		expectedStatus int
		checkContext   func(t *testing.T, c *gin.Context)
	}{
		{
			name:           "valid token",
			token:          generateToken("user-123", "test@example.com", "client"),
			expectedStatus: http.StatusOK,
			checkContext: func(t *testing.T, c *gin.Context) {
				userID, exists := c.Get("user_id")
				assert.True(t, exists)
				assert.Equal(t, "user-123", userID)

				email, exists := c.Get("user_email")
				assert.True(t, exists)
				assert.Equal(t, "test@example.com", email)

				role, exists := c.Get("user_role")
				assert.True(t, exists)
				assert.Equal(t, "client", role)
			},
		},
		{
			name:           "missing token",
			token:          "",
			expectedStatus: http.StatusUnauthorized,
			checkContext:   nil,
		},
		{
			name:           "invalid token format",
			token:          "invalid-token",
			expectedStatus: http.StatusUnauthorized,
			checkContext:   nil,
		},
		{
			name: "expired token",
			token: func() string {
				claims := jwt.MapClaims{
					"user_id": "user-123",
					"email":   "test@example.com",
					"role":    "client",
					"exp":     time.Now().Add(-time.Hour).Unix(), // Expired
					"iat":     time.Now().Add(-2 * time.Hour).Unix(),
				}
				token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
				tokenString, _ := token.SignedString([]byte(secret))
				return tokenString
			}(),
			expectedStatus: http.StatusUnauthorized,
			checkContext:   nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, r := gin.CreateTestContext(w)

			// Setup middleware
			r.Use(AuthMiddleware(secret))
			r.GET("/test", func(c *gin.Context) {
				if tt.checkContext != nil {
					tt.checkContext(t, c)
				}
				c.JSON(http.StatusOK, gin.H{"message": "success"})
			})

			// Create request
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tt.token != "" {
				req.Header.Set("Authorization", "Bearer "+tt.token)
			}

			r.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)
		})
	}
}

func TestRoleMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		userRole       string
		allowedRoles   []string
		expectedStatus int
	}{
		{
			name:           "allowed role",
			userRole:       "admin",
			allowedRoles:   []string{"admin", "coordinator"},
			expectedStatus: http.StatusOK,
		},
		{
			name:           "forbidden role",
			userRole:       "client",
			allowedRoles:   []string{"admin", "coordinator"},
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "missing role in context",
			userRole:       "",
			allowedRoles:   []string{"admin"},
			expectedStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, r := gin.CreateTestContext(w)

			// Setup middleware
			r.Use(func(c *gin.Context) {
				if tt.userRole != "" {
					c.Set("user_role", tt.userRole)
				}
				c.Next()
			})
			r.Use(RoleMiddleware(tt.allowedRoles...))
			r.GET("/test", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"message": "success"})
			})

			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			r.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)
		})
	}
}
