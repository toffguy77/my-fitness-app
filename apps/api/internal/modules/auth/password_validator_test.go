package auth

import (
	"testing"
)

func TestNewPasswordValidator(t *testing.T) {
	pv := NewPasswordValidator()

	if pv.minLength != 8 {
		t.Errorf("Expected minLength to be 8, got %d", pv.minLength)
	}
	if !pv.requireUpper {
		t.Error("Expected requireUpper to be true")
	}
	if !pv.requireLower {
		t.Error("Expected requireLower to be true")
	}
	if !pv.requireNumber {
		t.Error("Expected requireNumber to be true")
	}
	if !pv.requireSpecial {
		t.Error("Expected requireSpecial to be true")
	}
}

func TestPasswordValidator_Validate(t *testing.T) {
	pv := NewPasswordValidator()

	tests := []struct {
		name          string
		password      string
		expectValid   bool
		expectErrors  []string
	}{
		{
			name:         "Valid password with all requirements",
			password:     "SecureP@ss123",
			expectValid:  true,
			expectErrors: []string{},
		},
		{
			name:         "Valid password with special chars",
			password:     "MyP@ssw0rd!",
			expectValid:  true,
			expectErrors: []string{},
		},
		{
			name:         "Valid password with underscore",
			password:     "Valid_Pass123",
			expectValid:  true,
			expectErrors: []string{},
		},
		{
			name:        "Too short password",
			password:    "Sh0rt!",
			expectValid: false,
			expectErrors: []string{
				"Password must be at least 8 characters long",
			},
		},
		{
			name:        "Missing uppercase",
			password:    "lowercase123!",
			expectValid: false,
			expectErrors: []string{
				"Password must contain at least one uppercase letter",
			},
		},
		{
			name:        "Missing lowercase",
			password:    "UPPERCASE123!",
			expectValid: false,
			expectErrors: []string{
				"Password must contain at least one lowercase letter",
			},
		},
		{
			name:        "Missing number",
			password:    "NoNumbers!",
			expectValid: false,
			expectErrors: []string{
				"Password must contain at least one number",
			},
		},
		{
			name:        "Missing special character",
			password:    "NoSpecial123",
			expectValid: false,
			expectErrors: []string{
				"Password must contain at least one special character",
			},
		},
		{
			name:        "Multiple missing requirements",
			password:    "short",
			expectValid: false,
			expectErrors: []string{
				"Password must be at least 8 characters long",
				"Password must contain at least one uppercase letter",
				"Password must contain at least one number",
				"Password must contain at least one special character",
			},
		},
		{
			name:        "All lowercase no special chars",
			password:    "alllowercase",
			expectValid: false,
			expectErrors: []string{
				"Password must contain at least one uppercase letter",
				"Password must contain at least one number",
				"Password must contain at least one special character",
			},
		},
		{
			name:        "Empty password",
			password:    "",
			expectValid: false,
			expectErrors: []string{
				"Password must be at least 8 characters long",
				"Password must contain at least one uppercase letter",
				"Password must contain at least one lowercase letter",
				"Password must contain at least one number",
				"Password must contain at least one special character",
			},
		},
		{
			name:         "Password with multiple special characters",
			password:     "P@ssw0rd!#$",
			expectValid:  true,
			expectErrors: []string{},
		},
		{
			name:         "Password with hyphen",
			password:     "Pass-word123",
			expectValid:  true,
			expectErrors: []string{},
		},
		{
			name:         "Password with dot",
			password:     "Pass.word123",
			expectValid:  true,
			expectErrors: []string{},
		},
		{
			name:        "Only special characters",
			password:    "!@#$%^&*()",
			expectValid: false,
			expectErrors: []string{
				"Password must contain at least one uppercase letter",
				"Password must contain at least one lowercase letter",
				"Password must contain at least one number",
			},
		},
		{
			name:        "Only numbers",
			password:    "12345678",
			expectValid: false,
			expectErrors: []string{
				"Password must contain at least one uppercase letter",
				"Password must contain at least one lowercase letter",
				"Password must contain at least one special character",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := pv.Validate(tt.password)

			if result.Valid != tt.expectValid {
				t.Errorf("Expected Valid=%v, got %v", tt.expectValid, result.Valid)
			}

			if len(result.Errors) != len(tt.expectErrors) {
				t.Errorf("Expected %d errors, got %d errors: %v",
					len(tt.expectErrors), len(result.Errors), result.Errors)
			}

			// Check that all expected errors are present
			for _, expectedErr := range tt.expectErrors {
				found := false
				for _, actualErr := range result.Errors {
					if actualErr == expectedErr {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("Expected error '%s' not found in result errors: %v",
						expectedErr, result.Errors)
				}
			}
		})
	}
}

func TestContainsUppercase(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"Has uppercase", "Hello", true},
		{"No uppercase", "hello", false},
		{"Only uppercase", "HELLO", true},
		{"Empty string", "", false},
		{"Mixed with numbers", "hello123", false},
		{"Mixed with uppercase", "Hello123", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := containsUppercase(tt.input)
			if result != tt.expected {
				t.Errorf("containsUppercase(%q) = %v, expected %v",
					tt.input, result, tt.expected)
			}
		})
	}
}

func TestContainsLowercase(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"Has lowercase", "Hello", true},
		{"No lowercase", "HELLO", false},
		{"Only lowercase", "hello", true},
		{"Empty string", "", false},
		{"Mixed with numbers", "HELLO123", false},
		{"Mixed with lowercase", "HELLO123world", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := containsLowercase(tt.input)
			if result != tt.expected {
				t.Errorf("containsLowercase(%q) = %v, expected %v",
					tt.input, result, tt.expected)
			}
		})
	}
}

func TestContainsNumber(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"Has number", "Hello123", true},
		{"No number", "Hello", false},
		{"Only numbers", "123456", true},
		{"Empty string", "", false},
		{"Number at start", "1Hello", true},
		{"Number at end", "Hello1", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := containsNumber(tt.input)
			if result != tt.expected {
				t.Errorf("containsNumber(%q) = %v, expected %v",
					tt.input, result, tt.expected)
			}
		})
	}
}

func TestContainsSpecialChar(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"Has special char", "Hello!", true},
		{"No special char", "Hello123", false},
		{"Only special chars", "!@#$%", true},
		{"Empty string", "", false},
		{"With underscore", "Hello_World", true},
		{"With hyphen", "Hello-World", true},
		{"With dot", "Hello.World", true},
		{"With at sign", "Hello@World", true},
		{"With space (not special)", "Hello World", false},
		{"Multiple spaces", "   ", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := containsSpecialChar(tt.input)
			if result != tt.expected {
				t.Errorf("containsSpecialChar(%q) = %v, expected %v",
					tt.input, result, tt.expected)
			}
		})
	}
}

// Benchmark tests to ensure validation is performant
func BenchmarkPasswordValidator_Validate(b *testing.B) {
	pv := NewPasswordValidator()
	password := "SecureP@ss123"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		pv.Validate(password)
	}
}

func BenchmarkPasswordValidator_ValidateComplex(b *testing.B) {
	pv := NewPasswordValidator()
	password := "VeryC0mpl3x!P@ssw0rd#With$Many%Special^Chars&"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		pv.Validate(password)
	}
}
