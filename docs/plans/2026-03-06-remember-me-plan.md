# "Remember Me" Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "Remember me" checkbox to login form that extends refresh token lifetime from 24h (default) to 30 days.

**Architecture:** Add `remember_me` boolean to login request body. Backend uses it to set refresh token TTL. Flag is stored in `refresh_tokens` table so refresh rotation inherits it. Frontend adds checkbox to login form only.

**Tech Stack:** Go/Gin backend, PostgreSQL, Next.js/React frontend, Zustand, Tailwind CSS v4

---

### Task 1: Database migration — add `remember_me` column

**Files:**
- Create: `apps/api/migrations/037_add_remember_me_to_refresh_tokens_up.sql`
- Create: `apps/api/migrations/037_add_remember_me_to_refresh_tokens_down.sql`

**Step 1: Write up migration**

```sql
-- 037_add_remember_me_to_refresh_tokens_up.sql
ALTER TABLE refresh_tokens ADD COLUMN remember_me BOOLEAN NOT NULL DEFAULT false;
```

**Step 2: Write down migration**

```sql
-- 037_add_remember_me_to_refresh_tokens_down.sql
ALTER TABLE refresh_tokens DROP COLUMN remember_me;
```

**Step 3: Commit**

```bash
git add apps/api/migrations/037_*
git commit -m "feat(db): add remember_me column to refresh_tokens"
```

---

### Task 2: Backend — update `service.go` with TTL constants and `rememberMe` parameter

**Files:**
- Modify: `apps/api/internal/modules/auth/service.go`
- Test: `apps/api/internal/modules/auth/service_test.go`

**Step 1: Write failing tests**

Add to `service_test.go`:

```go
func TestLoginRememberMe(t *testing.T) {
	t.Run("login with rememberMe=false uses 24h TTL", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		hashedPw, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

		mock.ExpectQuery("SELECT id, email").
			WithArgs("test@example.com").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "email_verified", "onboarding_completed", "created_at"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", false, false, time.Now()))

		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(1), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent", false).
			WillReturnResult(sqlmock.NewResult(1, 1))

		result, err := service.Login(ctx, "test@example.com", "password123", "127.0.0.1", "TestAgent", false)
		assert.NoError(t, err)
		assert.NotNil(t, result)
		assert.NotEmpty(t, result.Token)
		assert.NotEmpty(t, result.RefreshToken)
	})

	t.Run("login with rememberMe=true uses 30d TTL", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		hashedPw, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

		mock.ExpectQuery("SELECT id, email").
			WithArgs("test@example.com").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "email_verified", "onboarding_completed", "created_at"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", false, false, time.Now()))

		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(1), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent", true).
			WillReturnResult(sqlmock.NewResult(1, 1))

		result, err := service.Login(ctx, "test@example.com", "password123", "127.0.0.1", "TestAgent", true)
		assert.NoError(t, err)
		assert.NotNil(t, result)
	})
}
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && go test ./internal/modules/auth/ -run TestLoginRememberMe -v`
Expected: FAIL — `Login()` doesn't accept `rememberMe` parameter yet.

**Step 3: Implement changes in `service.go`**

Add TTL constants at the top of `service.go` (after imports):

```go
const (
	RefreshTokenTTLDefault    = 24 * time.Hour
	RefreshTokenTTLRememberMe = 30 * 24 * time.Hour
)
```

Modify `Login()` signature (line 168):

```go
func (s *Service) Login(ctx context.Context, email, password, ip, ua string, rememberMe bool) (*LoginResult, error) {
```

Change the `createRefreshToken` call inside `Login()` (line 215):

```go
refreshToken, err := s.createRefreshToken(ctx, user.ID, ip, ua, rememberMe)
```

Modify `createRefreshToken()` signature and body (line 337):

