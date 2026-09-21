## Context

Password validation is split across two Go services and two TypeScript validation layers with no shared contract:

- `PasswordValidator` (composition rules + min 8) exists but is only called in `ResetService.ResetPassword` — registration bypasses it entirely
- The frontend Zod schema has `min(6)` for login/register, diverging from the backend's min 8
- No maximum length is enforced anywhere; bcrypt silently truncates input at 72 bytes, so passwords beyond that length are effectively equivalent
- Authenticated users have no way to change their password — no endpoint exists, no settings UI exists
- The login path uses `bcrypt.CompareHashAndPassword` directly — it has no password policy and must stay unchanged to not break existing accounts

## Goals / Non-Goals

**Goals:**
- Enforce identical OWASP rules (min 8, max 128, uppercase + lowercase + digit + special) on **all** new-password write paths: registration, password reset, and password change
- Provide consistent UX across all three flows: same `PasswordChecklist` component, same Zod schema
- Add `POST /api/auth/change-password` for authenticated users
- Eliminate the min-6 / min-8 divergence between frontend and backend

**Non-Goals:**
- Forcing existing users to change weak passwords
- Breach-database checking (HaveIBeenPwned)
- Changing the login flow in any way

## Decisions

### 1. Add `PasswordValidator` to `auth.Service`, not just `ResetService`

**Decision:** Instantiate `PasswordValidator` in `NewService()` and call `Validate()` before hashing in `Register()` and `ChangePassword()`.

**Rationale:** Mirrors the existing pattern in `ResetService` exactly. No new abstractions needed. The validator is already unit-tested — coverage of additional paths is free.

**Alternative considered:** Validate in the handler via a Gin binding tag custom validator. Rejected because it complicates error formatting and diverges from how `ResetService` handles it.

### 2. `ChangePassword` endpoint lives in `auth` module, not `users`

**Decision:** Add `ChangePassword(userID, currentPassword, newPassword)` to `auth.Service` and expose it via a new handler on the existing `auth` router at `POST /api/auth/change-password`. Protected by `RequireAuth` middleware.

**Rationale:** All password logic — `PasswordValidator`, bcrypt hashing, `ResetService` — already lives in the `auth` package. Adding the change-password operation here avoids cross-package imports and keeps the password boundary clean. The `users` module handles profile data (name, body metrics, notifications), not credentials.

**Alternative considered:** Put the endpoint in `users` and import `PasswordValidator` from `auth`. Rejected because Go discourages cross-module imports between sibling domain packages; keeping credential operations in `auth` is the right boundary.

### 3. `ChangePassword` verifies current password before accepting new one

**Decision:** The service method fetches the stored hash for `userID`, calls `bcrypt.CompareHashAndPassword` against `currentPassword`, then runs `PasswordValidator.Validate(newPassword)` before writing the new hash.

**Rationale:** Standard authenticated password change flow — prevents account takeover via XSS or unlocked session. Current password check is a hard requirement, not configurable.

### 4. Max 128 added to `PasswordValidator`, not as a separate guard

**Decision:** Add `if len(password) > pv.maxLength` check inside `Validate()`, with `maxLength: 128` set in `NewPasswordValidator()`.

**Rationale:** Keeps all password rules in one place. bcrypt truncates at 72 bytes — the 128-char max is a UX ceiling well above the bcrypt limit, preventing user confusion with extremely long passwords.

### 5. Frontend: `superRefine` for composition rules in Zod

**Decision:** Replace `min(6)` with `min(8)`, add `max(128)`, and use `.superRefine()` to add one `ctx.addIssue` per failed composition rule with specific message strings.

**Rationale:** `superRefine` allows multiple specific error messages from a single refinement, matching the granularity of `ValidationResult.Errors` on the backend. Enables the checklist to show per-rule state from Zod form state.

**Alternative considered:** Four chained `.refine()` calls. Rejected because each `.refine()` only fires if all previous ones pass — users see errors one at a time instead of all at once.

### 6. `PasswordChecklist` is a pure presentational component shared across all three flows

**Decision:** `PasswordChecklist` receives a `password: string` prop and computes rule satisfaction internally. It lives in `features/auth/components/` and is imported by both the auth forms and `SettingsPassword`.

**Rationale:** Decouples the visual checklist from the form library and the feature it's used in. The same rules apply in all three flows — one component, three usage sites. Checklist shows state from the first keystroke; Zod errors appear on blur/submit.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Existing users with weak passwords can no longer use "Forgot Password" to set a new weak password | Intentional — that is the point of this change |
| bcrypt 72-byte truncation means a 128-char max still allows passwords that hash identically above 72 bytes | Acceptable; the max is a UX guard, not a cryptographic one. Documented in code comment. |
| Gin binding tag `min=8` on `RegisterRequest` and the service-layer `PasswordValidator` both check min length | Minor redundancy, but the binding tag is a fast first-pass reject before the service is called. Keep both. |
| `ChangePassword` endpoint adds a new attack surface for brute-force of current password | Existing IP-based rate limiting middleware applies to all auth routes; no special handling needed |

## Migration Plan

1. Deploy backend changes — registration, reset, and the new change-password endpoint all enforce the policy
2. Deploy frontend changes simultaneously — checklist and updated Zod prevent weak-password submissions at the UX layer
3. No data migration needed; no existing password hashes are touched
4. Rollback: revert both deploys; no state was written that needs unwinding

## Open Questions

- None — scope is fully defined.
