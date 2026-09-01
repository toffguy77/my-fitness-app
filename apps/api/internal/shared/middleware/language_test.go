package middleware

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFromAcceptLanguage(t *testing.T) {
	cases := []struct {
		name   string
		header string
		want   string
	}{
		{"absent", "", "ru"},
		{"a language we speak", "en", "en"},
		{"a regional variant is the same language", "ru-RU", "ru"},
		// Reading left to right would answer this one in English, which is the
		// opposite of what the browser asked for.
		{"quality values decide, not order", "en;q=0.3, ru;q=0.9", "ru"},
		{"the first of equal weights wins", "en, ru", "en"},
		{"q=0 means not this one", "en;q=0, ru", "ru"},
		{"a language we do not speak falls back", "fr, de", "ru"},
		{"nonsense falls back rather than failing", ";;;", "ru"},
		{"a malformed quality is treated as full weight", "en;q=high", "en"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, FromAcceptLanguage(tc.header))
		})
	}
}
