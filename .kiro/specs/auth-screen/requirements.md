# Authentication Screen Requirements

## Feature Overview

Implementation of the primary authentication screen (`AUTH_MAIN_01`) for the Physical Life application. This screen serves as the entry point for unauthenticated users, providing both login and registration functionality with comprehensive legal consent management.

## User Stories

### US-1: User Login
**As a** registered user  
**I want to** log in with my email and password  
**So that** I can access my nutrition tracking dashboard

**Acceptance Criteria:**
- AC-1.1: User can enter email address in dedicated input field
- AC-1.2: User can enter password in secure input field (masked characters)
- AC-1.3: Login button is disabled when email or password fields are empty
- AC-1.4: Login button shows loading state during authentication request
- AC-1.5: On successful login (200), user is redirected to dashboard with tokens stored
- AC-1.6: On failed login (400/401), user sees error message "Неверный логин или пароль"
- AC-1.7: Consent checkboxes are ignored during login (consent given at registration)

### US-2: New User Registration
**As a** new user  
**I want to** create an account with email and password  
**So that** I can start tracking my nutrition

**Acceptance Criteria:**
- AC-2.1: User can enter email address in dedicated input field
- AC-2.2: User can enter password in secure input field (minimum 6 characters)
- AC-2.3: User must check three mandatory consent checkboxes before registration
- AC-2.4: User can optionally check marketing consent checkbox
- AC-2.5: Registration button validates all mandatory consents before submission
- AC-2.6: Unchecked mandatory consents are highlighted in red with error indication
- AC-2.7: On successful registration (201), user is auto-logged in and redirected to onboarding
- AC-2.8: On duplicate email (409), user sees error message "Пользователь уже существует"

### US-3: Password Recovery
**As a** user who forgot their password  
**I want to** initiate password reset process  
**So that** I can regain access to my account

**Acceptance Criteria:**
- AC-3.1: User can click "Забыл пароль?" link
- AC-3.2: Link navigates to password reset screen (`AUTH_RESET_01`)
- AC-3.3: Navigation preserves entered email if present

### US-4: Legal Document Review
**As a** new user  
**I want to** review terms of service and privacy policy  
**So that** I can make informed consent decisions

**Acceptance Criteria:**
- AC-4.1: User can click hyperlinked "Договор публичной оферты" text
- AC-4.2: User can click hyperlinked "Политика конфиденциальности" text
- AC-4.3: Documents open in in-app WebView (not external browser)
- AC-4.4: User can return to auth screen without losing entered data
- AC-4.5: WebView displays full HTML content of legal documents

### US-5: Input Validation
**As a** user  
**I want to** receive immediate feedback on input errors  
**So that** I can correct mistakes before submission

**Acceptance Criteria:**
- AC-5.1: Email field validates format on blur (pattern: x@x.x)
- AC-5.2: Invalid email shows error indicator
- AC-5.3: Password field validates minimum length (6 characters)
- AC-5.4: Short password shows error indicator
- AC-5.5: Validation errors are cleared when user corrects input

### US-6: Support Contact
**As a** user  
**I want to** contact support from the auth screen  
**So that** I can get help with login issues

**Acceptance Criteria:**
- AC-6.1: User can click "Связаться с нами" link in footer
- AC-6.2: Link opens native email client or support form
- AC-6.3: Support email is pre-populated if using email client

### US-7: Responsive Layout
**As a** user on any device  
**I want to** see properly formatted auth screen  
**So that** I can easily interact with all elements

**Acceptance Criteria:**
- AC-7.1: Screen displays correctly on iPhone SE (small screen)
- AC-7.2: Screen displays correctly on iPhone 15 Pro Max (large screen)
- AC-7.3: When keyboard opens, content scrolls to keep active input visible
- AC-7.4: Login button remains accessible when keyboard is open
- AC-7.5: All touch targets meet minimum size requirements (44x44pt)

### US-8: Offline Handling
**As a** user without internet connection  
**I want to** receive clear feedback about connectivity  
**So that** I understand why authentication fails

**Acceptance Criteria:**
- AC-8.1: When no network detected, show message "Check internet connection"
- AC-8.2: Network error appears before API request attempt
- AC-8.3: User can retry after connectivity is restored

### US-9: Error Handling
**As a** user encountering server errors  
**I want to** receive appropriate error messages  
**So that** I understand what went wrong

**Acceptance Criteria:**
- AC-9.1: Server error (500) shows message "Сервис временно недоступен"
- AC-9.2: Generic errors show user-friendly messages (no technical details)
- AC-9.3: Error messages are displayed in toast/alert format
- AC-9.4: Errors are logged for debugging purposes

## Technical Requirements

### TR-1: API Integration
- TR-1.1: Implement `POST /auth/login` endpoint integration
- TR-1.2: Implement `POST /auth/register` endpoint integration
- TR-1.3: Handle JWT token storage (Access/Refresh tokens)
- TR-1.4: Implement token refresh mechanism

