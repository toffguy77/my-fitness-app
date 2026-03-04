# Auth Improvements: Email Verification & Consent Storage — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Store user consents in the database during registration and require email verification via 6-digit code before granting access to onboarding/dashboard.

**Architecture:** Two parallel tracks — (1) backend consent storage wired into the existing register handler, and (2) a full email verification flow modeled after the existing `reset_service.go` pattern: generate code, hash & store in DB, send email, verify on submission. Frontend gets a new `/auth/verify-email` page and routing changes.

**Tech Stack:** Go/Gin (backend), PostgreSQL (DB), SMTP via existing email service, Next.js/React (frontend), Tailwind CSS, Zustand (no new dependencies)

**Design doc:** `docs/plans/2026-03-04-auth-improvements-design.md`

---

## Task 1: Database Migration — `email_verified` column + `email_verification_codes` table

**Files:**
- Create: `apps/api/migrations/027_email_verification_up.sql`
- Create: `apps/api/migrations/027_email_verification_down.sql`

**Step 1: Write up migration**

```sql
-- 027_email_verification_up.sql

ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE email_verification_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_verification_codes_user_id ON email_verification_codes(user_id);
```

**Step 2: Write down migration**

```sql
-- 027_email_verification_down.sql

DROP TABLE IF EXISTS email_verification_codes;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
```

**Step 3: Run migration**

Run: `cd apps/api && go run cmd/server/main.go` (migrations run on startup)
Expected: Server starts, migration 027 applies without error.

**Step 4: Commit**

```
feat: add email_verified column and email_verification_codes table
```

---

## Task 2: Backend — Verification Service

**Files:**
- Create: `apps/api/internal/modules/auth/verification_service.go`

This follows the same pattern as `reset_service.go`. Key differences: generates a 6-digit numeric code instead of a hex token, has attempt counting, and 10-minute TTL.

**Step 1: Write `verification_service.go`**

