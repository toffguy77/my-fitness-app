# Social Username Validation & Display Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sanitize, validate, and verify social media usernames (Telegram/Instagram) on save, and display correct links.

**Architecture:** Add a `social.go` utility in the users module with sanitization (trim @, spaces, URLs), regex validation, and HTTP existence checks. Call it from `handler.go` before saving. Frontend display already uses `@{username}` / `https://t.me/{username}` pattern — once the DB stores clean usernames, links will be correct.

**Tech Stack:** Go (net/http for verification), existing Gin handler

---

### Task 1: Social username sanitization and validation utility

**Files:**
- Create: `apps/api/internal/modules/users/social.go`
- Create: `apps/api/internal/modules/users/social_test.go`

**Step 1: Write the failing tests for sanitization**

In `apps/api/internal/modules/users/social_test.go`:

```go
package users

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSanitizeUsername(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"plain username", "ya_thatguy", "ya_thatguy"},
		{"with @", "@ya_thatguy", "ya_thatguy"},
		{"with spaces", "  @ya_thatguy  ", "ya_thatguy"},
		{"telegram URL", "https://t.me/ya_thatguy", "ya_thatguy"},
		{"telegram URL with @", "https://t.me/@ya_thatguy", "ya_thatguy"},
		{"instagram URL", "https://instagram.com/ya_thatguy", "ya_thatguy"},
		{"instagram URL www", "https://www.instagram.com/ya_thatguy/", "ya_thatguy"},
		{"multiple @", "@@ya_thatguy", "ya_thatguy"},
		{"empty", "", ""},
		{"only @", "@", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sanitizeUsername(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestValidateUsernameFormat(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid", "ya_thatguy", false},
		{"valid with dots", "user.name", false},
		{"valid with numbers", "user123", false},
		{"empty is ok", "", false},
		{"too long", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", true},
		{"invalid chars", "user name!", true},
		{"cyrillic", "пользователь", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateUsernameFormat(tt.input)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && go test ./internal/modules/users/ -run "TestSanitize|TestValidateUsername" -v`
Expected: FAIL — `sanitizeUsername` and `validateUsernameFormat` undefined

**Step 3: Implement sanitization and validation**

In `apps/api/internal/modules/users/social.go`:

```go
package users

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_.]{1,64}$`)

// sanitizeUsername strips @, whitespace, and full URLs from a username.
func sanitizeUsername(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}

	// Strip known URL prefixes
	prefixes := []string{
		"https://t.me/",
		"http://t.me/",
		"https://www.instagram.com/",
		"https://instagram.com/",
		"http://www.instagram.com/",
		"http://instagram.com/",
	}
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			s = strings.TrimPrefix(s, p)
			break
		}
	}

	// Strip trailing slash
	s = strings.TrimRight(s, "/")

	// Strip leading @ signs
	s = strings.TrimLeft(s, "@")

	return s
}

// validateUsernameFormat checks that a username matches the allowed pattern.
func validateUsernameFormat(username string) error {
	if username == "" {
		return nil
	}
	if !usernameRegex.MatchString(username) {
		return fmt.Errorf("допустимы только латинские буквы, цифры, точки и подчёркивания (до 64 символов)")
	}
	return nil
}

