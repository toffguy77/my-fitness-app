## 1. Backend: Update PasswordValidator

- [x] 1.1 Add `maxLength int` field to `PasswordValidator` struct in `password_validator.go`
- [x] 1.2 Set `maxLength: 128` in `NewPasswordValidator()`
- [x] 1.3 Add max-length check in `Validate()`: if `len(password) > pv.maxLength` append error "Пароль не должен превышать 128 символов"
- [x] 1.4 Add a comment next to `maxLength` noting that bcrypt truncates at 72 bytes; 128 is a UX ceiling above that limit

## 2. Backend: Wire PasswordValidator into Registration

- [x] 2.1 Add `passwordVal *PasswordValidator` field to `Service` struct in `service.go`
- [x] 2.2 Instantiate it via `NewPasswordValidator()` in `NewService()`
- [x] 2.3 In `Service.Register()`, call `s.passwordVal.Validate(password)` before the bcrypt hash; if `!result.Valid` return `fmt.Errorf("password does not meet requirements: %v", result.Errors)`
- [x] 2.4 Update Gin binding tag on `RegisterRequest.Password` from `min=8` to `min=8,max=128`

## 3. Backend: ChangePassword Endpoint

- [x] 3.1 Add `ChangePasswordRequest` struct to `handler.go` with fields `CurrentPassword string` and `NewPassword string` (both `binding:"required"`)
- [x] 3.2 Add `ChangePassword(c *gin.Context)` handler to `Handler` in `handler.go`: extract user ID from JWT context, bind request, call `s.service.ChangePassword()`
- [x] 3.3 Add `ChangePassword(ctx, userID, currentPassword, newPassword string) error` method to `Service` in `service.go`:
  - Fetch stored hash by user ID
  - `bcrypt.CompareHashAndPassword` against `currentPassword`; return 401-style error on mismatch
  - Check new password is not identical to current (compare hashes); return error if same
  - `s.passwordVal.Validate(newPassword)`; return validation errors on failure
  - Hash new password with `bcrypt.DefaultCost` and `UPDATE users SET password = $1`
- [x] 3.4 Register route `POST /api/auth/change-password` with `RequireAuth` middleware in the auth router

## 4. Backend: Tests

- [ ] 4.1 In `reset_service_test.go` `TestPasswordValidation`, add a case for password exceeding 128 characters (expect failure)
- [ ] 4.2 Add `TestRegister_WeakPassword` in `service_test.go` covering: too short, no uppercase, no lowercase, no digit, no special char
- [ ] 4.3 Add `TestRegister_PasswordTooLong` in `service_test.go` for > 128 chars
- [ ] 4.4 Add `TestChangePassword_Success` in `service_test.go`
- [ ] 4.5 Add `TestChangePassword_WrongCurrentPassword` in `service_test.go`
- [ ] 4.6 Add `TestChangePassword_WeakNewPassword` in `service_test.go`
- [ ] 4.7 Add `TestChangePassword_SamePassword` in `service_test.go`
- [x] 4.8 Add `TestChangePasswordHandler_Unauthenticated` in `handler_test.go`
- [x] 4.9 Run `go test ./internal/modules/auth/...` and confirm all tests pass

## 5. Frontend: Update Zod Password Schema

- [x] 5.1 In `apps/web/src/features/auth/utils/validation.ts`, change `passwordSchema` min from 6 to 8 with message "Пароль должен содержать минимум 8 символов"
- [x] 5.2 Keep `max(128, 'Пароль не должен превышать 128 символов')` (already present)
- [x] 5.3 Add `.superRefine((val, ctx) => { ... })` after `max()` with four `ctx.addIssue` calls for: no uppercase, no lowercase, no digit, no special char — each with `code: z.ZodIssueCode.custom` and a specific Russian-language message

## 6. Frontend: PasswordChecklist Component

- [x] 6.1 Create `apps/web/src/features/auth/components/PasswordChecklist.tsx` with a `password: string` prop
- [x] 6.2 Compute satisfaction of all six rules (min 8, max 128, uppercase, lowercase, digit, special) as local booleans
- [x] 6.3 Render a list of six items; each shows a check icon (green) when satisfied and an unmet indicator (grey/red) when not
- [x] 6.4 Only render the checklist when `password.length > 0` (hide before user starts typing)

## 7. Frontend: Integrate Checklist into Registration Form

- [x] 7.1 Import and render `<PasswordChecklist password={passwordValue} />` directly below the password input in the registration form in `AuthScreen.tsx`
- [x] 7.2 Verify checklist updates correctly as user types; verify Zod errors still appear on blur/submit

## 8. Frontend: Integrate Checklist into Reset Password Form

- [x] 8.1 Locate the reset password form component (password-reset page)
- [x] 8.2 Import and render `<PasswordChecklist password={passwordValue} />` below the new-password input
- [x] 8.3 Verify checklist and Zod validation work end-to-end on the reset flow

## 9. Frontend: Settings — Password Change

- [x] 9.1 Add `changePassword(currentPassword: string, newPassword: string): Promise<void>` to `apps/web/src/features/settings/api/settings.ts` calling `POST /api/auth/change-password`
- [x] 9.2 Create `apps/web/src/features/settings/components/SettingsPassword.tsx` with a form: current password field (no checklist), new password field + `<PasswordChecklist>`, confirm new password field
- [x] 9.3 Use `passwordSchema` for the new password field and a simple `z.string().min(1)` for current password; add a `superRefine` to confirm field that checks new === confirm
- [x] 9.4 On submit: call `changePassword()`, show success state, clear all fields on success; show server error on failure (wrong current password, policy violation)
- [x] 9.5 Add `<SettingsPassword />` to the settings page layout

## 10. Frontend: Tests

- [x] 10.1 Add unit tests for `passwordSchema` in `validation.test.ts`: each composition rule rejects correctly, min 8 rejects 7-char, max 128 rejects 129-char
- [x] 10.2 Add unit tests for `PasswordChecklist`: each rule flag toggles correctly as the password prop changes
- [x] 10.3 Add unit tests for `SettingsPassword`: form validation, success state, wrong-password error from API
- [x] 10.4 Run `cd apps/web && npx jest features/auth features/settings` and confirm all tests pass