```go
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"math/big"
	"time"

	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
)

const (
	verificationCodeTTL    = 10 * time.Minute
	maxVerificationAttempts = 5
	maxResendPerWindow      = 5
	resendWindowDuration    = 10 * time.Minute
)

// VerificationService handles email verification via 6-digit codes.
type VerificationService struct {
	db           *sql.DB
	log          *logger.Logger
	emailService *email.Service
}

// NewVerificationService creates a new verification service.
func NewVerificationService(db *sql.DB, log *logger.Logger, emailService *email.Service) *VerificationService {
	return &VerificationService{
		db:           db,
		log:          log,
		emailService: emailService,
	}
}

// generateCode returns a cryptographically random 6-digit string ("000000"–"999999").
func generateCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", fmt.Errorf("failed to generate code: %w", err)
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// hashCode returns the hex-encoded SHA-256 hash of a code string.
func hashCode(code string) string {
	h := sha256.Sum256([]byte(code))
	return hex.EncodeToString(h[:])
}

// SendCode generates a new 6-digit code and sends it to the user's email.
// Previous unused codes for this user are invalidated (by being superseded — only the latest is checked).
func (vs *VerificationService) SendCode(ctx context.Context, userID int64, userEmail, ip, ua string) error {
	// Rate limit: count codes created in the last window
	var recentCount int
	err := vs.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM email_verification_codes
		 WHERE user_id = $1 AND created_at > $2`,
		userID, time.Now().Add(-resendWindowDuration),
	).Scan(&recentCount)
	if err != nil {
		return fmt.Errorf("failed to check rate limit: %w", err)
	}
	if recentCount >= maxResendPerWindow {
		return fmt.Errorf("too many requests")
	}

	// Generate code
	code, err := generateCode()
	if err != nil {
		return err
	}

	// Store hashed code
	expiresAt := time.Now().Add(verificationCodeTTL)
	_, err = vs.db.ExecContext(ctx,
		`INSERT INTO email_verification_codes (user_id, code_hash, expires_at, ip_address, user_agent)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, hashCode(code), expiresAt, ip, ua,
	)
	if err != nil {
		return fmt.Errorf("failed to store verification code: %w", err)
	}

	// Send email
	err = vs.emailService.SendVerificationEmail(ctx, email.VerificationEmailData{
		UserEmail: userEmail,
		Code:      code,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		vs.log.Errorw("Failed to send verification email", "user_id", userID, "error", err)
		return fmt.Errorf("failed to send email")
	}

	vs.log.Infow("Verification code sent", "user_id", userID, "email", userEmail)
	return nil
}

// VerifyCode checks the submitted code against the latest unused code for the user.
// Returns nil on success, error on failure.
func (vs *VerificationService) VerifyCode(ctx context.Context, userID int64, code string) error {
	// Fetch the latest unused code
	var codeID int64
	var storedHash string
	var expiresAt time.Time
	var attempts int

	err := vs.db.QueryRowContext(ctx,
		`SELECT id, code_hash, expires_at, attempts
		 FROM email_verification_codes
		 WHERE user_id = $1 AND used_at IS NULL
		 ORDER BY created_at DESC
		 LIMIT 1`,
		userID,
	).Scan(&codeID, &storedHash, &expiresAt, &attempts)
	if err == sql.ErrNoRows {
		return fmt.Errorf("no active code")
	}
	if err != nil {
		return fmt.Errorf("failed to fetch code: %w", err)
	}

	// Check attempts
	if attempts >= maxVerificationAttempts {
		return fmt.Errorf("too many attempts")
	}

	// Check expiry
	if time.Now().After(expiresAt) {
		return fmt.Errorf("code expired")
	}

	// Compare hashes
	if hashCode(code) != storedHash {
		// Increment attempt counter
		_, _ = vs.db.ExecContext(ctx,
			`UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = $1`,
			codeID,
		)
		return fmt.Errorf("invalid code")
	}

	// Mark code as used and set email_verified in a transaction
	tx, err := vs.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx,
		`UPDATE email_verification_codes SET used_at = NOW() WHERE id = $1`, codeID)
	if err != nil {
		return fmt.Errorf("failed to mark code used: %w", err)
	}

	_, err = tx.ExecContext(ctx,
		`UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`, userID)
	if err != nil {
		return fmt.Errorf("failed to verify email: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit: %w", err)
	}

	vs.log.Infow("Email verified", "user_id", userID)
	return nil
}
```

**Step 2: Verify it compiles**

Run: `cd apps/api && go build ./...`
Expected: Build succeeds (email.SendVerificationEmail doesn't exist yet — will fail, that's Task 3).

**Step 3: Commit**

```
feat: add email verification service with code generation and validation
```

---

## Task 3: Backend — Email Template for Verification Code

**Files:**
- Modify: `apps/api/internal/shared/email/service.go`

Add `VerificationEmailData` struct, `SendVerificationEmail` method, and `emailVerificationTemplate` constant. Follow the exact pattern of the existing `SendPasswordResetEmail`.

**Step 1: Add the struct, method, and template**

After the existing `PasswordChangedEmailData` struct (~line 51), add:

```go
// VerificationEmailData contains data for the email verification template
type VerificationEmailData struct {
	UserEmail string
	Code      string
	ExpiresAt time.Time
}
```

After `SendPasswordChangedEmail` method (~line 158), add:

```go
// SendVerificationEmail sends a verification code email with retry logic
func (s *Service) SendVerificationEmail(ctx context.Context, data VerificationEmailData) error {
	subject := "Код подтверждения — BURCEV"

	body, err := s.renderTemplate("email_verification", data)
	if err != nil {
		s.log.WithError(err).Error("Failed to render verification email template")
		return fmt.Errorf("failed to render template: %w", err)
	}

	maxRetries := 3
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		err := s.sendEmail(ctx, data.UserEmail, subject, body)
		if err == nil {
			s.log.Info("Verification email sent successfully",
				"email", data.UserEmail,
				"attempt", attempt,
			)
			return nil
		}

		lastErr = err
		s.log.WithError(err).Warn("Failed to send verification email",
			"email", data.UserEmail,
			"attempt", attempt,
			"max_retries", maxRetries,
		)

		if attempt < maxRetries {
			backoff := time.Duration(attempt) * time.Second
			time.Sleep(backoff)
		}
	}

	return fmt.Errorf("failed to send email after %d attempts: %w", maxRetries, lastErr)
}
```

In `parseTemplates()` (~line 276), add after `password_changed` template parse:

```go
	_, err = tmpl.New("email_verification").Parse(emailVerificationTemplate)
	if err != nil {
		return nil, err
	}
```

Add the template constant at the end of the file:

```go
const emailVerificationTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Код подтверждения</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
        <h2 style="color: #2c3e50; margin-top: 0;">Код подтверждения</h2>

        <p>Здравствуйте,</p>

        <p>Ваш код подтверждения для аккаунта BURCEV:</p>

        <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2c3e50; background-color: #e9ecef; padding: 15px 30px; border-radius: 8px; display: inline-block;">{{.Code}}</span>
        </div>

        <p>Код действителен в течение 10 минут.</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
            Если вы не запрашивали этот код, проигнорируйте это письмо.
        </p>

        <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Это автоматическое сообщение от BURCEV. Пожалуйста, не отвечайте на это письмо.
        </p>
    </div>
</body>
</html>
`
```

**Step 2: Verify it compiles**

Run: `cd apps/api && go build ./...`
Expected: Build succeeds.

**Step 3: Commit**

```
feat: add verification code email template
```

---

## Task 4: Backend — Wire Consents + Verification into Register Handler

**Files:**
- Modify: `apps/api/internal/modules/auth/handler.go`
- Modify: `apps/api/internal/modules/auth/service.go`
- Modify: `apps/api/cmd/server/main.go`

### 4a: Update `RegisterRequest` and `Handler` to accept consents and hold VerificationService

In `handler.go`:

Update `RegisterRequest` struct to include consents:

```go
type RegisterRequest struct {
	Email    string         `json:"email" binding:"required,email"`
	Password string         `json:"password" binding:"required,min=8"`
	Name     string         `json:"name"`
	Consents *ConsentsInput `json:"consents"`
}

type ConsentsInput struct {
	TermsOfService bool `json:"terms_of_service"`
	PrivacyPolicy  bool `json:"privacy_policy"`
	DataProcessing bool `json:"data_processing"`
	Marketing      bool `json:"marketing"`
}
```

Update `Handler` struct to hold `verificationService`:

```go
type Handler struct {
	cfg                 *config.Config
	log                 *logger.Logger
	service             *Service
	verificationService *VerificationService
}
```

Update `NewHandler` to accept `*VerificationService`:

```go
func NewHandler(db *sql.DB, cfg *config.Config, log *logger.Logger, vs *VerificationService) *Handler {
	return &Handler{
		cfg:                 cfg,
		log:                 log,
		service:             NewService(db, cfg, log),
		verificationService: vs,
	}
}
```

Update `Register` method to store consents and send verification code:

```go
func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	result, err := h.service.Register(c.Request.Context(), req.Email, req.Password, req.Name, c.ClientIP(), c.Request.UserAgent(), req.Consents)
	if err != nil {
		h.log.Errorw("Registration failed", "error", err, "email", req.Email)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	// Send verification code (best-effort — registration still succeeds)
	if err := h.verificationService.SendCode(c.Request.Context(), result.User.ID, result.User.Email, c.ClientIP(), c.Request.UserAgent()); err != nil {
		h.log.Errorw("Failed to send verification code after registration", "error", err, "user_id", result.User.ID)
	}

	response.Success(c, http.StatusCreated, result)
}
```

### 4b: Update `User` struct and `Register` in `service.go`

Add `EmailVerified` field to `User`:

```go
type User struct {
	ID                  int64     `json:"id"`
	Email               string    `json:"email"`
	Name                string    `json:"name,omitempty"`
	Role                string    `json:"role"`
	EmailVerified       bool      `json:"email_verified"`
	OnboardingCompleted bool      `json:"onboarding_completed"`
	CreatedAt           time.Time `json:"created_at"`
}
```

Update all SQL queries that scan `User` to include `email_verified`:

In `Register` — update the RETURNING clause and Scan:
```sql
RETURNING id, email, COALESCE(name, ''), role, email_verified, COALESCE(onboarding_completed, false), created_at
```
```go
.Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.EmailVerified, &user.OnboardingCompleted, &user.CreatedAt)
```

Update `Register` signature to accept consents and store them:
```go
func (s *Service) Register(ctx context.Context, email, password, name, ip, ua string, consents *ConsentsInput) (*LoginResult, error) {
```

After inserting the user (after the `QueryRowContext` call), add consent storage:

```go
	// Store consents
	if consents != nil {
		consentTypes := []struct {
			ctype   string
			granted bool
		}{
			{"terms_of_service", consents.TermsOfService},
			{"privacy_policy", consents.PrivacyPolicy},
			{"data_processing", consents.DataProcessing},
			{"marketing", consents.Marketing},
		}
		for _, c := range consentTypes {
			_, err := s.db.ExecContext(ctx,
				`INSERT INTO user_consents (user_id, consent_type, granted, granted_at, ip_address, user_agent)
				 VALUES ($1, $2, $3, NOW(), $4::inet, $5)`,
				user.ID, c.ctype, c.granted, ip, ua,
			)
			if err != nil {
				s.log.Warnw("Failed to store consent", "user_id", user.ID, "type", c.ctype, "error", err)
			}
		}
	}
```

In `Login` — update the SELECT to include `email_verified`:
```sql
SELECT id, email, COALESCE(name, ''), password, role, email_verified, COALESCE(onboarding_completed, false), created_at
FROM users WHERE email = $1
```
```go
.Scan(&user.ID, &user.Email, &user.Name, &hashedPassword, &user.Role, &user.EmailVerified, &user.OnboardingCompleted, &user.CreatedAt)
```

In `RefreshTokens` — update the user SELECT:
```sql
SELECT id, email, COALESCE(name, ''), role, email_verified, COALESCE(onboarding_completed, false), created_at
FROM users WHERE id = $1
```
```go
.Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.EmailVerified, &user.OnboardingCompleted, &user.CreatedAt)
```

### 4c: Add verify-email and resend routes in `handler.go`

Add two new handler methods:

```go
// VerifyEmailRequest represents email verification request
type VerifyEmailRequest struct {
	Code string `json:"code" binding:"required"`
}

