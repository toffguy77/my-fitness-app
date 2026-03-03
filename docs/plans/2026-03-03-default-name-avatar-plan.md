# Default Name & Avatar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Assign a generated "Цвет Животное" name and matching SVG avatar to new users who register without a name.

**Architecture:** Backend-only logic change in auth service's Register function + static SVG files for default avatars. The name/avatar are written to the DB at registration time, so all existing frontend display code works without changes.

**Tech Stack:** Go (auth service), SVG static files

---

### Task 1: Create default SVG avatar files

**Files:**
- Create: `apps/web/public/avatars/default/cat.svg`
- Create: `apps/web/public/avatars/default/hedgehog.svg`
- Create: `apps/web/public/avatars/default/fox.svg`
- Create: `apps/web/public/avatars/default/bear.svg`
- Create: `apps/web/public/avatars/default/wolf.svg`
- Create: `apps/web/public/avatars/default/tiger.svg`
- Create: `apps/web/public/avatars/default/falcon.svg`
- Create: `apps/web/public/avatars/default/dolphin.svg`
- Create: `apps/web/public/avatars/default/panda.svg`
- Create: `apps/web/public/avatars/default/rabbit.svg`
- Create: `apps/web/public/avatars/default/lion.svg`
- Create: `apps/web/public/avatars/default/deer.svg`

**Step 1: Create the directory and SVG files**

Create `apps/web/public/avatars/default/` directory.

Create 12 simple SVG files — each is a 64×64 circle with a unique pastel background color and a minimalist animal silhouette path. Each SVG should be a self-contained `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` with a colored circle background and a white animal silhouette `<path>`.

Color palette for backgrounds (one per animal):
- cat: `#6366f1` (indigo)
- hedgehog: `#8b5cf6` (violet)
- fox: `#f97316` (orange)
- bear: `#78716c` (stone)
- wolf: `#64748b` (slate)
- tiger: `#eab308` (yellow)
- falcon: `#0ea5e9` (sky)
- dolphin: `#06b6d4` (cyan)
- panda: `#18181b` (zinc-900)
- rabbit: `#ec4899` (pink)
- lion: `#d97706` (amber)
- deer: `#16a34a` (green)

Keep SVGs minimal — under 1KB each. Simple geometric animal shapes.

**Step 2: Commit**

```bash
git add apps/web/public/avatars/default/
git commit -m "feat: add default SVG avatar icons for new users"
```

---

### Task 2: Add default name/avatar generation to auth service

**Files:**
- Modify: `apps/api/internal/modules/auth/service.go:52-74`
- Test: `apps/api/internal/modules/auth/service_test.go`

**Step 1: Add name/avatar generation constants and function**

Add after line 14 (after the imports), before the Service struct:

```go
// Default display names for users who register without a name.
// Format: "Цвет Животное" — deterministic by user ID.
var defaultColors = []string{
	"Синий", "Зелёный", "Красный", "Оранжевый", "Фиолетовый",
	"Золотой", "Серебряный", "Бирюзовый", "Розовый", "Белый",
}

var defaultAnimals = []string{
	"Кот", "Ёж", "Лис", "Медведь", "Волк", "Тигр",
	"Сокол", "Дельфин", "Панда", "Кролик", "Лев", "Олень",
}

// Maps animal name to SVG filename for default avatars
var animalAvatarFile = map[string]string{
	"Кот": "cat", "Ёж": "hedgehog", "Лис": "fox", "Медведь": "bear",
	"Волк": "wolf", "Тигр": "tiger", "Сокол": "falcon", "Дельфин": "dolphin",
	"Панда": "panda", "Кролик": "rabbit", "Лев": "lion", "Олень": "deer",
}

// generateDefaultIdentity returns a display name and avatar URL for a new user.
func generateDefaultIdentity(userID int64) (name, avatarURL string) {
	color := defaultColors[userID%int64(len(defaultColors))]
	animal := defaultAnimals[(userID/int64(len(defaultColors)))%int64(len(defaultAnimals))]
	name = color + " " + animal
	avatarURL = "/avatars/default/" + animalAvatarFile[animal] + ".svg"
	return name, avatarURL
}
```