```go
func (s *Service) createRefreshToken(ctx context.Context, userID int64, ip, ua string, rememberMe bool) (string, error) {
	plainToken, hashedToken, err := s.tokens.GenerateToken()
	if err != nil {
		return "", fmt.Errorf("failed to generate refresh token: %w", err)
	}

	ttl := RefreshTokenTTLDefault
	if rememberMe {
		ttl = RefreshTokenTTLRememberMe
	}
	expiresAt := time.Now().Add(ttl)

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent, remember_me, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
		userID, hashedToken, expiresAt, ip, ua, rememberMe,
	)
	if err != nil {
		return "", fmt.Errorf("failed to store refresh token: %w", err)
	}

	return plainToken, nil
}
```

Update `Register()` call to `createRefreshToken` (line 155) — registration always uses default TTL:

```go
refreshToken, err := s.createRefreshToken(ctx, user.ID, ip, ua, false)
```

**Step 4: Fix existing `TestLoginService` tests**

Update all existing `Login()` calls in `service_test.go` to pass `false` as the last argument:

```go
// In TestLoginService "successful login returns tokens":
result, err := service.Login(ctx, "test@example.com", "password123", "127.0.0.1", "TestAgent", false)

// In TestLoginService "wrong password":
result, err := service.Login(ctx, "test@example.com", "wrongpassword", "", "", false)
```

Update all `INSERT INTO refresh_tokens` mock expectations to include `rememberMe` param (6 args instead of 5):

```go
mock.ExpectExec("INSERT INTO refresh_tokens").
    WithArgs(int64(1), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent", false).
    WillReturnResult(sqlmock.NewResult(1, 1))
```

**Step 5: Run all auth tests**

