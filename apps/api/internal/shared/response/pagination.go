package response

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

// Page bounds a collection request.
type Page struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

const (
	// DefaultLimit applies when the client asks for nothing in particular.
	DefaultLimit = 20
	// MaxLimit caps what a client can ask for. A request above it is clamped
	// rather than rejected: the client still gets data and a total, and
	// existing callers that passed a large number keep working.
	MaxLimit = 100
)

// ParsePage reads limit and offset from the query string.
//
// Malformed values fall back to the defaults instead of failing the request:
// pagination parameters are a detail of how the caller asks, and a typo in one
// should not deny them their data.
func ParsePage(c *gin.Context) Page {
	page := Page{Limit: DefaultLimit}

	if raw := c.Query("limit"); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil && value > 0 {
			page.Limit = min(value, MaxLimit)
		}
	}
	if raw := c.Query("offset"); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil && value > 0 {
			page.Offset = value
		}
	}

	return page
}

// Collection is the response shape for a paginated list. Total is what lets a
// client know there is more without probing.
type Collection[T any] struct {
	Items  []T `json:"items"`
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

// Paginated builds a collection response, normalising a nil slice to an empty
// array so clients never have to handle null.
func Paginated[T any](items []T, total int, page Page) Collection[T] {
	if items == nil {
		items = []T{}
	}
	return Collection[T]{Items: items, Total: total, Limit: page.Limit, Offset: page.Offset}
}
