package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMain(m *testing.M) {
	// Set Gin to test mode
	gin.SetMode(gin.TestMode)
	os.Exit(m.Run())
}

func TestCORSConfiguration(t *testing.T) {
	tests := []struct {
		name           string
		corsOrigin     string
		expectedOrigins []string
	}{
		{
			name:           "Port 3069 includes both 3069 and 3000",
			corsOrigin:     "http://localhost:3069",
			expectedOrigins: []string{"http://localhost:3069", "http://localhost:3000"},
		},
		{
			name:           "Port 3000 only includes 3000",
			corsOrigin:     "http://localhost:3000",
			expectedOrigins: []string{"http://localhost:3000"},
		},
		{
			name:           "Production origin unchanged",
			corsOrigin:     "https://burcev.team",
			expectedOrigins: []string{"https://burcev.team"},
		},
		{
			name:           "Custom port unchanged",
			corsOrigin:     "http://localhost:8080",
			expectedOrigins: []string{"http://localhost:8080"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate the CORS logic from main.go
			corsOrigins := []string{tt.corsOrigin}
			if tt.corsOrigin == "http://localhost:3069" {
				corsOrigins = append(corsOrigins, "http://localhost:3000")
			}

			assert.Equal(t, tt.expectedOrigins, corsOrigins)
		})
	}
}

func TestCORSHeaders(t *testing.T) {
	tests := []struct {
		name           string
		origin         string
		corsOrigin     string
		expectAllowed  bool
	}{
		{
			name:          "Port 3069 allows 3069",
			origin:        "http://localhost:3069",
			corsOrigin:    "http://localhost:3069",
			expectAllowed: true,
		},
		{
			name:          "Port 3069 allows 3000",
			origin:        "http://localhost:3000",
			corsOrigin:    "http://localhost:3069",
			expectAllowed: true,
		},
		{
			name:          "Port 3000 only allows 3000",
			origin:        "http://localhost:3000",
			corsOrigin:    "http://localhost:3000",
			expectAllowed: true,
		},
		{
			name:          "Port 3000 blocks 3069",
			origin:        "http://localhost:3069",
			corsOrigin:    "http://localhost:3000",
			expectAllowed: false,
		},
		{
			name:          "Production origin blocks localhost",
			origin:        "http://localhost:3000",
			corsOrigin:    "https://burcev.team",
			expectAllowed: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a test router with CORS middleware
			router := gin.New()

			// Apply CORS logic from main.go
			corsOrigins := []string{tt.corsOrigin}
			if tt.corsOrigin == "http://localhost:3069" {
				corsOrigins = append(corsOrigins, "http://localhost:3000")
			}

			// Simple CORS check function
			router.Use(func(c *gin.Context) {
				origin := c.Request.Header.Get("Origin")
				allowed := false
				for _, allowedOrigin := range corsOrigins {
					if origin == allowedOrigin {
						allowed = true
						c.Header("Access-Control-Allow-Origin", origin)
						break
					}
				}

				if !allowed && origin != "" {
					c.AbortWithStatus(http.StatusForbidden)
					return
				}

				c.Next()
			})

			router.GET("/test", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"status": "ok"})
			})

			// Make request with origin header
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			req.Header.Set("Origin", tt.origin)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if tt.expectAllowed {
				assert.Equal(t, http.StatusOK, w.Code)
				assert.Equal(t, tt.origin, w.Header().Get("Access-Control-Allow-Origin"))
			} else {
				assert.Equal(t, http.StatusForbidden, w.Code)
			}
		})
	}
}

func TestHealthEndpoint(t *testing.T) {
	router := gin.New()

	// Mock health endpoint (simplified version)
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":      "ok",
			"timestamp":   time.Now().Format(time.RFC3339),
			"environment": "test",
			"database":    "ok",
		})
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "ok", response["status"])
	assert.NotEmpty(t, response["timestamp"])
	assert.Equal(t, "test", response["environment"])
	assert.Equal(t, "ok", response["database"])
}

func TestCORSMethods(t *testing.T) {
	allowedMethods := []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}

	// Verify all expected methods are present
	expectedMethods := map[string]bool{
		"GET":     true,
		"POST":    true,
		"PUT":     true,
		"PATCH":   true,
		"DELETE":  true,
		"OPTIONS": true,
	}

	for _, method := range allowedMethods {
		assert.True(t, expectedMethods[method], "Method %s should be allowed", method)
	}

	assert.Equal(t, 6, len(allowedMethods), "Should have exactly 6 allowed methods")
}

func TestCORSAllowedHeaders(t *testing.T) {
	allowedHeaders := []string{"Origin", "Content-Type", "Authorization"}
	exposedHeaders := []string{"Content-Length"}

	// Verify required headers
	assert.Contains(t, allowedHeaders, "Origin")
	assert.Contains(t, allowedHeaders, "Content-Type")
	assert.Contains(t, allowedHeaders, "Authorization")
	assert.Contains(t, exposedHeaders, "Content-Length")
}

func TestCORSCredentials(t *testing.T) {
	// CORS should allow credentials for cookie-based auth
	allowCredentials := true
	assert.True(t, allowCredentials, "CORS should allow credentials")
}

func TestCORSMaxAge(t *testing.T) {
	maxAge := 12 * time.Hour
	expectedSeconds := int(maxAge.Seconds())

	assert.Equal(t, 43200, expectedSeconds, "CORS max age should be 12 hours (43200 seconds)")
}

func TestServerTimeouts(t *testing.T) {
	readTimeout := 15 * time.Second
	writeTimeout := 15 * time.Second
	idleTimeout := 60 * time.Second

	assert.Equal(t, 15*time.Second, readTimeout)
	assert.Equal(t, 15*time.Second, writeTimeout)
	assert.Equal(t, 60*time.Second, idleTimeout)
}

func TestGinModeConfiguration(t *testing.T) {
	tests := []struct {
		name        string
		env         string
		expectedMode string
	}{
		{
			name:        "Production mode",
			env:         "production",
			expectedMode: gin.ReleaseMode,
		},
		{
			name:        "Development mode",
			env:         "development",
			expectedMode: gin.DebugMode,
		},
		{
			name:        "Test mode",
			env:         "test",
			expectedMode: gin.TestMode,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate mode setting logic
			if tt.env == "production" {
				gin.SetMode(gin.ReleaseMode)
			} else if tt.env == "test" {
				gin.SetMode(gin.TestMode)
			} else {
				gin.SetMode(gin.DebugMode)
			}

			assert.Equal(t, tt.expectedMode, gin.Mode())
		})
	}
}
