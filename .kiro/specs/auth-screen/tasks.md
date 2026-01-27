# Implementation Plan: Authentication Screen

## Overview

This implementation plan breaks down the auth-screen feature into discrete, incremental coding tasks. Each task builds on previous work and includes references to specific requirements. The implementation follows a bottom-up approach: shared utilities → API layer → hooks → components → integration.

## Tasks

- [x] 1. Set up project structure and shared utilities
  - Create directory structure for auth feature
  - Set up API client utility with fetch wrapper
  - Configure environment variables for API URL
  - Set up token storage utility (localStorage)
  - _Requirements: TR-1.1, TR-1.2, TR-3.3_

- [x] 2. Implement validation schemas and utilities
  - [x] 2.1 Create Zod validation schemas
    - Define email validation schema (min 1, max 100, email format)
    - Define password validation schema (min 6, max 128)
    - Define consent validation schema (4 boolean fields)
    - Define login and register composite schemas
    - _Requirements: AC-5.1, AC-5.3, AC-2.2_
  
  - [x] 2.2 Write property test for email validation
    - **Property 2: Email Validation**
    - **Validates: Requirements AC-5.1, AC-2.2**
  
  - [x] 2.3 Write property test for password validation
    - **Property 3: Password Validation**
    - **Validates: Requirements AC-5.3, AC-2.2**

- [x] 3. Implement API client and auth functions
  - [x] 3.1 Create HTTP client utility
    - Implement ApiClient class with get/post/put/delete methods
    - Add Authorization header injection
    - Add error handling and response parsing
    - Implement token getter/setter methods
    - _Requirements: TR-1.1, TR-1.2, TR-1.3_
  
  - [x] 3.2 Implement auth API functions
    - Create loginUser function (POST /api/v1/auth/login)
    - Create registerUser function (POST /api/v1/auth/register)
    - Implement mapApiError function for error mapping
    - _Requirements: AC-1.5, AC-2.7, TR-1.1, TR-1.2_
  
  - [x] 3.3 Write property test for error mapping
    - **Property 7: Authentication Error Mapping**
    - **Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**
  
  - [x] 3.4 Write unit tests for API functions
    - Test loginUser with valid credentials
    - Test registerUser with valid data
    - Test error scenarios (401, 409, 500, network)
    - Mock Golang API responses using MSW
    - _Requirements: AC-1.5, AC-1.6, AC-2.7, AC-2.8_

- [x] 4. Checkpoint - Ensure API layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement custom hooks
  - [x] 5.1 Create useFormValidation hook
    - Implement validateEmail function
    - Implement validatePassword function
    - Implement validateLogin function
    - Implement validateRegister function
    - Implement clearErrors function
    - Manage validation errors state
    - _Requirements: AC-5.1, AC-5.3, AC-5.5_
  
  - [x] 5.2 Write property test for validation error clearing
    - **Property 4: Validation Error Clearing**
    - **Validates: Requirements AC-5.5**
  
  - [x] 5.3 Create useAuth hook
    - Implement login function with token storage
    - Implement register function with token storage
    - Manage loading and error states
    - Integrate with Next.js router for navigation
    - Add toast notifications for success/error
    - _Requirements: AC-1.5, AC-2.7, TR-2.3, TR-2.4_
  
  - [x] 5.4 Write property test for successful login flow
    - **Property 5: Successful Login Flow**
    - **Validates: Requirements AC-1.5**
  
  - [x] 5.5 Write property test for successful registration flow
    - **Property 6: Successful Registration Flow**
    - **Validates: Requirements AC-2.7**

