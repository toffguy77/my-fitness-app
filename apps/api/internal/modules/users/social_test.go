package users

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSanitizeUsername(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"plain username", "ya_thatguy", "ya_thatguy"},
		{"with @", "@ya_thatguy", "ya_thatguy"},
		{"with spaces", "  @ya_thatguy  ", "ya_thatguy"},
		{"telegram URL", "https://t.me/ya_thatguy", "ya_thatguy"},
		{"telegram URL with @", "https://t.me/@ya_thatguy", "ya_thatguy"},
		{"instagram URL", "https://instagram.com/ya_thatguy", "ya_thatguy"},
		{"instagram URL www", "https://www.instagram.com/ya_thatguy/", "ya_thatguy"},
		{"multiple @", "@@ya_thatguy", "ya_thatguy"},
		{"empty", "", ""},
		{"only @", "@", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sanitizeUsername(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestValidateUsernameFormat(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid", "ya_thatguy", false},
		{"valid with dots", "user.name", false},
		{"valid with numbers", "user123", false},
		{"empty is ok", "", false},
		{"too long", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", true},
		{"invalid chars", "user name!", true},
		{"cyrillic", "пользователь", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateUsernameFormat(tt.input)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestSanitizeAndValidate_Integration(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"normal with @", "@ya_thatguy", "ya_thatguy", false},
		{"full URL", "https://t.me/ya_thatguy", "ya_thatguy", false},
		{"invalid after sanitize", "@user name!", "", true},
		{"empty", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleaned := sanitizeUsername(tt.input)
			err := validateUsernameFormat(cleaned)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.want, cleaned)
			}
		})
	}
}