// verifyUsernameExists makes an HTTP request to check if the account exists.
// Returns nil if the account exists or if verification is inconclusive.
// Returns an error only if we get a definitive 404.
func verifyUsernameExists(ctx context.Context, platform, username string) error {
	if username == "" {
		return nil
	}

	var url string
	switch platform {
	case "telegram":
		url = "https://t.me/" + username
	case "instagram":
		url = "https://www.instagram.com/" + username + "/"
	default:
		return nil
	}

	client := &http.Client{
		Timeout: 5 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil // can't verify — allow
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil // network error — allow
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("аккаунт @%s не найден в %s", username, platform)
	}

	// Any other status (200, 302, 429, etc.) — allow
	return nil
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && go test ./internal/modules/users/ -run "TestSanitize|TestValidateUsername" -v`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/internal/modules/users/social.go apps/api/internal/modules/users/social_test.go
git commit -m "feat: add social username sanitization and validation"
```

---

### Task 2: Wire validation into UpdateSettings handler

**Files:**
- Modify: `apps/api/internal/modules/users/handler.go:100-141`

**Step 1: Write the failing test for handler validation**

Add to `apps/api/internal/modules/users/social_test.go`:

```go
func TestSanitizeAndValidate_Integration(t *testing.T) {
	// Test full flow: sanitize then validate
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"normal with @", "@ya_thatguy", "ya_thatguy", false},
		{"full URL", "https://t.me/ya_thatguy", "ya_thatguy", false},
		{"invalid after sanitize", "@user name!", "", true},
		{"empty", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleaned := sanitizeUsername(tt.input)
			err := validateUsernameFormat(cleaned)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.want, cleaned)
			}
		})
	}
}
```

**Step 2: Run test**

Run: `cd apps/api && go test ./internal/modules/users/ -run "TestSanitizeAndValidate" -v`
Expected: PASS (logic already implemented)

**Step 3: Wire into handler**

In `apps/api/internal/modules/users/handler.go`, replace the UpdateSettings function body (lines 101-141). Add sanitization + validation + verification between the height check and the `service.UpdateSettings` call:

```go
// UpdateSettings updates user settings
func (h *Handler) UpdateSettings(c *gin.Context) {
	userID := getUserID(c)

	var req UpdateSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Validate timezone if provided
	if req.Timezone != "" {
		if _, err := time.LoadLocation(req.Timezone); err != nil {
			response.Error(c, http.StatusBadRequest, "Неверный часовой пояс")
			return
		}
	}

	// Validate height if provided
	if req.Height != nil && (*req.Height <= 0 || *req.Height > 300) {
		response.Error(c, http.StatusBadRequest, "Рост должен быть от 1 до 300 см")
		return
	}

	// Sanitize social usernames
	req.TelegramUsername = sanitizeUsername(req.TelegramUsername)
	req.InstagramUsername = sanitizeUsername(req.InstagramUsername)

	// Validate format
	if err := validateUsernameFormat(req.TelegramUsername); err != nil {
		response.Error(c, http.StatusBadRequest, "Telegram: "+err.Error())
		return
	}
	if err := validateUsernameFormat(req.InstagramUsername); err != nil {
		response.Error(c, http.StatusBadRequest, "Instagram: "+err.Error())
		return
	}

	// Verify accounts exist
	if err := verifyUsernameExists(c.Request.Context(), "telegram", req.TelegramUsername); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := verifyUsernameExists(c.Request.Context(), "instagram", req.InstagramUsername); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	settings, err := h.service.UpdateSettings(c.Request.Context(), userID, Settings{
		Language:           req.Language,
		Units:              req.Units,
		Timezone:           req.Timezone,
		TelegramUsername:   req.TelegramUsername,
		InstagramUsername:  req.InstagramUsername,
		AppleHealthEnabled: req.AppleHealthEnabled,
		TargetWeight:       req.TargetWeight,
		Height:             req.Height,
	})
	if err != nil {
		h.log.Errorw("Не удалось обновить настройки", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось обновить настройки")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"settings": settings})
}
```

**Step 4: Run all users tests**

Run: `cd apps/api && go test ./internal/modules/users/ -v`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/internal/modules/users/handler.go apps/api/internal/modules/users/social_test.go
git commit -m "feat: wire social username validation into UpdateSettings handler"
```

---

### Task 3: Add frontend validation feedback

**Files:**
- Modify: `apps/web/src/features/settings/components/SettingsSocial.tsx`

The backend now returns error messages for invalid usernames. The frontend should show these errors to the user. Currently `handleSave` calls `onSave` without error handling.

**Step 1: Update SocialForm to display API errors**

In `apps/web/src/features/settings/components/SettingsSocial.tsx`, update the `SocialForm`:

```tsx
function SocialForm({ profile, onSave }: {
    profile: { settings: { telegram_username: string; instagram_username: string } } | null;
    onSave: (settings: { telegram_username: string; instagram_username: string }) => Promise<void>;
}) {
    const [telegram, setTelegram] = useState(profile?.settings.telegram_username || '')
    const [instagram, setInstagram] = useState(profile?.settings.instagram_username || '')
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    async function handleSave() {
        setError(null)
        setSaving(true)
        try {
            await onSave({
                telegram_username: telegram,
                instagram_username: instagram,
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось сохранить')
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <SocialAccountsForm
                telegram={telegram}
                instagram={instagram}
                onTelegramChange={setTelegram}
                onInstagramChange={setInstagram}
            />

            {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
            )}

            <button
                onClick={handleSave}
                disabled={saving}
                className="mt-8 w-full rounded-lg bg-blue-600 py-3 text-white font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
                {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
        </>
    )
}
```

**Note:** Check that `SettingsPageLayout`'s `saveSettings` returns a promise that rejects on API error. If it swallows errors, update `SettingsPageLayout` to propagate them. Look at its implementation to confirm.

**Step 2: Verify the settings page renders**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add apps/web/src/features/settings/components/SettingsSocial.tsx
git commit -m "feat: show validation errors on social settings save"
```

---

### Task 4: Verify display is correct on curator page

**Files:**
- Review: `apps/web/src/features/curator/components/ClientInfoPanel.tsx:59-81`

**Step 1: Verify ClientInfoPanel display logic**

The current code at lines 61-67:
```tsx
<a href={`https://t.me/${detail.telegram_username}`}>
    @{detail.telegram_username}
</a>
```

This is already correct **IF the DB stores clean usernames** (without `@`). After Task 1-2, usernames will be stored clean, so:
- Link: `https://t.me/ya_thatguy` (correct)
- Display: `@ya_thatguy` (correct)

No changes needed here. Just verify manually after deploying.

**Step 2: Commit (no changes needed)**

No commit for this task — it's verification only.

---

### Task 5: SQL cleanup of existing data

**Step 1: Write a migration to clean existing usernames**

This can be a one-off SQL script. Run against the database:

```sql
UPDATE user_settings
SET telegram_username = LTRIM(TRIM(telegram_username), '@')
WHERE telegram_username LIKE '@%' OR telegram_username LIKE ' %';

UPDATE user_settings
SET instagram_username = LTRIM(TRIM(instagram_username), '@')
WHERE instagram_username LIKE '@%' OR instagram_username LIKE ' %';
```

**Step 2: Verify**

```sql
SELECT user_id, telegram_username, instagram_username
FROM user_settings
WHERE telegram_username != '' OR instagram_username != '';
```

Confirm no usernames start with `@`.
