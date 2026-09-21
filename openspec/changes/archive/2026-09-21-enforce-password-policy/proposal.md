## Why

The codebase has inconsistent password validation: the frontend allows passwords as short as 6 characters with no composition rules, the backend enforces composition only during password reset (not registration), and there is no maximum length. Additionally, authenticated users have no way to change their password at all — there is no endpoint and no settings UI. Aligning on OWASP-recommended rules consistently across all write paths (registration, password reset, password change) closes the security gap and provides a complete, consistent user experience.

## What Changes

- `PasswordValidator` gains a **maximum length** check (128 characters) in addition to existing minimum and composition checks
- `PasswordValidator` is wired into the **registration** flow (currently only used by `ResetService`)
- New `POST /api/auth/change-password` endpoint for authenticated users to change their password (requires current password verification + new password policy validation)
- Frontend `passwordSchema` (Zod) is updated to mirror backend rules: min 8, max 128, all four composition requirements
- A new `PasswordChecklist` React component provides real-time visual feedback during registration, password reset, **and password change in settings**
- New `SettingsPassword` component added to the settings feature for authenticated password change
- The login path is **not changed** — existing passwords continue to work regardless of strength

## Capabilities

### New Capabilities

- `password-policy`: Unified OWASP password validation rules (min 8, max 128, uppercase + lowercase + digit + special char) enforced on all new-password write paths — registration, password reset, and password change — with a consistent real-time frontend checklist

### Modified Capabilities

<!-- No existing specs are changing requirements -->

## Impact

**Backend:**
- `apps/api/internal/modules/auth/password_validator.go` — add max 128 check
- `apps/api/internal/modules/auth/service.go` — add `PasswordValidator` to `Service`, call in `Register`
- `apps/api/internal/modules/auth/handler.go` — add `ChangePassword` handler
- `apps/api/internal/modules/auth/service.go` — add `ChangePassword` service method (verify current password, validate new password, update hash)
- `apps/api/internal/modules/auth/service_test.go` — add weak-password and change-password test cases
- `apps/api/internal/modules/auth/reset_service_test.go` — add max-length test case to `TestPasswordValidation`

**Frontend:**
- `apps/web/src/features/auth/utils/validation.ts` — `passwordSchema`: min 6→8, add composition rules via `superRefine`
- `apps/web/src/features/auth/components/PasswordChecklist.tsx` — new shared component (used in auth + settings)
- `apps/web/src/features/auth/components/AuthScreen.tsx` — integrate checklist into registration form
- Reset password form — integrate checklist
- `apps/web/src/features/settings/components/SettingsPassword.tsx` — new component for password change
- `apps/web/src/features/settings/api/settings.ts` — add `changePassword` API call

**No database migrations. One new authenticated API endpoint.**