**Step 2: Modify the Register function**

In the `Register` method (line 52), after the user is inserted and scanned (after line 74), add logic to update name and avatar_url if name is empty. The key insight: we need the user ID first (from RETURNING), then update.

Replace lines 52-74 with:

```go
func (s *Service) Register(ctx context.Context, email, password, name, ip, ua string) (*LoginResult, error) {
	s.log.Infow("User registration", "email", email)

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("ошибка при хешировании пароля: %w", err)
	}

	// Insert user into database
	query := `
		INSERT INTO users (email, password, name, role, created_at, updated_at)
		VALUES ($1, $2, $3, 'client', NOW(), NOW())
		RETURNING id, email, COALESCE(name, ''), role, COALESCE(onboarding_completed, false), created_at
	`

	var user User
	err = s.db.QueryRowContext(ctx, query, email, string(hashedPassword), name).Scan(
		&user.ID, &user.Email, &user.Name, &user.Role, &user.OnboardingCompleted, &user.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("ошибка при регистрации: %w", err)
	}

	// Assign default name and avatar when user registered without a name
	if strings.TrimSpace(name) == "" {
		defaultName, avatarURL := generateDefaultIdentity(user.ID)
		_, err = s.db.ExecContext(ctx,
			"UPDATE users SET name = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3",
			defaultName, avatarURL, user.ID,
		)
		if err != nil {
			s.log.Warnw("Failed to set default identity", "user_id", user.ID, "error", err)
		} else {
			user.Name = defaultName
		}
	}
```

Everything after (create settings, assign curator, generate tokens) stays the same.

**Step 3: Run tests to see what breaks**

Run: `cd apps/api && go test ./internal/modules/auth/ -v -run TestRegister`
Expected: "registration without name" test fails because it now expects an UPDATE query that the mock doesn't have.

**Step 4: Update the "registration without name" test**

In `service_test.go`, the test at line 66 needs to expect the new UPDATE query after INSERT.

After the `mock.ExpectExec("INSERT INTO user_settings")` block (line 78), add:

```go
// Expect default identity update
mock.ExpectExec("UPDATE users SET name").
    WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), int64(2)).
    WillReturnResult(sqlmock.NewResult(0, 1))
```

Also update the assertion to verify a default name was assigned:

```go
assert.NotEmpty(t, result.User.Name, "should have a default name")
assert.Contains(t, result.User.Name, " ", "default name should be 'Color Animal' format")
```

**Step 5: Add a new test for generateDefaultIdentity**

Add at the end of `service_test.go`:

```go
func TestGenerateDefaultIdentity(t *testing.T) {
	t.Run("deterministic by user ID", func(t *testing.T) {
		name1, avatar1 := generateDefaultIdentity(1)
		name2, avatar2 := generateDefaultIdentity(1)
		assert.Equal(t, name1, name2, "same ID should produce same name")
		assert.Equal(t, avatar1, avatar2, "same ID should produce same avatar")
	})

	t.Run("different IDs produce different names", func(t *testing.T) {
		name1, _ := generateDefaultIdentity(1)
		name2, _ := generateDefaultIdentity(2)
		assert.NotEqual(t, name1, name2)
	})

	t.Run("name has color and animal", func(t *testing.T) {
		name, _ := generateDefaultIdentity(42)
		parts := strings.Split(name, " ")
		assert.Len(t, parts, 2, "name should be 'Color Animal'")
	})

	t.Run("avatar URL points to SVG", func(t *testing.T) {
		_, avatar := generateDefaultIdentity(42)
		assert.True(t, strings.HasPrefix(avatar, "/avatars/default/"))
		assert.True(t, strings.HasSuffix(avatar, ".svg"))
	})
}
```

**Step 6: Run all auth tests**

Run: `cd apps/api && go test ./internal/modules/auth/ -v`
Expected: All tests pass

**Step 7: Build check**

Run: `cd apps/api && go build ./...`
Expected: Clean

**Step 8: Commit**

```bash
git add apps/api/internal/modules/auth/service.go apps/api/internal/modules/auth/service_test.go
git commit -m "feat: assign default name and avatar to users registering without a name"
```