- [x] 6. Implement base UI components
  - [x] 6.1 Create or verify Input component
    - Support email and password types
    - Add error state styling
    - Add ARIA attributes for accessibility
    - Implement onBlur validation trigger
    - _Requirements: AC-1.1, AC-1.2, AC-5.2, AC-5.4, TR-4.1_
  
  - [x] 6.2 Create or verify Button component
    - Support disabled and loading states
    - Add proper ARIA attributes
    - Ensure minimum touch target size (44x44px)
    - _Requirements: AC-1.3, AC-1.4, AC-7.5, TR-4.1_
  
  - [x] 6.3 Create Checkbox component
    - Support checked/unchecked states
    - Add error state styling
    - Add ARIA attributes
    - Support hyperlinked labels
    - _Requirements: AC-2.3, AC-2.6, AC-4.1, AC-4.2, TR-4.1_
  
  - [x] 6.4 Write unit tests for UI components
    - Test Input rendering and error states
    - Test Button disabled/loading states
    - Test Checkbox checked/error states
    - Test accessibility attributes
    - _Requirements: AC-1.1, AC-1.2, AC-1.3, AC-1.4_

- [x] 7. Implement auth feature components
  - [x] 7.1 Create AuthForm component
    - Render email and password inputs
    - Wire up form state management
    - Implement onBlur validation
    - Add "Забыл пароль?" link
    - Display validation errors
    - _Requirements: AC-1.1, AC-1.2, AC-3.1, AC-5.1, AC-5.3_
  
  - [x] 7.2 Create ConsentSection component
    - Render 4 consent checkboxes
    - Implement consent state management
    - Add hyperlinks to legal documents
    - Display consent validation errors
    - _Requirements: AC-2.3, AC-2.4, AC-2.6, AC-4.1, AC-4.2_
  
  - [x] 7.3 Write property test for consent validation
    - **Property 10: Mandatory Consent Validation**
    - **Validates: Requirements AC-2.3, AC-2.6**
  
  - [x] 7.4 Write property test for marketing consent optionality
    - **Property 9: Marketing Consent Optionality**
    - **Validates: Requirements AC-2.4**
  
  - [x] 7.3 Create AuthFooter component
    - Render support contact link
    - Add mailto: href with support email
    - _Requirements: AC-6.1, AC-6.2, AC-6.3_

- [x] 8. Implement main AuthScreen component
  - [x] 8.1 Create AuthScreen component
    - Set up component state (formData, consents, mode)
    - Integrate useAuth and useFormValidation hooks
    - Wire up AuthForm component
    - Wire up ConsentSection component (conditional)
    - Implement login button handler
    - Implement register button handler
    - Add button disabled logic
    - Add loading states
    - _Requirements: AC-1.3, AC-1.4, AC-1.5, AC-2.5, AC-2.7_
  
  - [x] 8.2 Write property test for form submission validation
    - **Property 1: Form Submission Validation**
    - **Validates: Requirements AC-1.3, AC-2.3, AC-2.5**
  
  - [x] 8.3 Write property test for consent independence during login
    - **Property 8: Consent Independence During Login**
    - **Validates: Requirements AC-1.7**
  
  - [x] 8.4 Write property test for loading state
    - **Property 11: Loading State During Authentication**
    - **Validates: Requirements AC-1.4**

- [x] 9. Create auth page route
  - [x] 9.1 Create app/auth/page.tsx
    - Import and render AuthScreen component
    - Add page metadata
    - _Requirements: US-1, US-2_
  
  - [x] 9.2 Create app/auth/layout.tsx
    - Create minimal layout without navigation
    - Add proper HTML structure
    - _Requirements: AC-7.1, AC-7.2_
  
  - [x] 9.3 Create app/auth/error.tsx
    - Implement error boundary for auth screen
    - Add error UI with retry button
    - _Requirements: AC-9.1, AC-9.2_

- [x] 10. Checkpoint - Ensure component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement error handling and network detection
  - [x] 11.1 Create useNetworkStatus hook
    - Monitor online/offline events
    - Return current network status
    - _Requirements: AC-8.1, AC-8.2_
  
  - [x] 11.2 Add network error handling to AuthScreen
    - Display network error banner when offline
    - Prevent API calls when offline
    - _Requirements: AC-8.1, AC-8.2_
  
  - [x] 11.3 Write property test for network error pre-emption
    - **Property 15: Network Error Pre-emption**
    - **Validates: Requirements AC-8.2**
  
  - [x] 11.4 Implement retry logic with exponential backoff
    - Create retryWithBackoff utility function
    - Integrate with auth API calls
    - _Requirements: AC-8.3_

