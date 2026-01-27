# Implementation Plan: Password Reset/Recovery

## Overview

This implementation plan breaks down the password reset feature into incremental steps, building from database schema through backend services to frontend components. Each task builds on previous work, with testing integrated throughout to catch issues early. The implementation follows security best practices including cryptographically secure tokens, rate limiting, and comprehensive audit logging.

## Tasks

- [x] 1. Database schema and migrations
  - Create `reset_tokens` table with proper indexes for token lookup and expiration cleanup
  - Create `password_reset_attempts` table for rate limiting tracking
  - Add `password_changed_at` column to existing `users` table
  - Write migration files with both up and down migrations
  - Test migrations on local database
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.4_

- [x] 2. Backend configuration updates
  - Add SMTP configuration fields to `apps/api/internal/config/config.go`
  - Add environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS`, `SMTP_FROM_NAME`
  - Add password reset URL base configuration: `RESET_PASSWORD_URL`
  - Update `.env.example` with new variables and Yandex Mail examples
  - _Requirements: 3.1, 3.2_

- [ ] 3. Implement token generation and validation
  - [x] 3.1 Create `TokenGenerator` in `apps/api/internal/modules/auth/token_generator.go`
    - Implement `GenerateToken()` using `crypto/rand` for 32-byte (256-bit) tokens
    - Implement `HashToken()` using SHA-256 for storage
    - Implement `VerifyToken()` for comparing plain and hashed tokens
    - _Requirements: 2.1, 2.2_
  
  - [x] 3.2 Write property test for token generation
    - **Property 1: Reset request creates secure token**
    - **Validates: Requirements 1.3, 1.4, 2.1, 2.2, 2.3**
    - Test token uniqueness across 1000+ generations
    - Test token entropy and randomness
    - Test hash consistency

- [ ] 4. Implement password validation
  - [x] 4.1 Create `PasswordValidator` in `apps/api/internal/modules/auth/password_validator.go`
    - Implement validation for minimum 8 characters
    - Implement validation for uppercase, lowercase, number, special character requirements
    - Return detailed validation errors
    - _Requirements: 5.1, 5.2_
  
  - [x] 4.2 Write property test for password validation
    - **Property 9: Password validation requirements**
    - **Validates: Requirements 5.1, 5.2**
    - Generate random passwords with various patterns
    - Test all validation rules

- [ ] 5. Implement rate limiting
  - [x] 5.1 Create `RateLimiter` in `apps/api/internal/shared/middleware/rate_limiter.go`
    - Implement `CheckEmailRateLimit()` - 3 requests per email per hour
    - Implement `CheckIPRateLimit()` - 10 requests per IP per hour
    - Implement `RecordResetAttempt()` to track attempts
    - Implement cleanup of expired rate limit entries
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 5.2 Write property tests for rate limiting
    - **Property 13: Email-based rate limiting**
    - **Property 14: IP-based rate limiting**
    - **Validates: Requirements 6.1, 6.2, 6.4**
    - Generate multiple requests from same email/IP
    - Verify limits are enforced

- [ ] 6. Implement email service
  - [x] 6.1 Create `EmailService` in `apps/api/internal/shared/email/service.go`
    - Implement SMTP connection using Yandex Mail configuration
    - Create HTML email template for password reset
    - Create HTML email template for password change confirmation
    - Implement `SendPasswordResetEmail()` with retry logic
    - Implement `SendPasswordChangedEmail()`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.3_
  
  - [x] 6.2 Write unit tests for email service
    - Test email template rendering
    - Test SMTP connection handling
    - Test retry logic
    - Mock SMTP server for testing

- [x] 7. Checkpoint - Test infrastructure components
  - Run all tests for token generator, password validator, rate limiter, and email service
  - Verify database migrations work correctly
  - Ensure all tests pass, ask the user if questions arise

- [ ] 8. Implement password reset service
  - [x] 8.1 Create `ResetService` in `apps/api/internal/modules/auth/reset_service.go`
    - Implement `RequestPasswordReset()` - create token, store in DB, send email
    - Implement generic response regardless of email existence (security)
    - Implement `ValidateResetToken()` - check existence, expiration, usage
    - Implement `ResetPassword()` - validate token, update password, invalidate token
    - Implement `InvalidateUserSessions()` - clear JWT sessions
    - Implement token cleanup on new token generation (invalidate old tokens)
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.6, 4.1, 4.2, 4.3, 4.4, 4.5, 5.4, 5.5, 5.6_
  
  - [x] 8.2 Write property tests for reset service
    - **Property 2: Email enumeration prevention**
    - **Property 3: Token expiration and invalidation**
    - **Property 6: Token validation with hashing**
    - **Property 7: Invalid token rejection**
    - **Property 8: Expired token cleanup**
    - **Property 12: Token and session invalidation on reset**
    - **Validates: Requirements 1.5, 1.6, 2.4, 2.5, 2.6, 4.1, 4.2, 4.3, 4.4, 4.5, 5.5, 5.6**
  
  - [x] 8.3 Write unit tests for reset service
    - Test error handling for database failures
    - Test error handling for email service failures
    - Test token cleanup on email failure
    - _Requirements: 3.6_

- [ ] 9. Implement password reset HTTP handlers
  - [x] 9.1 Create `ResetHandler` in `apps/api/internal/modules/auth/reset_handler.go`
    - Implement `POST /api/auth/forgot-password` endpoint
    - Implement `POST /api/auth/reset-password` endpoint
    - Implement `GET /api/auth/validate-reset-token` endpoint (optional, for UX)
    - Add request validation using Gin binding
    - Add rate limiting middleware
    - Add comprehensive error handling with safe error messages
    - Add audit logging for all attempts
    - _Requirements: 1.1, 1.2, 1.3, 5.3, 7.1, 7.2_
  
  - [x] 9.2 Write integration tests for handlers
    - Test complete password reset flow
    - Test rate limiting enforcement
    - Test error responses
    - Test audit logging
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2_

- [x] 10. Register routes and wire backend components
  - Update `apps/api/cmd/server/main.go` to initialize email service
  - Update `apps/api/internal/modules/auth/routes.go` to register reset endpoints
  - Wire dependencies: config → email service → reset service → handler
  - Test endpoints with curl or Postman
  - _Requirements: All backend requirements_

- [x] 11. Checkpoint - Test complete backend flow
  - Test forgot password request creates token and sends email
  - Test token validation works correctly
  - Test password reset updates password and invalidates sessions
  - Test rate limiting prevents abuse
  - Ensure all tests pass, ask the user if questions arise

- [ ] 12. Implement frontend password input component
  - [x] 12.1 Create `PasswordInput` component in `apps/web/src/shared/components/forms/PasswordInput.tsx`
    - Implement show/hide password toggle
    - Implement real-time validation feedback
    - Display password requirements checklist
    - Add accessibility attributes (ARIA labels, roles)
    - Style with Tailwind CSS following design tokens
    - _Requirements: 8.3, 8.4, 8.6_
  
  - [x] 12.2 Write unit tests for PasswordInput
    - Test show/hide toggle functionality
    - Test validation feedback display
    - Test accessibility compliance
    - Use React Testing Library

- [ ] 13. Implement forgot password page
  - [x] 13.1 Create forgot password page in `apps/web/src/app/forgot-password/page.tsx`
    - Create email input form with validation
    - Implement form submission to `/api/auth/forgot-password`
    - Display loading state during submission
    - Display generic success message after submission
    - Display error messages using toast notifications
    - Add "Back to Login" link
    - Style with Tailwind CSS
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 8.1, 8.2, 8.5_
  
  - [x] 13.2 Write unit tests for forgot password page
    - Test form validation
    - Test form submission
    - Test error handling
    - Mock API calls with MSW

- [ ] 14. Implement reset password page
  - [x] 14.1 Create reset password page in `apps/web/src/app/reset-password/page.tsx`
    - Extract token from URL query parameters
    - Validate token with backend on page load
    - Display password reset form with PasswordInput component
    - Implement password confirmation matching
    - Submit new password to `/api/auth/reset-password`
    - Handle token validation errors (expired, invalid, used)
    - Display success message and redirect to login
    - Display error messages using toast notifications
    - Style with Tailwind CSS
    - _Requirements: 4.6, 5.3, 5.7, 8.3, 8.4, 8.5, 8.6_
  
  - [x] 14.2 Write unit tests for reset password page
    - Test token extraction from URL
    - Test password validation
    - Test password confirmation matching
    - Test form submission
    - Test error handling for invalid/expired tokens
    - Mock API calls with MSW

- [x] 15. Add "Forgot Password?" link to login page
  - Update login page to include "Forgot Password?" link
  - Link should navigate to `/forgot-password`
  - Style consistently with existing login page
  - _Requirements: 1.1_

- [x] 16. Implement API client functions
  - Create `apps/web/src/features/auth/api/passwordReset.ts`
  - Implement `requestPasswordReset(email: string)` function
  - Implement `resetPassword(token: string, password: string)` function
  - Implement `validateResetToken(token: string)` function
  - Add proper error handling and TypeScript types
  - _Requirements: 1.3, 5.3, 4.1_

- [x] 17. Checkpoint - Test complete frontend flow
  - Test forgot password form submission
  - Test email receipt (check email inbox)
  - Test clicking reset link from email
  - Test password reset form submission
  - Test successful login with new password
  - Test error cases (expired token, invalid token, weak password)
  - Ensure all tests pass, ask the user if questions arise

- [x] 18. Add comprehensive logging and monitoring
  - Ensure all password reset attempts are logged with context
  - Add metrics for reset request rate
  - Add alerts for suspicious activity (high rate limit violations)
  - Log email sending failures for monitoring
  - _Requirements: 7.2, 6.3, 6.5_

- [ ] 19. Write end-to-end property tests
  - [x] 19.1 Frontend property tests
    - **Property 10: Password confirmation matching**
    - **Validates: Requirements 5.3**
    - Generate random password pairs (matching and non-matching)
  
  - [x] 19.2 Backend property tests
    - **Property 4: Email content completeness**
    - **Property 5: Email failure handling**
    - **Property 11: Password hashing with bcrypt**
    - **Property 15: Rate limit logging**
    - **Property 16: Safe error messages**
    - **Property 17: Comprehensive audit logging**
    - **Property 18: Password change confirmation email**
    - **Property 19: Token storage security**
    - **Validates: Requirements 3.1-3.6, 5.4, 6.3, 7.1, 7.2, 7.3, 7.5**

- [x] 20. Security review and hardening
  - Review all error messages to ensure no information leakage
  - Verify CSRF protection is enabled on forms
  - Verify all tokens are hashed before storage
  - Verify rate limiting is working correctly
  - Test timing attack resistance (response times should be consistent)
  - Review audit logs for completeness
  - _Requirements: 7.4, 7.5, 7.6_

- [x] 21. Documentation and deployment preparation
  - Update API documentation with new endpoints
  - Document environment variables in README
  - Create deployment checklist (SMTP credentials, database migrations)
  - Update user-facing documentation with password reset instructions
  - _Requirements: All_

- [x] 22. Final checkpoint - Complete system test
  - Run full test suite (unit, property, integration, e2e)
  - Test on staging environment with real email delivery
  - Verify all 19 correctness properties pass
  - Test rate limiting under load
  - Verify audit logs are complete
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples, edge cases, and error conditions
- Security is prioritized throughout with token hashing, rate limiting, and safe error messages
- Email service uses existing Yandex Mail SMTP configuration from develop branch
