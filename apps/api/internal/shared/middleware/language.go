package middleware

import (
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// ContextLanguage is where the resolved language lives.
const ContextLanguage = "language"

// Supported languages, in the order they are preferred when a client asks for
// several with equal weight.
var supported = []string{"ru", "en"}

// DefaultLanguage is what a request gets when it expresses no preference.
const DefaultLanguage = "ru"

// Language resolves the language for a request.
//
// Order: what the client asked for, then the default. A signed-in user's stored
// preference wins over both, but it lives in the database and this middleware
// does not query — handlers that already load the profile override the value.
func Language() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(ContextLanguage, FromAcceptLanguage(c.GetHeader("Accept-Language")))
		c.Next()
	}
}

// LanguageOf returns the language resolved for this request.
func LanguageOf(c *gin.Context) string {
	if value, ok := c.Get(ContextLanguage); ok {
		if language, ok := value.(string); ok && language != "" {
			return language
		}
	}
	return DefaultLanguage
}

// FromAcceptLanguage picks the best supported language from a header.
//
// Parses quality values rather than taking the first tag: a browser sending
// "en;q=0.3, ru;q=0.9" is asking for Russian, and reading left to right would
// give it English.
func FromAcceptLanguage(header string) string {
	if header == "" {
		return DefaultLanguage
	}

	type preference struct {
		tag     string
		quality float64
		order   int
	}

	var preferences []preference
	for index, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		tag, quality := part, 1.0
		if semicolon := strings.Index(part, ";"); semicolon >= 0 {
			tag = strings.TrimSpace(part[:semicolon])
			for _, parameter := range strings.Split(part[semicolon+1:], ";") {
				parameter = strings.TrimSpace(parameter)
				if value, found := strings.CutPrefix(parameter, "q="); found {
					if parsed, err := strconv.ParseFloat(value, 64); err == nil {
						quality = parsed
					}
				}
			}
		}

		// "ru-RU" and "ru" are the same language to us.
		if dash := strings.Index(tag, "-"); dash > 0 {
			tag = tag[:dash]
		}
		preferences = append(preferences, preference{
			tag: strings.ToLower(tag), quality: quality, order: index,
		})
	}

	sort.SliceStable(preferences, func(i, j int) bool {
		if preferences[i].quality != preferences[j].quality {
			return preferences[i].quality > preferences[j].quality
		}
		return preferences[i].order < preferences[j].order
	})

	for _, preference := range preferences {
		if preference.quality <= 0 {
			// q=0 means "not this one".
			continue
		}
		for _, language := range supported {
			if preference.tag == language {
				return language
			}
		}
	}

	return DefaultLanguage
}
