# Design Document: Password Reset/Recovery

## Overview

The password reset/recovery feature provides a secure, user-friendly mechanism for users to regain access to their accounts when they forget their passwords. The implementation follows security best practices including cryptographically secure token generation, rate limiting, and protection against common attack vectors like email enumeration and brute force attempts.

The system consists of three main flows:
1. **Reset Request Flow**: User requests a password reset and receives an email
2. **Token Validation Flow**: User clicks email link and system validates the token
3. **Password Update Flow**: User sets a new password and regains account access

## Architecture

### System Components

```
┌─────────────────┐
│   Frontend      │
│  (Next.js 16)   │
│                 │
│  - Reset Request│
│  - Reset Form   │
│  - Validation   │
└────────┬────────┘
         │
         │ HTTPS/REST
         │
┌────────▼────────┐      ┌──────────────┐
│   Backend       │      │ Email Service│
│   (Go/Gin)      │─────▶│              │
│                 │      │ - SMTP       │
│  - Token Gen    │      │ - Templates  │
│  - Validation   │      └──────────────┘
│  - Rate Limit   │
│  - Password Hash│
└────────┬────────┘
         │
         │
┌────────▼────────┐
│   PostgreSQL    │
│                 │
│  - Users        │
│  - Reset Tokens │
│  - Rate Limits  │
└─────────────────┘
```

### Data Flow

**Request Flow:**
```
User → Frontend → Backend → Token Generation → Database Storage → Email Service → User Email
```

**Reset Flow:**
```
User Email → Click Link → Frontend → Backend → Token Validation → Password Update → Database → Login Page
```

## Components and Interfaces

### Frontend Components

#### 1. ForgotPasswordPage (`/forgot-password`)
- **Purpose**: Entry point for password reset requests
- **Location**: `apps/web/src/app/forgot-password/page.tsx`
- **Responsibilities**:
  - Display email input form
  - Validate email format client-side
  - Submit reset request to API
  - Display success/error messages
  - Handle loading states

**Interface:**
```typescript
interface ForgotPasswordFormData {
  email: string
}

interface ForgotPasswordResponse {
  message: string
  // Generic response regardless of email existence
}
```

#### 2. ResetPasswordPage (`/reset-password`)
- **Purpose**: Password reset form accessed via email link
- **Location**: `apps/web/src/app/reset-password/page.tsx`
- **Responsibilities**:
  - Extract token from URL query parameters
  - Validate token with backend
  - Display password reset form
  - Show password requirements
  - Provide real-time password validation
  - Submit new password to API
  - Handle success/error states

**Interface:**
```typescript
interface ResetPasswordFormData {
  password: string
  confirmPassword: string
}

interface ResetPasswordRequest {
  token: string
  password: string
}

interface ResetPasswordResponse {
  success: boolean
  message: string
}
```

#### 3. PasswordInput Component
- **Purpose**: Reusable password input with validation feedback
- **Location**: `apps/web/src/shared/components/forms/PasswordInput.tsx`
- **Responsibilities**:
  - Show/hide password toggle
  - Real-time validation feedback
  - Display password requirements
  - Accessibility support

**Interface:**
```typescript
interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  showRequirements?: boolean
  showStrengthIndicator?: boolean
  error?: string
}

interface PasswordRequirements {
  minLength: boolean
  hasUppercase: boolean
  hasLowercase: boolean
  hasNumber: boolean
  hasSpecialChar: boolean
}
```

### Backend Components

#### 1. Password Reset Handler
- **Purpose**: HTTP handlers for password reset endpoints
- **Location**: `apps/api/internal/modules/auth/reset_handler.go`
- **Endpoints**:
  - `POST /api/auth/forgot-password` - Request password reset
  - `POST /api/auth/reset-password` - Complete password reset
  - `GET /api/auth/validate-reset-token` - Validate token (optional)

**Interface:**
```go
type ResetHandler struct {
    cfg     *config.Config
    log     *logger.Logger
    service *ResetService
}

type ForgotPasswordRequest struct {
    Email string `json:"email" binding:"required,email"`
}

type ResetPasswordRequest struct {
    Token    string `json:"token" binding:"required"`
    Password string `json:"password" binding:"required,min=8"`
}

type ResetPasswordResponse struct {
    Success bool   `json:"success"`
    Message string `json:"message"`
}
```

