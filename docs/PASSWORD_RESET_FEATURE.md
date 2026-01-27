# Password Reset Feature Documentation

## Overview

The password reset feature provides a secure mechanism for users to recover their accounts when they forget their passwords. The implementation follows security best practices including cryptographically secure tokens, rate limiting, and comprehensive audit logging.

## Architecture

### Backend Components

1. **Database Schema** (`apps/api/migrations/001_password_reset_schema_up.sql`)
   - `reset_tokens` table: Stores hashed reset tokens with expiration
   - `password_reset_attempts` table: Tracks attempts for rate limiting
   - `password_changed_at` column: Added to users table for audit trail

2. **Token Generator** (`apps/api/internal/modules/auth/token_generator.go`)
   - Generates cryptographically secure 256-bit tokens
   - Hashes tokens using SHA-256 before storage
   - Provides constant-time token verification

3. **Password Validator** (`apps/api/internal/modules/auth/password_validator.go`)
   - Enforces minimum 8 characters
   - Requires uppercase, lowercase, number, and special character
   - Returns detailed validation errors

4. **Rate Limiter** (`apps/api/internal/shared/middleware/rate_limiter.go`)
   - Email-based: 3 requests per hour
   - IP-based: 10 requests per hour
   - Logs security events for monitoring

5. **Email Service** (`apps/api/internal/shared/email/service.go`)
   - Yandex Mail SMTP integration
   - HTML email templates
   - Retry logic with exponential backoff

6. **Reset Service** (`apps/api/internal/modules/auth/reset_service.go`)
   - Coordinates all password reset operations
   - Prevents email enumeration
   - Invalidates old tokens on new request

7. **HTTP Handlers** (`apps/api/internal/modules/auth/reset_handler.go`)
   - `POST /api/v1/auth/forgot-password` - Request reset
   - `POST /api/v1/auth/reset-password` - Complete reset
   - `GET /api/v1/auth/validate-reset-token` - Validate token

### Frontend Components

1. **PasswordInput Component** (`apps/web/src/shared/components/forms/PasswordInput.tsx`)
   - Show/hide password toggle
   - Real-time validation feedback
   - Password strength indicator
   - Requirements checklist

2. **Forgot Password Page** (`apps/web/src/app/forgot-password/page.tsx`)
   - Email input form
   - Generic success message (prevents enumeration)
   - Error handling with toast notifications

3. **Reset Password Page** (`apps/web/src/app/reset-password/page.tsx`)
   - Token validation on load
   - Password reset form with confirmation
   - Success/error states
   - Auto-redirect to login

4. **API Client** (`apps/web/src/features/auth/api/passwordReset.ts`)
   - `requestPasswordReset(email)`
   - `resetPassword(token, password)`
   - `validateResetToken(token)`

## Configuration

### Environment Variables

Add to `apps/api/.env`:

```bash
# SMTP Configuration (Yandex Mail)
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USERNAME=your-email@yandex.ru
SMTP_PASSWORD=your-app-password
SMTP_FROM_ADDRESS=noreply@burcev.team
SMTP_FROM_NAME=BURCEV

# Password Reset Configuration
RESET_PASSWORD_URL=http://localhost:3069/reset-password
```

### Yandex Mail Setup

1. Create a Yandex Mail account
2. Enable 2FA in account settings
3. Generate an app-specific password
4. Use the app password in `SMTP_PASSWORD`

## Security Features

1. **Token Security**
   - 256-bit cryptographically secure random tokens
   - SHA-256 hashing before storage
   - 1-hour expiration
   - Single-use tokens

2. **Rate Limiting**
   - 3 requests per email per hour
   - 10 requests per IP per hour
   - Security event logging

3. **Email Enumeration Prevention**
   - Generic success messages
   - Consistent response times
   - No indication if email exists

4. **Password Requirements**
   - Minimum 8 characters
   - Uppercase + lowercase + number + special character
   - bcrypt hashing with cost factor 12

5. **Audit Logging**
   - All reset attempts logged
   - IP addresses and user agents tracked
   - Security events for monitoring

## User Flow

1. Пользователь нажимает "Забыли пароль?" на странице входа
2. Пользователь вводит email адрес
3. Система отправляет письмо для сброса (если аккаунт существует)
4. Пользователь нажимает на ссылку в письме
5. Система проверяет токен
6. Пользователь вводит новый пароль
7. Система обновляет пароль и отправляет письмо-подтверждение
8. Пользователь перенаправляется на страницу входа