// VerifyEmail handles email verification code submission
func (h *Handler) VerifyEmail(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req VerifyEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	err := h.verificationService.VerifyCode(c.Request.Context(), userID.(int64), req.Code)
	if err != nil {
		switch err.Error() {
		case "too many attempts":
			response.Error(c, http.StatusTooManyRequests, "Слишком много попыток. Запросите новый код.")
		case "code expired":
			response.Error(c, http.StatusBadRequest, "Код истёк. Запросите новый.")
		default:
			response.Error(c, http.StatusBadRequest, "Неверный код")
		}
		return
	}

	response.SuccessWithMessage(c, http.StatusOK, "Email verified", nil)
}

// ResendVerification handles resending the verification code
func (h *Handler) ResendVerification(c *gin.Context) {
	userID, _ := c.Get("user_id")
	userEmail, _ := c.Get("user_email")

	err := h.verificationService.SendCode(
		c.Request.Context(),
		userID.(int64),
		userEmail.(string),
		c.ClientIP(),
		c.Request.UserAgent(),
	)
	if err != nil {
		if err.Error() == "too many requests" {
			response.Error(c, http.StatusTooManyRequests, "Слишком много запросов. Попробуйте позже.")
			return
		}
		h.log.Errorw("Failed to resend verification code", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось отправить код")
		return
	}

	response.SuccessWithMessage(c, http.StatusOK, "Code sent", nil)
}
```

### 4d: Register routes in `main.go`

Update `main.go` (~line 215) to create `VerificationService` and pass it to `Handler`:

```go
		verificationService := auth.NewVerificationService(db.DB, log, emailService)
		authHandler := auth.NewHandler(db.DB, cfg, log, verificationService)
		resetHandler := auth.NewResetHandler(cfg, log, resetService)
```

Add the two new routes inside the `authGroup` block (after `/logout`):

```go
			authGroup.POST("/verify-email", middleware.RequireAuth(cfg), authHandler.VerifyEmail)
			authGroup.POST("/resend-verification", middleware.RequireAuth(cfg), authHandler.ResendVerification)
```

**Step 2: Verify it compiles**

Run: `cd apps/api && go build ./...`
Expected: Build succeeds.

**Step 3: Commit**

```
feat: wire consent storage and email verification into registration flow
```

---

## Task 5: Backend Tests — Verification Service

**Files:**
- Create: `apps/api/internal/modules/auth/verification_service_test.go`

**Step 1: Write tests**

```go
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
	// With 1M possible codes, 100 samples should be mostly unique
	if len(seen) < 90 {
		t.Errorf("expected mostly unique codes, got %d unique out of 100", len(seen))
	}
}
```

**Step 2: Run tests**

Run: `cd apps/api && go test ./internal/modules/auth/ -run TestGenerateCode -v && go test ./internal/modules/auth/ -run TestHashCode -v && go test ./internal/modules/auth/ -run TestGenerateCodeUniqueness -v`
Expected: All PASS.

**Step 3: Commit**

```
test: add unit tests for verification code generation and hashing
```

---

## Task 6: Frontend — Auth Types Update

**Files:**
- Modify: `apps/web/src/features/auth/types/index.ts`

**Step 1: Add `email_verified` to `AuthResponse.user`**

In the `AuthResponse` interface, add `email_verified` field to the `user` object:

```typescript
export interface AuthResponse {
    user: {
        id: string;
        email: string;
        name?: string;
        role: 'client' | 'coordinator' | 'super_admin';
        created_at: string;
        email_verified: boolean;
        onboarding_completed: boolean;
    };
    token: string;
    refresh_token: string;
}
```

**Step 2: Commit**

```
feat: add email_verified field to AuthResponse type
```

---

## Task 7: Frontend — Verification API Functions

**Files:**
- Create: `apps/web/src/features/auth/api/verification.ts`

**Step 1: Write API functions**

```typescript
import { apiClient } from '@/shared/utils/api-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export async function verifyEmail(code: string): Promise<void> {
    await apiClient.post(`${API_BASE}/backend-api/v1/auth/verify-email`, { code });
}