#### 2. Password Reset Service
- **Purpose**: Business logic for password reset operations
- **Location**: `apps/api/internal/modules/auth/reset_service.go`
- **Responsibilities**:
  - Generate secure reset tokens
  - Store tokens in database
  - Validate tokens
  - Update passwords
  - Invalidate sessions
  - Coordinate with email service

**Interface:**
```go
type ResetService struct {
    db          *sql.DB
    log         *logger.Logger
    emailSvc    *EmailService
    rateLimiter *RateLimiter
}

// Core methods
func (s *ResetService) RequestPasswordReset(ctx context.Context, email string, ipAddress string) error
func (s *ResetService) ValidateResetToken(ctx context.Context, token string) (*ResetTokenData, error)
func (s *ResetService) ResetPassword(ctx context.Context, token string, newPassword string) error
func (s *ResetService) InvalidateUserSessions(ctx context.Context, userID int64) error
```

#### 3. Token Generator
- **Purpose**: Generate cryptographically secure tokens
- **Location**: `apps/api/internal/modules/auth/token_generator.go`
- **Responsibilities**:
  - Generate random tokens with sufficient entropy
  - Hash tokens for storage
  - Verify token hashes

**Interface:**
```go
type TokenGenerator struct {
    tokenLength int // 32 bytes = 256 bits
}

func (tg *TokenGenerator) GenerateToken() (plainToken string, hashedToken string, err error)
func (tg *TokenGenerator) HashToken(plainToken string) string
func (tg *TokenGenerator) VerifyToken(plainToken string, hashedToken string) bool
```

#### 4. Email Service
- **Purpose**: Send password reset emails using Yandex Mail SMTP
- **Location**: `apps/api/internal/shared/email/service.go`
- **Responsibilities**:
  - Send templated emails via Yandex Mail SMTP
  - Handle SMTP connection
  - Retry logic for failures
  - Email template rendering

**Configuration Note**: Uses existing Yandex Mail configuration from develop branch. Config fields to be added to `config.Config`:
- `SMTPHost` (smtp.yandex.ru)
- `SMTPPort` (465 for SSL or 587 for TLS)
- `SMTPUsername` (Yandex email address)
- `SMTPPassword` (Yandex app password)
- `SMTPFromAddress` (sender email)
- `SMTPFromName` (sender display name)

**Interface:**
```go
type EmailService struct {
    smtpHost     string
    smtpPort     int
    smtpUsername string
    smtpPassword string
    fromAddress  string
    fromName     string
    templates    *template.Template
    log          *logger.Logger
}

type ResetEmailData struct {
    UserEmail      string
    ResetURL       string
    ExpirationTime time.Time
    SupportEmail   string
}

func (es *EmailService) SendPasswordResetEmail(ctx context.Context, data ResetEmailData) error
func (es *EmailService) SendPasswordChangedEmail(ctx context.Context, userEmail string) error
```

#### 5. Rate Limiter
- **Purpose**: Prevent abuse of password reset system
- **Location**: `apps/api/internal/shared/middleware/rate_limiter.go`
- **Responsibilities**:
  - Track reset requests by email and IP
  - Enforce rate limits
  - Clean up expired rate limit entries

**Interface:**
```go
type RateLimiter struct {
    db  *sql.DB
    log *logger.Logger
}

type RateLimitConfig struct {
    EmailLimit    int           // 3 requests per email
    IPLimit       int           // 10 requests per IP
    WindowMinutes int           // 60 minutes
}

func (rl *RateLimiter) CheckEmailRateLimit(ctx context.Context, email string) error
func (rl *RateLimiter) CheckIPRateLimit(ctx context.Context, ipAddress string) error
func (rl *RateLimiter) RecordResetAttempt(ctx context.Context, email string, ipAddress string) error
```

#### 6. Password Validator
- **Purpose**: Validate password strength and requirements
- **Location**: `apps/api/internal/modules/auth/password_validator.go`
- **Responsibilities**:
  - Validate password requirements
  - Return detailed validation errors

