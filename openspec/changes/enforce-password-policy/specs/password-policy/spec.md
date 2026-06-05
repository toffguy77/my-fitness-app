## ADDED Requirements

### Requirement: Password meets OWASP composition rules on all write paths
A new password submitted during registration, password reset, or password change SHALL satisfy all of the following:
- Minimum 8 characters
- Maximum 128 characters
- At least one uppercase letter (Unicode `IsUpper`)
- At least one lowercase letter (Unicode `IsLower`)
- At least one digit (Unicode `IsDigit`)
- At least one special character (not a letter, digit, or whitespace)

This rule applies identically regardless of which write path is used.

#### Scenario: Password meets all rules on registration
- **WHEN** a user submits a valid password during registration
- **THEN** the system accepts it and creates the account

#### Scenario: Password meets all rules on reset
- **WHEN** a user submits a valid password during password reset
- **THEN** the system accepts it and updates the stored hash

#### Scenario: Password meets all rules on change
- **WHEN** an authenticated user submits a valid new password during password change
- **THEN** the system accepts it and updates the stored hash

#### Scenario: Password too short
- **WHEN** a user submits a password shorter than 8 characters on any write path
- **THEN** the system rejects the request with an error identifying the minimum length requirement

#### Scenario: Password too long
- **WHEN** a user submits a password longer than 128 characters on any write path
- **THEN** the system rejects the request with an error identifying the maximum length requirement

#### Scenario: Password missing uppercase letter
- **WHEN** a user submits a password with no uppercase letter
- **THEN** the system rejects the request with an error identifying the missing uppercase requirement

#### Scenario: Password missing lowercase letter
- **WHEN** a user submits a password with no lowercase letter
- **THEN** the system rejects the request with an error identifying the missing lowercase requirement

#### Scenario: Password missing digit
- **WHEN** a user submits a password with no digit
- **THEN** the system rejects the request with an error identifying the missing digit requirement

#### Scenario: Password missing special character
- **WHEN** a user submits a password with no special character
- **THEN** the system rejects the request with an error identifying the missing special character requirement

#### Scenario: Multiple rules violated simultaneously
- **WHEN** a user submits a password that violates more than one rule
- **THEN** the system returns all violated rules in a single response (not one at a time)

### Requirement: Authenticated user can change their password
An authenticated user SHALL be able to change their password via `POST /api/auth/change-password`. The request MUST include the current password for verification and a new password that meets the policy.

#### Scenario: Successful password change
- **WHEN** an authenticated user submits their correct current password and a valid new password
- **THEN** the system updates the stored password hash and returns success

#### Scenario: Wrong current password
- **WHEN** an authenticated user submits an incorrect current password
- **THEN** the system rejects the request with a 401 error and does not update the password

#### Scenario: New password fails policy
- **WHEN** an authenticated user submits the correct current password but a new password that violates OWASP rules
- **THEN** the system rejects the request with a 422 error listing all violated rules

#### Scenario: New password same as current
- **WHEN** an authenticated user submits a new password identical to the current one
- **THEN** the system rejects the request (new password must differ from current)

#### Scenario: Unauthenticated request
- **WHEN** a request to `POST /api/auth/change-password` is made without a valid JWT
- **THEN** the system returns 401

### Requirement: Login is unaffected by password policy
The login flow SHALL NOT validate the submitted password against OWASP composition rules. Authentication SHALL proceed via bcrypt comparison only.

#### Scenario: Existing weak password still authenticates
- **WHEN** a user with a pre-existing password that does not meet OWASP rules submits correct credentials on login
- **THEN** the system authenticates the user successfully

### Requirement: Frontend real-time password checklist on all new-password forms
The registration form, password-reset form, and password-change form in settings SHALL display a real-time checklist that reflects which password requirements are currently satisfied as the user types.

#### Scenario: Checklist updates on input
- **WHEN** a user types into a new-password field on any of the three forms
- **THEN** each checklist item visually indicates whether its requirement is currently met

#### Scenario: All checklist items satisfied
- **WHEN** all six requirements are met (length min, length max, uppercase, lowercase, digit, special)
- **THEN** all checklist items show a satisfied state

#### Scenario: Submit blocked until valid
- **WHEN** the password does not satisfy all Zod schema rules
- **THEN** form submission is prevented and errors are shown

#### Scenario: Checklist is the same component across all three forms
- **WHEN** the checklist is rendered in any of the three forms
- **THEN** it shows the same six rules, the same visual states, and the same behaviour
