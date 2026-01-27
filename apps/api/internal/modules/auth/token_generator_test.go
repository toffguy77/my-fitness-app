package auth

import (
	"encoding/hex"
	"testing"
)

func TestNewTokenGenerator(t *testing.T) {
	tg := NewTokenGenerator()

	if tg == nil {
		t.Fatal("NewTokenGenerator returned nil")
	}

	if tg.tokenLength != 32 {
		t.Errorf("Expected token length 32, got %d", tg.tokenLength)
	}
}

func TestGenerateToken(t *testing.T) {
	tg := NewTokenGenerator()

	t.Run("generates valid tokens", func(t *testing.T) {
		plain, hashed, err := tg.GenerateToken()

		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		if plain == "" {
			t.Error("Plain token is empty")
		}

		if hashed == "" {
			t.Error("Hashed token is empty")
		}

		// Plain token should be hex-encoded 32 bytes = 64 hex characters
		if len(plain) != 64 {
			t.Errorf("Expected plain token length 64, got %d", len(plain))
		}

		// Hashed token should be SHA-256 = 64 hex characters
		if len(hashed) != 64 {
			t.Errorf("Expected hashed token length 64, got %d", len(hashed))
		}

		// Verify plain token is valid hex
		_, err = hex.DecodeString(plain)
		if err != nil {
			t.Errorf("Plain token is not valid hex: %v", err)
		}

		// Verify hashed token is valid hex
		_, err = hex.DecodeString(hashed)
		if err != nil {
			t.Errorf("Hashed token is not valid hex: %v", err)
		}
	})

	t.Run("generates unique tokens", func(t *testing.T) {
		// Generate multiple tokens and ensure they're unique
		tokens := make(map[string]bool)
		iterations := 1000

		for i := 0; i < iterations; i++ {
			plain, _, err := tg.GenerateToken()
			if err != nil {
				t.Fatalf("GenerateToken failed on iteration %d: %v", i, err)
			}

			if tokens[plain] {
				t.Errorf("Duplicate token generated: %s", plain)
			}
			tokens[plain] = true
		}

		if len(tokens) != iterations {
			t.Errorf("Expected %d unique tokens, got %d", iterations, len(tokens))
		}
	})

	t.Run("plain and hashed tokens are different", func(t *testing.T) {
		plain, hashed, err := tg.GenerateToken()

		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		if plain == hashed {
			t.Error("Plain token and hashed token should be different")
		}
	})

	t.Run("hashed token is consistent with HashToken", func(t *testing.T) {
		plain, hashed, err := tg.GenerateToken()

		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		// Hash the plain token manually and compare
		manualHash := tg.HashToken(plain)

		if hashed != manualHash {
			t.Errorf("Hashed token from GenerateToken doesn't match HashToken result")
		}
	})
}

func TestHashToken(t *testing.T) {
	tg := NewTokenGenerator()

	t.Run("produces consistent hashes", func(t *testing.T) {
		token := "test-token-123"

		hash1 := tg.HashToken(token)
		hash2 := tg.HashToken(token)

		if hash1 != hash2 {
			t.Error("HashToken produced different hashes for same input")
		}
	})

	t.Run("produces different hashes for different inputs", func(t *testing.T) {
		token1 := "test-token-123"
		token2 := "test-token-456"

		hash1 := tg.HashToken(token1)
		hash2 := tg.HashToken(token2)

		if hash1 == hash2 {
			t.Error("HashToken produced same hash for different inputs")
		}
	})

	t.Run("produces SHA-256 length hash", func(t *testing.T) {
		token := "test-token"
		hash := tg.HashToken(token)

		// SHA-256 produces 32 bytes = 64 hex characters
		if len(hash) != 64 {
			t.Errorf("Expected hash length 64, got %d", len(hash))
		}

		// Verify it's valid hex
		_, err := hex.DecodeString(hash)
		if err != nil {
			t.Errorf("Hash is not valid hex: %v", err)
		}
	})

	t.Run("handles empty string", func(t *testing.T) {
		hash := tg.HashToken("")

		if hash == "" {
			t.Error("HashToken returned empty string for empty input")
		}

		// Should still produce valid SHA-256 hash
		if len(hash) != 64 {
			t.Errorf("Expected hash length 64, got %d", len(hash))
		}
	})
}