**Interface:**
```go
type PasswordValidator struct {
    minLength      int
    requireUpper   bool
    requireLower   bool
    requireNumber  bool
    requireSpecial bool
}

type ValidationResult struct {
    Valid  bool
    Errors []string
}

func (pv *PasswordValidator) Validate(password string) ValidationResult
```

## Data Models

### Database Schema

#### reset_tokens Table
```sql
CREATE TABLE reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    INDEX idx_token_hash (token_hash),
    INDEX idx_user_id (user_id),
    INDEX idx_expires_at (expires_at)
);
```

#### password_reset_attempts Table (for rate limiting)
```sql
CREATE TABLE password_reset_attempts (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    attempted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    INDEX idx_email_attempted (email, attempted_at),
    INDEX idx_ip_attempted (ip_address, attempted_at)
);
```

#### users Table (existing, modifications needed)
```sql
-- Add column to track last password change
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP;
```

### Go Types

```go
type ResetToken struct {
    ID        int64
    UserID    int64
    TokenHash string
    CreatedAt time.Time
    ExpiresAt time.Time
    UsedAt    *time.Time
    IPAddress string
    UserAgent string
}

type ResetAttempt struct {
    ID          int64
    Email       string
    IPAddress   string
    AttemptedAt time.Time
}
```

### TypeScript Types

