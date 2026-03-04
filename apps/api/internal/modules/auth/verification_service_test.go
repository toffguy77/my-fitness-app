package auth

import (
	"testing"
)

func TestGenerateCode(t *testing.T) {
	code, err := generateCode()
	if err != nil {
		t.Fatalf("generateCode() error: %v", err)
	}
	if len(code) != 6 {
		t.Errorf("expected 6-digit code, got %q (len %d)", code, len(code))
	}
	for _, c := range code {
		if c < '0' || c > '9' {
			t.Errorf("expected only digits, got %q", code)
			break
		}
	}
}

func TestHashCode(t *testing.T) {
	h1 := hashCode("123456")
	h2 := hashCode("123456")
	h3 := hashCode("654321")

	if h1 != h2 {
		t.Error("same input should produce same hash")
	}
	if h1 == h3 {
		t.Error("different input should produce different hash")
	}
	if len(h1) != 64 {
		t.Errorf("expected 64 char hex hash, got len %d", len(h1))
	}
}

func TestGenerateCodeUniqueness(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		code, err := generateCode()
		if err != nil {
			t.Fatalf("generateCode() error: %v", err)
		}
		seen[code] = true
	}
	if len(seen) < 90 {
		t.Errorf("expected mostly unique codes, got %d unique out of 100", len(seen))
	}
}