export async function resendVerificationCode(): Promise<void> {
    await apiClient.post(`${API_BASE}/backend-api/v1/auth/resend-verification`, {});
}
```

**Step 2: Commit**

```
feat: add verification API client functions
```

---

## Task 8: Frontend — Verify Email Page

**Files:**
- Create: `apps/web/src/app/auth/verify-email/page.tsx`
- Create: `apps/web/src/features/auth/components/VerifyEmailScreen.tsx`
- Create: `apps/web/src/features/auth/components/CodeInput.tsx`

### 8a: CodeInput component

```tsx
'use client'

import { useRef, KeyboardEvent, ClipboardEvent } from 'react'
import { cn } from '@/shared/utils/cn'

interface CodeInputProps {
    value: string[]
    onChange: (value: string[]) => void
    disabled?: boolean
    error?: boolean
}

export function CodeInput({ value, onChange, disabled, error }: CodeInputProps) {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    function handleChange(index: number, digit: string) {
        if (!/^\d?$/.test(digit)) return
        const next = [...value]
        next[index] = digit
        onChange(next)
        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Backspace' && !value[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
        e.preventDefault()
        const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
        if (!digits) return
        const next = [...value]
        for (let i = 0; i < 6; i++) {
            next[i] = digits[i] || ''
        }
        onChange(next)
        const focusIndex = Math.min(digits.length, 5)
        inputRefs.current[focusIndex]?.focus()
    }

    return (
        <div className="flex justify-center gap-2">
            {Array.from({ length: 6 }, (_, i) => (
                <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={value[i] || ''}
                    disabled={disabled}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    className={cn(
                        'h-12 w-10 rounded-lg border text-center text-xl font-bold transition-colors',
                        'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20',
                        'disabled:opacity-50',
                        error
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-300 bg-white'
                    )}
                    aria-label={`Цифра ${i + 1}`}
                />
            ))}
        </div>
    )
}
```

### 8b: VerifyEmailScreen component

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { verifyEmail, resendVerificationCode } from '@/features/auth/api/verification'
import { CodeInput } from './CodeInput'

export function VerifyEmailScreen() {
    const router = useRouter()
    const [code, setCode] = useState<string[]>(Array(6).fill(''))
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [resendCooldown, setResendCooldown] = useState(60)
    const [attempts, setAttempts] = useState(0)

    // Get email from localStorage for display
    const userEmail = typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('user') || '{}').email || ''
        : ''

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) return
        const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
        return () => clearTimeout(timer)
    }, [resendCooldown])

    const handleSubmit = useCallback(async () => {
        const codeStr = code.join('')
        if (codeStr.length !== 6) return

        setIsLoading(true)
        setError(null)

        try {
            await verifyEmail(codeStr)
            toast.success('Email подтверждён')

            // Update user in localStorage
            const user = JSON.parse(localStorage.getItem('user') || '{}')
            user.email_verified = true
            localStorage.setItem('user', JSON.stringify(user))

            // Navigate based on onboarding status
            if (!user.onboarding_completed) {
                router.push('/onboarding')
            } else {
                router.push('/dashboard')
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Ошибка проверки кода'
            setError(msg)
            setAttempts((a) => a + 1)
            setCode(Array(6).fill(''))
        } finally {
            setIsLoading(false)
        }
    }, [code, router])

    // Auto-submit when all 6 digits entered
    useEffect(() => {
        if (code.every((d) => d !== '') && !isLoading) {
            handleSubmit()
        }
    }, [code, isLoading, handleSubmit])

    async function handleResend() {
        setError(null)
        setAttempts(0)
        try {
            await resendVerificationCode()
            toast.success('Код отправлен повторно')
            setResendCooldown(60)
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Не удалось отправить код'
            toast.error(msg)
        }
    }

    const isBlocked = attempts >= 5

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-md px-4 pb-8 pt-24">
                <h2 className="mb-2 text-center text-xl font-bold text-gray-900">
                    Подтверждение email
                </h2>
                <p className="mb-8 text-center text-sm text-gray-500">
                    Мы отправили код на {userEmail}
                </p>

                <div className="mb-6">
                    <CodeInput
                        value={code}
                        onChange={setCode}
                        disabled={isLoading || isBlocked}
                        error={!!error}
                    />
                </div>

                {error && (
                    <p className="mb-4 text-center text-sm text-red-600">{error}</p>
                )}

                {isBlocked && (
                    <p className="mb-4 text-center text-sm text-gray-600">
                        Слишком много попыток. Запросите новый код.
                    </p>
                )}

                <div className="text-center">
                    <button
                        type="button"
                        disabled={resendCooldown > 0}
                        onClick={handleResend}
                        className="text-sm text-blue-600 transition-colors hover:text-blue-700 disabled:text-gray-400"
                    >
                        {resendCooldown > 0
                            ? `Отправить повторно (${resendCooldown}с)`
                            : 'Отправить повторно'}
                    </button>
                </div>
            </div>
        </div>
    )
}
```