```typescript
// Frontend types
interface PasswordResetRequest {
  email: string
}

interface PasswordResetResponse {
  message: string
}

interface ResetPasswordRequest {
  token: string
  password: string
}

interface ResetPasswordResponse {
  success: boolean
  message: string
}

interface PasswordValidation {
  minLength: boolean
  hasUppercase: boolean
  hasLowercase: boolean
  hasNumber: boolean
  hasSpecialChar: boolean
  isValid: boolean
}

interface TokenValidationResponse {
  valid: boolean
  expired: boolean
  message: string
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several areas of redundancy:

- **Properties 1.5 and 1.6** both test response consistency for email enumeration prevention - these can be combined
- **Properties 3.2, 3.3, 3.4, 3.5** all test email content - these can be combined into a single comprehensive email content property
- **Properties 2.1 and 2.2** both relate to token security (entropy and hashing) - while related, they test different aspects and should remain separate
- **Properties 4.3, 4.4, 4.5** all test error cases for invalid tokens - these are distinct error conditions and should remain separate
- **Properties 5.1 and 5.2** both test password validation - these can be combined into a single comprehensive validation property

The following properties represent the unique, non-redundant validation requirements:

### Core Properties

**Property 1: Reset request creates secure token**
*For any* valid email address, when a password reset is requested, the system should generate a cryptographically secure token with at least 256 bits of entropy and store it hashed in the database associated with the user account.
**Validates: Requirements 1.3, 1.4, 2.1, 2.2, 2.3**

**Property 2: Email enumeration prevention**
*For any* email address (existing or non-existing), when a password reset is requested, the system should return the same generic success message and response time, preventing attackers from determining which emails are registered.
**Validates: Requirements 1.5, 1.6**

**Property 3: Token expiration and invalidation**
*For any* generated reset token, the expiration time should be exactly 1 hour from creation, and when a new token is created for a user, all previous tokens for that user should be invalidated.
**Validates: Requirements 2.4, 2.5, 2.6**

**Property 4: Email content completeness**
*For any* password reset email sent, the email should contain a unique reset URL with the token, clear instructions, expiration time, and a security warning about ignoring unsolicited emails.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

**Property 5: Email failure handling**
*For any* reset request where email sending fails, the system should log the error and invalidate the generated token to prevent orphaned tokens.
**Validates: Requirements 3.6**

**Property 6: Token validation with hashing**
*For any* reset token provided via URL, the system should hash the token and compare it with stored hashed tokens, never comparing plain text tokens.
**Validates: Requirements 4.1, 4.2**

**Property 7: Invalid token rejection**
*For any* token that does not exist in the database, the system should return an "invalid token" error without revealing whether the token never existed or was already used.
**Validates: Requirements 4.3, 4.5**

**Property 8: Expired token cleanup**
*For any* token that has passed its expiration time, the system should return an "expired token" error and remove the token from the database.
**Validates: Requirements 4.4**

**Property 9: Password validation requirements**
*For any* submitted password, the validator should verify it meets all requirements: minimum 8 characters, at least one uppercase letter, one lowercase letter, one number, and one special character.
**Validates: Requirements 5.1, 5.2**

**Property 10: Password confirmation matching**
*For any* password reset submission, the system should verify that the password and confirmation password fields match exactly before proceeding.
**Validates: Requirements 5.3**

**Property 11: Password hashing with bcrypt**
*For any* valid new password, the system should hash it using bcrypt with a cost factor of at least 12 before storing in the database.
**Validates: Requirements 5.4**

**Property 12: Token and session invalidation on reset**
*For any* successful password reset, the system should invalidate the used reset token and all existing JWT sessions for that user, forcing re-authentication.
**Validates: Requirements 5.5, 5.6**

**Property 13: Email-based rate limiting**
*For any* email address, the system should limit password reset requests to 3 attempts per hour, returning a generic error when the limit is exceeded.
**Validates: Requirements 6.1, 6.2**

**Property 14: IP-based rate limiting**
*For any* IP address, the system should limit password reset requests to 10 attempts per hour, logging suspicious activity when limits are exceeded.
**Validates: Requirements 6.4, 6.5**

**Property 15: Rate limit logging**
*For any* rate limit violation, the system should log the event with timestamp, email, and IP address for security monitoring.
**Validates: Requirements 6.3**

**Property 16: Safe error messages**
*For any* error during the password reset process, the system should display user-friendly messages that do not reveal system internals, implementation details, or security mechanisms.
**Validates: Requirements 7.1**

**Property 17: Comprehensive audit logging**
*For any* password reset attempt (successful or failed), the system should log the event with timestamp, IP address, user agent, and outcome.
**Validates: Requirements 7.2**

**Property 18: Password change confirmation email**
*For any* successful password reset, the system should send a confirmation email to the user's address notifying them of the password change.
**Validates: Requirements 7.3**

**Property 19: Token storage security**
*For any* reset token stored in the database, it should never be stored in plain text - only the hashed version should be persisted.
**Validates: Requirements 7.5**

## Error Handling

### Error Categories

#### 1. Validation Errors (400 Bad Request)
- Invalid email format
- Password does not meet requirements
- Password and confirmation do not match
- Missing required fields

**Handling Strategy:**
- Return specific validation errors to help users correct input
- Use structured error responses with field-level errors
- Frontend displays errors inline with form fields

#### 2. Rate Limit Errors (429 Too Many Requests)
- Email rate limit exceeded
- IP rate limit exceeded

**Handling Strategy:**
- Return generic error message: "Too many requests. Please try again later."
- Do not reveal specific limits or time windows
- Log event for security monitoring
- Frontend displays user-friendly message with retry guidance

#### 3. Token Errors (400 Bad Request / 404 Not Found)
- Token not found
- Token expired
- Token already used
- Invalid token format

**Handling Strategy:**
- Return appropriate error message for each case
- Expired tokens: "This reset link has expired. Please request a new one."
- Invalid tokens: "This reset link is invalid. Please request a new one."
- Clean up expired/used tokens from database
- Frontend provides link to request new reset

#### 4. Email Service Errors (500 Internal Server Error)
- SMTP connection failure
- Email sending failure
- Template rendering error

**Handling Strategy:**
- Log detailed error information
- Invalidate generated token to prevent orphaned tokens
- Return generic success message to user (don't reveal email failure)
- Implement retry logic with exponential backoff
- Alert administrators for persistent failures

#### 5. Database Errors (500 Internal Server Error)
- Connection failures
- Query errors
- Transaction failures

**Handling Strategy:**
- Log detailed error with context
- Return generic error to user: "An error occurred. Please try again."
- Implement transaction rollback
- Use connection pooling and retry logic

### Error Response Format

**Backend Error Response:**
```go
type ErrorResponse struct {
    Error   string            `json:"error"`
    Message string            `json:"message"`
    Fields  map[string]string `json:"fields,omitempty"` // Field-level errors
}
```

**Frontend Error Handling:**
```typescript
interface ApiError {
  error: string
  message: string
  fields?: Record<string, string>
}

