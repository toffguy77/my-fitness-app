# Auth Improvements: Email Verification & Consent Storage

## Context

Registration flow needs two improvements:
1. Store user consents (terms, privacy, data processing, marketing) in the database — the `user_consents` table exists but is never populated
2. Verify user email via 6-digit code before allowing access to onboarding/dashboard

## Database Changes

**New column in `users`:**
```sql
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
```

**New table `email_verification_codes`:**
```sql
CREATE TABLE email_verification_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

On resend — old codes are not deleted but become invalid; only the latest unused code with `expires_at > NOW()` is accepted.

**`user_consents` table** already exists — start writing to it during registration.

## API

### New Endpoints

`POST /api/v1/auth/verify-email` (requires JWT)
- Request: `{ "code": "482910" }`
- 200: `{ "message": "Email verified" }`
- 400: invalid/expired code
- 429: too many failed attempts (max 5 per code)

`POST /api/v1/auth/resend-verification` (requires JWT)
- 200: `{ "message": "Code sent" }`
- 429: rate limit (max 5 requests per 10 min)
- Invalidates previous codes, generates new one, sends email

### Modified Endpoints

`POST /api/v1/auth/register`:
- Accept `consents` field, write to `user_consents` with IP and user_agent
- Generate 6-digit code, store SHA256 hash in `email_verification_codes`
- Send verification email
- Response includes `email_verified: false` in user object

`POST /api/v1/auth/login` — no API changes, but response already includes `email_verified` for frontend routing.

## Backend

New `verification_service.go` following the same pattern as `reset_service.go`:
- 6-digit numeric code generation (crypto/rand)
- SHA256 hashing for storage
- Code TTL: 10 minutes
- Max 5 incorrect attempts per code, then code is blocked
- Rate limit on resend: 5 per 10 minutes per user
- Audit trail: IP + user_agent on every code creation

New email template "Код подтверждения — BURCEV" with the code displayed prominently and 10-minute expiry note.

## Frontend

### New Page: `/auth/verify-email`

- 6 separate digit inputs with auto-focus to next field
- Paste support: pasting 6 digits into any input fills all fields
- Text: "Мы отправили код на {email}"
- "Отправить повторно" button — disabled for 60 seconds, then resets timer on click
- Error display: "Неверный код", "Код истёк"
- After 5 failed attempts: inputs disabled, prompt to request new code

### Routing Changes

After registration:
```
register → tokens to localStorage → redirect /auth/verify-email
```

After login (returning unverified user):
```
login → email_verified === false → /auth/verify-email
login → email_verified === true, onboarding_completed === false → /onboarding
login → email_verified === true, onboarding_completed === true → /dashboard
```

## Security

- Code TTL: 10 minutes
- Max 5 incorrect attempts per code
- Rate limit on resend: 5 requests per 10 minutes
- Codes stored as SHA256 hashes
- IP + user_agent audit trail
- Unverified users cannot access onboarding or dashboard