### 8c: Page

```tsx
import { VerifyEmailScreen } from '@/features/auth/components/VerifyEmailScreen'

export const metadata = {
    title: 'Подтверждение email | BURCEV',
}

export default function VerifyEmailPage() {
    return <VerifyEmailScreen />
}
```

**Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No new errors related to verify-email files.

**Step 3: Commit**

```
feat: add verify-email page with 6-digit code input and paste support
```

---

## Task 9: Frontend — Routing Changes in useAuth

**Files:**
- Modify: `apps/web/src/features/auth/hooks/useAuth.ts`

**Step 1: Update login routing**

In the `login` function, after storing tokens, change the routing logic:

```typescript
            if (response.user.role === 'super_admin') {
                router.push('/admin');
            } else if (response.user.role === 'coordinator') {
                router.push('/curator');
            } else if (!response.user.email_verified) {
                router.push('/auth/verify-email');
            } else if (!response.user.onboarding_completed) {
                router.push('/onboarding');
            } else {
                router.push('/dashboard');
            }
```

**Step 2: Update register routing**

In the `register` function, change redirect from `/onboarding` to `/auth/verify-email`:

```typescript
            toast.success('Регистрация успешна');
            router.push('/auth/verify-email');
```

**Step 3: Commit**

```
feat: route unverified users to verify-email page
```

---

## Task 10: Verification — Full Stack

**Step 1: Run backend tests**

Run: `cd apps/api && go test ./internal/modules/auth/ -v`
Expected: All tests pass.

**Step 2: Run frontend type-check and lint**

Run: `cd apps/web && npx tsc --noEmit`
Run: `cd apps/web && npm run lint`
Expected: No new errors.

**Step 3: Run backend build**

Run: `cd apps/api && go build ./...`
Expected: Build succeeds.

**Step 4: Commit if any fixups needed, then final commit**

```
chore: verify full-stack build passes
```
