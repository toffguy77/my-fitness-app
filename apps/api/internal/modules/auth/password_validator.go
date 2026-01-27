package auth

import (
	"unicode"
)

// PasswordValidator validates passwords against security requirements.
// It checks for minimum length, character type requirements (uppercase,
// lowercase, numbers, special characters), and returns detailed validation
// errors to help users create secure passwords.
type PasswordValidator struct {
	minLength      int
	requireUpper   bool
	requireLower   bool
	requireNumber  bool
	requireSpecial bool
}

// ValidationResult contains the result of password validation.
// It includes a boolean indicating overall validity and a slice
// of specific error messages for each failed requirement.
type ValidationResult struct {
	Valid  bool     // True if password meets all requirements
	Errors []string // List of specific validation errors
}

// NewPasswordValidator creates a new PasswordValidator with default settings.
// Default requirements:
//   - Minimum 8 characters
//   - At least one uppercase letter
//   - At least one lowercase letter
//   - At least one number
//   - At least one special character
//
// These defaults align with OWASP password security recommendations.
func NewPasswordValidator() *PasswordValidator {
	return &PasswordValidator{
		minLength:      8,
		requireUpper:   true,
		requireLower:   true,
		requireNumber:  true,
		requireSpecial: true,
	}
}

// Validate checks if a password meets all security requirements.
// It returns a ValidationResult containing the overall validity status
// and detailed error messages for each failed requirement.
//
// Parameters:
//   - password: The password string to validate
//
// Returns:
//   - ValidationResult with Valid=true if all requirements are met,
//     or Valid=false with a list of specific error messages
//
// Example:
//   pv := NewPasswordValidator()
//   result := pv.Validate("weak")
//   if !result.Valid {
//       for _, err := range result.Errors {
//           fmt.Println(err)
//       }
//   }
func (pv *PasswordValidator) Validate(password string) ValidationResult {
	var errors []string

	// Check minimum length
	if len(password) < pv.minLength {
		errors = append(errors, "Пароль должен содержать минимум 8 символов")
	}

	// Check for uppercase letter
	if pv.requireUpper && !containsUppercase(password) {
		errors = append(errors, "Пароль должен содержать хотя бы одну заглавную букву")
	}

	// Check for lowercase letter
	if pv.requireLower && !containsLowercase(password) {
		errors = append(errors, "Пароль должен содержать хотя бы одну строчную букву")
	}

	// Check for number
	if pv.requireNumber && !containsNumber(password) {
		errors = append(errors, "Пароль должен содержать хотя бы одну цифру")
	}

	// Check for special character
	if pv.requireSpecial && !containsSpecialChar(password) {
		errors = append(errors, "Пароль должен содержать хотя бы один специальный символ")
	}

	return ValidationResult{
		Valid:  len(errors) == 0,
		Errors: errors,
	}
}

// containsUppercase checks if the string contains at least one uppercase letter.
func containsUppercase(s string) bool {
	for _, r := range s {
		if unicode.IsUpper(r) {
			return true
		}
	}
	return false
}

// containsLowercase checks if the string contains at least one lowercase letter.
func containsLowercase(s string) bool {
	for _, r := range s {
		if unicode.IsLower(r) {
			return true
		}
	}
	return false
}

// containsNumber checks if the string contains at least one numeric digit.
func containsNumber(s string) bool {
	for _, r := range s {
		if unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

// containsSpecialChar checks if the string contains at least one special character.
// Special characters are defined as any character that is not a letter or digit.
func containsSpecialChar(s string) bool {
	for _, r := range s {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && !unicode.IsSpace(r) {
			return true
		}
	}
	return false
}