Run: `cd apps/api && go test ./internal/modules/auth/ -v`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/internal/modules/auth/service.go apps/api/internal/modules/auth/service_test.go
git commit -m "feat(auth): add rememberMe parameter to Login and createRefreshToken"
```

---

### Task 3: Backend — update `RefreshTokens()` to inherit `remember_me` flag

**Files:**
- Modify: `apps/api/internal/modules/auth/service.go`
- Modify: `apps/api/internal/modules/auth/service_test.go`

**Step 1: Write failing test**

Add to `service_test.go`:

```go
func TestRefreshTokensInheritsRememberMe(t *testing.T) {
	t.Run("refresh inherits remember_me=true from old token", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		plainToken := "test-refresh-token"
		tokenHash := service.tokens.HashToken(plainToken)
		expiresAt := time.Now().Add(24 * time.Hour)

		// Lookup refresh token — now includes remember_me
		mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, remember_me FROM refresh_tokens").
			WithArgs(tokenHash).
			WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at", "remember_me"}).
				AddRow(1, int64(42), expiresAt, nil, true))

		mock.ExpectBegin()

		mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
			WithArgs(sqlmock.AnyArg(), int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// New token should also have remember_me=true
		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(42), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent", true).
			WillReturnResult(sqlmock.NewResult(2, 1))

		mock.ExpectCommit()

		mock.ExpectQuery("SELECT id, email").
			WithArgs(int64(42)).
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at"}).
				AddRow(42, "user@example.com", "User", "client", true, true, time.Now()))

		result, err := service.RefreshTokens(ctx, plainToken, "127.0.0.1", "TestAgent")
		assert.NoError(t, err)
		assert.NotNil(t, result)
	})
}
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/modules/auth/ -run TestRefreshTokensInheritsRememberMe -v`
Expected: FAIL — query doesn't select `remember_me` yet.

**Step 3: Implement changes in `RefreshTokens()` (service.go line 228)**

Update the SELECT to include `remember_me`:

```go
func (s *Service) RefreshTokens(ctx context.Context, plainToken, ip, ua string) (*LoginResult, error) {
	tokenHash := s.tokens.HashToken(plainToken)

	var id, userID int64
	var expiresAt time.Time
	var revokedAt sql.NullTime
	var rememberMe bool

	err := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, expires_at, revoked_at, remember_me FROM refresh_tokens WHERE token_hash = $1`,
		tokenHash,
	).Scan(&id, &userID, &expiresAt, &revokedAt, &rememberMe)
```

Update the INSERT for new token to include `remember_me` and use correct TTL:

```go
	// Insert new refresh token
	ttl := RefreshTokenTTLDefault
	if rememberMe {
		ttl = RefreshTokenTTLRememberMe
	}
	expiresAtNew := time.Now().Add(ttl)
	_, err = tx.ExecContext(dbCtx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent, remember_me, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
		userID, newHash, expiresAtNew, ip, ua, rememberMe,
	)
```

**Step 4: Fix existing `TestRefreshTokens` tests**

Update the SELECT query mock and add `remember_me` column in existing refresh tests:

```go
// In "successful refresh rotates tokens":
mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, remember_me FROM refresh_tokens").
    WithArgs(tokenHash).
    WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at", "remember_me"}).
        AddRow(1, int64(42), expiresAt, nil, false))

// Update INSERT mock to 6 args:
mock.ExpectExec("INSERT INTO refresh_tokens").
    WithArgs(int64(42), sqlmock.AnyArg(), sqlmock.AnyArg(), "127.0.0.1", "TestAgent", false).
    WillReturnResult(sqlmock.NewResult(2, 1))

// In "expired refresh token is rejected":
mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, remember_me FROM refresh_tokens").
    WithArgs(tokenHash).
    WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at", "remember_me"}).
        AddRow(1, int64(42), expiredAt, nil, false))

// In "revoked token triggers reuse detection":
mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, remember_me FROM refresh_tokens").
    WithArgs(tokenHash).
    WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at", "remember_me"}).
        AddRow(1, int64(42), time.Now().Add(24*time.Hour), revokedAt, false))

// In "unknown token is rejected":
mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, remember_me FROM refresh_tokens").
    WithArgs(tokenHash).
    WillReturnError(sql.ErrNoRows)
```

**Step 5: Run all auth tests**

Run: `cd apps/api && go test ./internal/modules/auth/ -v`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/internal/modules/auth/service.go apps/api/internal/modules/auth/service_test.go
git commit -m "feat(auth): inherit remember_me flag during refresh token rotation"
```

---

### Task 4: Backend — update `handler.go` to pass `rememberMe` flag

**Files:**
- Modify: `apps/api/internal/modules/auth/handler.go`
- Modify: `apps/api/internal/modules/auth/handler_test.go`

**Step 1: Write failing test**

Add to `handler_test.go`:

```go
func TestLoginWithRememberMe(t *testing.T) {
	t.Run("login with remember_me=true passes flag to service", func(t *testing.T) {
		handler, mock, cleanup := setupTestHandler(t)
		defer cleanup()

		hashedPw, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

		mock.ExpectQuery("SELECT id, email").
			WithArgs("test@example.com").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "email_verified", "onboarding_completed", "created_at"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", false, false, time.Now()))

		mock.ExpectExec("INSERT INTO refresh_tokens").
			WithArgs(int64(1), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), true).
			WillReturnResult(sqlmock.NewResult(1, 1))

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(map[string]interface{}{
			"email":       "test@example.com",
			"password":    "password123",
			"remember_me": true,
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.Login(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})
}
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/modules/auth/ -run TestLoginWithRememberMe -v`
Expected: FAIL — `Login()` call in handler doesn't pass `rememberMe`.

**Step 3: Implement changes in `handler.go`**

Update `LoginRequest` struct (line 48):

```go
type LoginRequest struct {
	Email      string `json:"email" binding:"required,email"`
	Password   string `json:"password" binding:"required"`
	RememberMe bool   `json:"remember_me"`
}
```

Update `Login()` handler call (line 96):

```go
result, err := h.service.Login(c.Request.Context(), req.Email, req.Password, c.ClientIP(), c.Request.UserAgent(), req.RememberMe)
```

**Step 4: Fix existing `TestLogin` handler tests**

Update INSERT mock expectations in existing handler tests to include `false` for `remember_me` (6 args):

```go
// In TestLogin "successful login returns tokens":
mock.ExpectExec("INSERT INTO refresh_tokens").
    WithArgs(int64(1), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), false).
    WillReturnResult(sqlmock.NewResult(1, 1))

// In TestRegister "successful registration returns tokens":
mock.ExpectExec("INSERT INTO refresh_tokens").
    WithArgs(int64(1), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), false).
    WillReturnResult(sqlmock.NewResult(1, 1))
```

**Step 5: Run all auth tests**

Run: `cd apps/api && go test ./internal/modules/auth/ -v`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/internal/modules/auth/handler.go apps/api/internal/modules/auth/handler_test.go
git commit -m "feat(auth): add remember_me field to LoginRequest and pass to service"
```

---

### Task 5: Frontend — update API client and types

**Files:**
- Modify: `apps/web/src/features/auth/types/index.ts`
- Modify: `apps/web/src/features/auth/api/auth.ts`
- Modify: `apps/web/src/features/auth/hooks/useAuth.ts`

**Step 1: Update `AuthFormData` type**

In `apps/web/src/features/auth/types/index.ts`, add `rememberMe` to `AuthFormData`:

```typescript
export interface AuthFormData {
    email: string;
    password: string;
    rememberMe?: boolean;
}
```

**Step 2: Update `loginUser()` in `auth.ts`**

In `apps/web/src/features/auth/api/auth.ts`, add `remember_me` to the request body:

```typescript
export async function loginUser(data: AuthFormData): Promise<AuthResponse> {
    try {
        const response = await apiClient.post<AuthResponse>(`${API_BASE}/backend-api/v1/auth/login`, {
            email: data.email,
            password: data.password,
            remember_me: data.rememberMe ?? false,
        });

        return response;
    } catch (error: any) {
        throw mapApiError(error);
    }
}
```

**Step 3: Verify `useAuth.ts` needs no changes**

The `login` function in `useAuth.ts` already passes the full `AuthFormData` object to `loginUser(data)`, so the `rememberMe` field will be automatically included. No changes needed.

**Step 4: Commit**

```bash
git add apps/web/src/features/auth/types/index.ts apps/web/src/features/auth/api/auth.ts
git commit -m "feat(auth): add remember_me to login API request"
```

---

### Task 6: Frontend — add "Запомнить меня" checkbox to login form

**Files:**
- Modify: `apps/web/src/features/auth/components/AuthScreen.tsx`

**Step 1: Add `rememberMe` state and checkbox**

In `AuthScreen.tsx`, add `rememberMe` to `formData` initial state:

```typescript
const [formData, setFormData] = useState<AuthFormData>({
    email: '',
    password: '',
    rememberMe: false,
});
```

Add a checkbox between the `<AuthForm />` and the action buttons, inside the login view only. Insert after the closing `/>` of `<AuthForm>` (line 94) and before `{mode === 'register' && (`:

```tsx
{/* Remember Me (Login only) */}
{mode === 'login' && (
    <div className="mt-4">
        <label className="flex items-center gap-2 cursor-pointer">
            <input
                type="checkbox"
                checked={formData.rememberMe ?? false}
                onChange={(e) =>
                    setFormData({ ...formData, rememberMe: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">
                Запомнить меня на 30 дней
            </span>
        </label>
    </div>
)}
```

**Step 2: Run frontend type check**

Run: `cd apps/web && npm run type-check`
Expected: PASS

**Step 3: Run frontend lint**

Run: `cd apps/web && npm run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/features/auth/components/AuthScreen.tsx
git commit -m "feat(auth): add 'Remember me' checkbox to login form"
```

---

### Task 7: Run full test suites and verify

**Step 1: Run all backend tests**

Run: `cd apps/api && go test ./... -v`
Expected: PASS

**Step 2: Run all frontend tests**

Run: `cd apps/web && npx jest`
Expected: PASS

**Step 3: Run frontend build**

Run: `make build-web`
Expected: PASS — no type errors or build issues.

**Step 4: Manual smoke test**

Run: `make dev`

1. Open `http://localhost:3069/auth`
2. Verify "Запомнить меня на 30 дней" checkbox appears below password field
3. Switch to registration mode — verify checkbox disappears
4. Switch back to login — verify checkbox reappears
5. Login with checkbox checked — verify login works
6. Login with checkbox unchecked — verify login works

**Step 5: Commit if any fixes were needed, otherwise done**
