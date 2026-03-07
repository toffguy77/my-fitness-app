package middleware

import "github.com/gin-gonic/gin"

// NoCacheAPI sets headers to prevent proxies and browsers from caching API responses.
func NoCacheAPI() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")
		c.Next()
	}
}