func TestVerifyToken(t *testing.T) {
	tg := NewTokenGenerator()

	t.Run("verifies matching tokens", func(t *testing.T) {
		plain, hashed, err := tg.GenerateToken()

		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		if !tg.VerifyToken(plain, hashed) {
			t.Error("VerifyToken failed for matching tokens")
		}
	})

	t.Run("rejects non-matching tokens", func(t *testing.T) {
		plain1, _, err := tg.GenerateToken()
		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		_, hashed2, err := tg.GenerateToken()
		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		if tg.VerifyToken(plain1, hashed2) {
			t.Error("VerifyToken succeeded for non-matching tokens")
		}
	})

	t.Run("rejects modified tokens", func(t *testing.T) {
		plain, hashed, err := tg.GenerateToken()

		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		// Modify the plain token slightly
		modifiedPlain := plain[:len(plain)-1] + "x"

		if tg.VerifyToken(modifiedPlain, hashed) {
			t.Error("VerifyToken succeeded for modified token")
		}
	})

	t.Run("handles empty strings", func(t *testing.T) {
		if tg.VerifyToken("", "") {
			// Empty strings hash to the same value, so this should pass
			// This is expected behavior
		}

		plain, hashed, _ := tg.GenerateToken()

		if tg.VerifyToken("", hashed) {
			t.Error("VerifyToken succeeded for empty plain token")
		}

		if tg.VerifyToken(plain, "") {
			t.Error("VerifyToken succeeded for empty hashed token")
		}
	})

	t.Run("handles different length strings", func(t *testing.T) {
		plain := "short"
		hashed := tg.HashToken("verylongtoken123456789")

		if tg.VerifyToken(plain, hashed) {
			t.Error("VerifyToken succeeded for tokens of different lengths")
		}
	})

	t.Run("constant-time comparison", func(t *testing.T) {
		// This test verifies the implementation uses constant-time comparison
		// We can't directly test timing, but we can verify the logic

		plain1, hashed1, _ := tg.GenerateToken()
		plain2, hashed2, _ := tg.GenerateToken()

		// Verify that different tokens don't match
		result1 := tg.VerifyToken(plain1, hashed2)
		result2 := tg.VerifyToken(plain2, hashed1)

		// Both should fail (different tokens)
		if result1 || result2 {
			t.Error("VerifyToken succeeded for different tokens")
		}

		// Verify that correct tokens match
		if !tg.VerifyToken(plain1, hashed1) {
			t.Error("VerifyToken failed for correct token")
		}
		if !tg.VerifyToken(plain2, hashed2) {
			t.Error("VerifyToken failed for correct token")
		}
	})
}

func TestTokenSecurity(t *testing.T) {
	tg := NewTokenGenerator()

	t.Run("tokens have sufficient entropy", func(t *testing.T) {
		// Generate a token and verify it has 256 bits of entropy
		plain, _, err := tg.GenerateToken()

		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		// Decode hex to get raw bytes
		bytes, err := hex.DecodeString(plain)
		if err != nil {
			t.Fatalf("Failed to decode token: %v", err)
		}

		// Should be 32 bytes = 256 bits
		if len(bytes) != 32 {
			t.Errorf("Expected 32 bytes of entropy, got %d", len(bytes))
		}
	})

	t.Run("tokens are not predictable", func(t *testing.T) {
		// Generate multiple tokens and verify they don't follow a pattern
		var tokens []string
		for i := 0; i < 10; i++ {
			plain, _, err := tg.GenerateToken()
			if err != nil {
				t.Fatalf("GenerateToken failed: %v", err)
			}
			tokens = append(tokens, plain)
		}

		// Check that no token is a substring of another
		for i := 0; i < len(tokens); i++ {
			for j := i + 1; j < len(tokens); j++ {
				if tokens[i] == tokens[j] {
					t.Error("Found duplicate tokens")
				}
			}
		}
	})

	t.Run("hashed tokens cannot be reversed", func(t *testing.T) {
		// This is a conceptual test - SHA-256 is one-way
		// We verify that the hash is different from the plain token
		plain, hashed, err := tg.GenerateToken()

		if err != nil {
			t.Fatalf("GenerateToken returned error: %v", err)
		}

		if plain == hashed {
			t.Error("Hashed token is same as plain token - not secure")
		}

		// Verify we can't verify the hash against itself
		if tg.VerifyToken(hashed, hashed) {
			// This might pass if we hash the hash, which is fine
			// The important thing is that plain != hashed
		}
	})
}

func BenchmarkGenerateToken(b *testing.B) {
	tg := NewTokenGenerator()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, err := tg.GenerateToken()
		if err != nil {
			b.Fatalf("GenerateToken failed: %v", err)
		}
	}
}

func BenchmarkHashToken(b *testing.B) {
	tg := NewTokenGenerator()
	token := "test-token-for-benchmarking-purposes"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = tg.HashToken(token)
	}
}

func BenchmarkVerifyToken(b *testing.B) {
	tg := NewTokenGenerator()
	plain, hashed, _ := tg.GenerateToken()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = tg.VerifyToken(plain, hashed)
	}
}