### TR-2: State Management
- TR-2.1: Manage form input state (email, password)
- TR-2.2: Manage consent checkbox state (4 checkboxes)
- TR-2.3: Manage loading states for async operations
- TR-2.4: Manage error states for validation and API errors

### TR-3: Security
- TR-3.1: Password input must be masked by default
- TR-3.2: Optional password visibility toggle (eye icon)
- TR-3.3: Secure token storage using platform-specific secure storage
- TR-3.4: HTTPS-only API communication

### TR-4: Accessibility
- TR-4.1: All inputs have proper labels for screen readers
- TR-4.2: Error messages are announced to screen readers
- TR-4.3: Focus management for keyboard navigation
- TR-4.4: Sufficient color contrast for all text elements

### TR-5: Performance
- TR-5.1: Screen loads in under 1 second
- TR-5.2: Input validation responds within 100ms
- TR-5.3: API requests timeout after 30 seconds
- TR-5.4: Optimized asset loading (logo, fonts)

## UI Specifications

### Color Palette
- Input Background: `#E6E6FA` (Light Lavender)
- Accent Color: `#2A4BA0` (Royal Blue)
- Button Disabled: `#D3D3D3`
- Error Color: `#FF0000` (Red)
- Link Color: `#2A4BA0` (Royal Blue)

### Typography
- iOS: San Francisco (System Font)
- Android: Roboto (System Font)
- App Title: Bold weight
- Body Text: Regular weight
- Links: Regular weight with underline

### Component Hierarchy
1. Header (Logo + App Name)
2. Form Section (Email + Password inputs)
3. Action Links ("Забыл пароль?")
4. Primary Actions (Login + Register buttons)
5. Legal Consent Section (4 checkboxes with hyperlinks)
6. Footer (Support contact link)

## API Contracts

### Login Request
```json
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}
```

### Login Response (Success)
```json
HTTP 200 OK
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "client"
  }
}
```

### Login Response (Error)
```json
HTTP 401 Unauthorized
{
  "error": "invalid_credentials",
  "message": "Неверный логин или пароль"
}
```

### Register Request
```json
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password",
  "consents": {
    "terms_of_service": true,
    "privacy_policy": true,
    "data_processing": true,
    "marketing": false
  }
}
```

### Register Response (Success)
```json
HTTP 201 Created
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "client",
    "consents": {
      "terms_of_service": true,
      "privacy_policy": true,
      "data_processing": true,
      "marketing": false
    }
  }
}
```

### Register Response (Error - Duplicate)
```json
HTTP 409 Conflict
{
  "error": "user_exists",
  "message": "Пользователь уже существует"
}
```

## Edge Cases

### EC-1: Network Connectivity
- No internet connection during login/register
- Intermittent connection during API request
- Request timeout scenarios

### EC-2: Server Errors
- 500 Internal Server Error
- 503 Service Unavailable
- Gateway timeout errors

### EC-3: Input Edge Cases
- Very long email addresses (>100 characters)
- Special characters in password
- Copy-paste with leading/trailing whitespace
- Emoji in email/password fields

### EC-4: State Persistence
- User navigates away and returns
- App backgrounded during API request
- Device rotation during input

### EC-5: Concurrent Actions
- User clicks login multiple times rapidly
- User switches between login and register during request
- User modifies input during API request

## Dependencies

### External Services
- Authentication API backend
- Legal document hosting (Terms, Privacy Policy)
- Email service for support contact

### Platform APIs
- Keyboard management (KeyboardAvoidingView)
- Secure storage for tokens
- Native email client integration
- WebView for legal documents

### Third-party Libraries
- Form validation library
- HTTP client for API requests
- Toast/Alert notification system

## Success Metrics

### Functional Metrics
- Login success rate > 95%
- Registration completion rate > 80%
- Form validation accuracy 100%
- Zero security vulnerabilities

### Performance Metrics
- Screen load time < 1s
- API response time < 2s (p95)
- Input validation latency < 100ms
- Zero crashes related to auth screen

### User Experience Metrics
- Error message clarity (user feedback)
- Consent checkbox comprehension rate
- Support contact usage rate
- Password reset initiation rate

## Out of Scope

The following items are explicitly out of scope for this feature:

- Social authentication (Google, Apple, Facebook)
- Biometric authentication (Face ID, Touch ID)
- Two-factor authentication (2FA)
- Password strength indicator
- Email verification flow
- Remember me functionality
- Auto-fill integration
- Dark mode support (unless already implemented globally)
- Localization beyond Russian language
- Analytics tracking implementation

## Future Enhancements

Potential future improvements not included in initial release:

- Password visibility toggle (eye icon)
- Social login integration
- Biometric authentication
- Remember me checkbox
- Email verification requirement
- Password strength meter
- Auto-fill support
- Accessibility improvements (VoiceOver optimization)
- A/B testing for conversion optimization