// Display strategy
// - Field errors: Show inline with form fields
// - General errors: Show in toast notification
// - Rate limit errors: Show with retry timer
// - Token errors: Show with link to request new reset
```

### Logging Strategy

All errors should be logged with structured logging including:
- Timestamp
- Error type and message
- Request context (IP, user agent, endpoint)
- User identifier (if available)
- Stack trace (for 500 errors)
- Correlation ID for request tracing

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests to ensure comprehensive coverage:

- **Unit tests** verify specific examples, edge cases, and integration points
- **Property tests** verify universal properties across all inputs through randomization
- Together they provide comprehensive validation of correctness

### Property-Based Testing

**Library Selection:**
- **Frontend**: `fast-check` for TypeScript/JavaScript property-based testing
- **Backend**: `gopter` for Go property-based testing

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `Feature: password-reset, Property N: [property text]`

**Property Test Coverage:**

Each of the 19 correctness properties should be implemented as a property-based test:

1. **Token Generation Properties** (Properties 1, 3, 19)
   - Generate random user data
   - Verify token entropy, hashing, expiration
   - Test token invalidation on new generation

2. **Email Enumeration Prevention** (Property 2)
   - Generate random existing and non-existing emails
   - Verify response consistency and timing

3. **Email Content Properties** (Properties 4, 5, 18)
   - Generate random reset requests
   - Verify email content completeness
   - Test failure handling

4. **Token Validation Properties** (Properties 6, 7, 8)
   - Generate random valid and invalid tokens
   - Test expiration, usage, and error handling

5. **Password Validation Properties** (Properties 9, 10, 11)
   - Generate random passwords with various patterns
   - Verify validation rules and hashing

6. **Session Management** (Property 12)
   - Generate random user sessions
   - Verify invalidation on password reset

7. **Rate Limiting Properties** (Properties 13, 14, 15)
   - Generate multiple requests from same email/IP
   - Verify limits and logging

8. **Error Handling Properties** (Properties 16, 17)
   - Generate various error conditions
   - Verify safe messages and logging

### Unit Testing

**Frontend Unit Tests:**
- Component rendering and user interactions
- Form validation and submission
- Error display and loading states
- Accessibility compliance
- Navigation flows

**Backend Unit Tests:**
- Handler request/response processing
- Service method error cases
- Token generation edge cases
- Email template rendering
- Database transaction handling
- Middleware functionality

**Integration Tests:**
- End-to-end password reset flow
- Email service integration
- Database operations
- Rate limiting across requests
- Session invalidation

### Test Organization

**Frontend Tests:**
```
apps/web/src/
  app/forgot-password/__tests__/
    page.test.tsx
  app/reset-password/__tests__/
    page.test.tsx
  shared/components/forms/__tests__/
    PasswordInput.test.tsx
  features/auth/__tests__/
    passwordReset.properties.test.ts  # Property-based tests
```

**Backend Tests:**
```
apps/api/internal/modules/auth/
  reset_handler_test.go
  reset_service_test.go
  token_generator_test.go
  password_validator_test.go
  reset_properties_test.go  # Property-based tests
```

### Coverage Goals

- **Minimum Coverage**: 80% for all components
- **Critical Paths**: 100% coverage for security-critical code (token generation, validation, hashing)
- **Property Tests**: All 19 properties must have corresponding tests
- **Integration Tests**: Cover complete user flows

### Testing Security Aspects

**Security-Specific Tests:**
1. Token entropy and randomness (statistical tests)
2. Timing attack prevention (response time consistency)
3. Token reuse prevention
4. Session invalidation verification
5. Rate limit enforcement
6. SQL injection prevention (parameterized queries)
7. XSS prevention (output encoding)
8. CSRF token validation

**Manual Security Testing:**
- Penetration testing of reset flow
- Email spoofing attempts
- Token prediction attempts
- Rate limit bypass attempts