- [x] 12. Implement middleware for auth redirects
  - [x] 12.1 Create app/middleware.ts
    - Check for JWT token in requests
    - Redirect authenticated users away from /auth
    - Redirect unauthenticated users to /auth from protected routes
    - _Requirements: AC-1.5, AC-2.7_
  
  - [x] 12.2 Write integration test for middleware
    - Test redirect from /auth when authenticated
    - Test redirect to /auth when not authenticated
    - Test protected route access
    - _Requirements: AC-1.5, AC-2.7_

- [x] 13. Add accessibility features
  - [x] 13.1 Add ARIA attributes to all inputs
    - Add aria-label, aria-required, aria-invalid
    - Add aria-describedby for error messages
    - _Requirements: AC-5.2, AC-5.4, TR-4.1, TR-4.2_
  
  - [x] 13.2 Add ARIA live regions for errors
    - Make error messages announced to screen readers
    - Add role="alert" to error containers
    - _Requirements: TR-4.2_
  
  - [x] 13.3 Implement keyboard navigation
    - Ensure tab order is logical
    - Add Enter key submit functionality
    - _Requirements: TR-4.3_
  
  - [x] 13.4 Write property test for validation error UI state
    - **Property 16: Validation Error UI State**
    - **Validates: Requirements AC-5.2, AC-5.4, AC-2.6**
  
  - [x] 13.5 Write property test for touch target sizes
    - **Property 17: Touch Target Minimum Size**
    - **Validates: Requirements AC-7.5**

- [x] 14. Implement logging and monitoring
  - [x] 14.1 Create logger utility
    - Implement info, error, debug methods
    - Add conditional logging based on environment
    - _Requirements: AC-9.4_
  
  - [x] 14.2 Add logging to auth flows
    - Log login attempts
    - Log registration attempts
    - Log authentication errors
    - Log validation errors
    - _Requirements: AC-9.4_
  
  - [x] 14.3 Write property test for error logging
    - **Property 14: Error Logging**
    - **Validates: Requirements AC-9.4**

- [x] 15. Add state preservation for navigation
  - [x] 15.1 Implement form state preservation
    - Store form data in sessionStorage on navigation
    - Restore form data on return
    - _Requirements: AC-3.3, AC-4.4_
  
  - [x] 15.2 Write property test for state preservation
    - **Property 12: State Preservation During Navigation**
    - **Validates: Requirements AC-3.3, AC-4.4**

- [x] 16. Implement user-friendly error messages
  - [x] 16.1 Create error message constants
    - Define Russian error messages
    - Map error codes to messages
    - _Requirements: AC-1.6, AC-2.8, AC-8.1, AC-9.1, AC-9.2_
  
  - [x] 16.2 Write property test for error message user-friendliness
    - **Property 13: Error Message User-Friendliness**
    - **Validates: Requirements AC-9.2**

- [x] 17. Final integration and testing
  - [x] 17.1 Write E2E test for complete login flow
    - Test successful login with valid credentials
    - Test failed login with invalid credentials
    - Test navigation to dashboard after login
    - _Requirements: US-1, AC-1.5, AC-1.6_
  
  - [x] 17.2 Write E2E test for complete registration flow
    - Test successful registration with all consents
    - Test failed registration without mandatory consents
    - Test duplicate email error
    - Test navigation to onboarding after registration
    - _Requirements: US-2, AC-2.7, AC-2.8_
  
  - [x] 17.3 Write E2E test for error scenarios
    - Test network error handling
    - Test server error handling
    - Test validation error display
    - _Requirements: US-8, US-9_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Run full test suite (unit + integration + E2E)
  - Verify all 17 correctness properties are tested
  - Check test coverage meets goals (80% line, 75% branch)
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- E2E tests validate complete user flows
- Implementation uses TypeScript with Next.js 16 and React 19
- Backend integration uses Golang API (not Supabase)
- JWT tokens stored in localStorage (consider HTTP-only cookies for production)