## Localization

All user-facing text is in Russian:
- UI labels and buttons
- Error messages
- Email templates
- Validation messages

See `docs/LOCALIZATION_RU.md` for complete localization details.

## Testing

### Backend Tests

```bash
cd apps/api

# Token generator tests
go test -v ./internal/modules/auth/token_generator*.go

# Password validator tests
go test -v ./internal/modules/auth/password_validator*.go

# Rate limiter tests
go test -v ./internal/shared/middleware/rate_limiter*.go

# Email service tests
go test -v ./internal/shared/email/

# Reset service tests
go test -v ./internal/modules/auth/reset_service_test.go
```

### Frontend Tests

```bash
cd apps/web

# Run all tests
npm test

# Run specific tests
npm test PasswordInput
npm test forgot-password
npm test reset-password
```

## Deployment Checklist

- [ ] Run database migrations
- [ ] Configure SMTP credentials
- [ ] Set `RESET_PASSWORD_URL` to production frontend URL
- [ ] Test email delivery
- [ ] Verify rate limiting
- [ ] Check audit logs
- [ ] Test complete flow end-to-end

## Monitoring

Monitor these metrics:

1. **Reset Request Rate**: Track requests per hour
2. **Rate Limit Violations**: Alert on high frequency
3. **Email Delivery Failures**: Monitor SMTP errors
4. **Token Expiration Rate**: Track expired vs used tokens
5. **Password Reset Success Rate**: Monitor completion rate

## Troubleshooting

### Email Not Sending

1. Check SMTP credentials
2. Verify Yandex Mail app password
3. Check email service logs
4. Test SMTP connection manually

### Rate Limit Issues

1. Check `password_reset_attempts` table
2. Run cleanup: `SELECT cleanup_old_reset_attempts();`
3. Adjust limits if needed

### Token Validation Failures

1. Check token expiration (1 hour)
2. Verify token hasn't been used
3. Check database for token record
4. Review security logs

## API Reference

### POST /api/v1/auth/forgot-password

Request password reset email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "If an account exists with this email, you will receive password reset instructions."
}
```

**Response (429):**
```json
{
  "error": "Too many requests. Please try again later."
}
```

### POST /api/v1/auth/reset-password

Reset password with token.

**Request:**
```json
{
  "token": "abc123...",
  "password": "NewPassword123!"
}
```

**Response (200):**
```json
{
  "message": "Password reset successful. You can now log in with your new password."
}
```

**Response (400):**
```json
{
  "error": "Invalid or expired reset link. Please request a new one."
}
```

### GET /api/v1/auth/validate-reset-token

Validate reset token.

**Query Parameters:**
- `token`: Reset token to validate

**Response (200):**
```json
{
  "valid": true,
  "expires_at": "2026-01-27T16:00:00Z"
}
```

**Response (400):**
```json
{
  "error": "Invalid reset link."
}
```

## Maintenance

### Cleanup Tasks

Run periodically (e.g., daily cron job):

```sql
-- Cleanup expired tokens
SELECT cleanup_expired_reset_tokens();

-- Cleanup old attempts (older than 24 hours)
SELECT cleanup_old_reset_attempts();
```

### Database Queries

```sql
-- Check recent reset attempts
SELECT * FROM password_reset_attempts 
ORDER BY attempted_at DESC 
LIMIT 100;

-- Check active tokens
SELECT * FROM reset_tokens 
WHERE expires_at > NOW() 
AND used_at IS NULL;

-- Check rate limit violations
SELECT email, COUNT(*) as attempts
FROM password_reset_attempts
WHERE attempted_at > NOW() - INTERVAL '1 hour'
GROUP BY email
HAVING COUNT(*) >= 3;
```

## Future Enhancements

1. **Multi-factor Authentication**: Add 2FA support
2. **SMS Reset**: Alternative to email
3. **Account Recovery Questions**: Additional verification
4. **Password History**: Prevent reuse of old passwords
5. **Suspicious Activity Detection**: ML-based anomaly detection
6. **Internationalization**: Multi-language support
7. **Custom Email Templates**: Per-tenant branding

## Support

For issues or questions:
- Check logs: `apps/api/logs/`
- Review security events in database
- Contact: support@burcev.team
