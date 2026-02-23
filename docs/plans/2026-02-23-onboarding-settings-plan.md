# Onboarding & Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a step-by-step onboarding wizard after registration and a full settings system accessible from a redesigned profile page.

**Architecture:** Shared controlled components in `apps/web/src/shared/components/settings/` are reused by two features: `features/onboarding/` (wizard wrapper) and `features/settings/` (standalone pages). Backend extends the users module with real DB queries, avatar upload via S3, and user_settings table.

**Tech Stack:** Next.js 16 (App Router), React 19, Zustand, Tailwind CSS v4, Go/Gin, PostgreSQL (pgx pattern via database/sql), Yandex S3

**Design doc:** `docs/plans/2026-02-23-onboarding-settings-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `apps/api/migrations/014_user_settings_up.sql`
- Create: `apps/api/migrations/014_user_settings_down.sql`

**Step 1: Write up migration**

```sql
-- 014_user_settings_up.sql

-- Extend users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- User settings table (1:1 with users)
CREATE TABLE IF NOT EXISTS user_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'en')),
  units TEXT NOT NULL DEFAULT 'metric' CHECK (units IN ('metric', 'imperial')),
  telegram_username TEXT,
  instagram_username TEXT,
  apple_health_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

COMMENT ON TABLE user_settings IS 'User preferences and social account links';
```

```sql
-- 014_user_settings_down.sql
DROP TABLE IF EXISTS user_settings;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed;
```

**Step 2: Commit**

```bash
git add apps/api/migrations/014_user_settings_up.sql apps/api/migrations/014_user_settings_down.sql
git commit -m "feat: add user_settings migration (014)"
```

---

## Task 2: Backend Config — Profile Photos S3

The profile photos use a separate S3 bucket (`profiles-photos`) with dedicated credentials. Add config fields.

**Files:**
- Modify: `apps/api/internal/config/config.go`

**Step 1: Add config fields**

Add these fields to the Config struct:

```go
// Profile Photos S3 (separate bucket/credentials)
ProfilePhotosS3AccessKeyID     string `envconfig:"PROFILE_PHOTOS_S3_ACCESS_KEY_ID"`
ProfilePhotosS3SecretAccessKey string `envconfig:"PROFILE_PHOTOS_S3_SECRET_ACCESS_KEY"`
ProfilePhotosS3Bucket          string `envconfig:"PROFILE_PHOTOS_S3_BUCKET" default:"profiles-photos"`
ProfilePhotosS3Region          string `envconfig:"PROFILE_PHOTOS_S3_REGION" default:"ru-central1"`
ProfilePhotosS3Endpoint        string `envconfig:"PROFILE_PHOTOS_S3_ENDPOINT" default:"https://storage.yandexcloud.net"`
```

**Step 2: Add .env.example entries**

Add to `.env` / `.env.example`:

```
PROFILE_PHOTOS_S3_ACCESS_KEY_ID=<your-access-key>
PROFILE_PHOTOS_S3_SECRET_ACCESS_KEY=<your-secret-key>
PROFILE_PHOTOS_S3_BUCKET=profiles-photos
```

**Step 3: Initialize profile photos S3 client in main.go**

In `apps/api/cmd/server/main.go`, after the existing S3 client init, add:

```go
// Initialize profile photos S3 client
var profilePhotosS3 *storage.S3Client
if cfg.ProfilePhotosS3AccessKeyID != "" && cfg.ProfilePhotosS3SecretAccessKey != "" {
    profilePhotosS3, err = storage.NewS3Client(&storage.S3Config{
        AccessKeyID:    cfg.ProfilePhotosS3AccessKeyID,
        SecretAccessKey: cfg.ProfilePhotosS3SecretAccessKey,
        Bucket:         cfg.ProfilePhotosS3Bucket,
        Region:         cfg.ProfilePhotosS3Region,
        Endpoint:       cfg.ProfilePhotosS3Endpoint,
    }, log)
    if err != nil {
        log.Error("Failed to initialize profile photos S3 client", "error", err)
    } else {
        log.Info("Profile photos S3 client initialized", "bucket", cfg.ProfilePhotosS3Bucket)
    }
}
```

**Step 4: Commit**

```bash
git add apps/api/internal/config/config.go apps/api/cmd/server/main.go
git commit -m "feat: add profile photos S3 config"
```

---

## Task 3: Backend — Users Service (Real DB)

Replace placeholder service with real PostgreSQL queries. The service needs `*sql.DB` and `*storage.S3Client`.

**Files:**
- Rewrite: `apps/api/internal/modules/users/service.go`
- Create: `apps/api/internal/modules/users/service_test.go`

**Step 1: Write tests for GetProfile**

Test that GetProfile returns user data joined with user_settings. Use sqlmock or a test helper.

```go
func TestGetProfile_ReturnsUserWithSettings(t *testing.T) {
    // Setup: mock DB with user row + settings row
    // Call: service.GetProfile(ctx, userID)
    // Assert: returned profile has all fields populated
}
```

**Step 2: Implement the Profile and Settings structs**

```go
type FullProfile struct {
    ID                  int64    `json:"id"`
    Email               string   `json:"email"`
    Name                string   `json:"name,omitempty"`
    Role                string   `json:"role"`
    AvatarURL           string   `json:"avatar_url,omitempty"`
    OnboardingCompleted bool     `json:"onboarding_completed"`
    Settings            Settings `json:"settings"`
}

type Settings struct {
    Language           string `json:"language"`
    Units              string `json:"units"`
    TelegramUsername   string `json:"telegram_username,omitempty"`
    InstagramUsername   string `json:"instagram_username,omitempty"`
    AppleHealthEnabled bool   `json:"apple_health_enabled"`
}
```

**Step 3: Implement service methods**

Service struct now takes `db *sql.DB`, `s3 *storage.S3Client`, `cfg`, `log`.

Methods to implement:
- `GetProfile(ctx, userID) (*FullProfile, error)` — LEFT JOIN users with user_settings
- `UpdateProfile(ctx, userID, name) (*FullProfile, error)` — UPDATE users SET name
- `UpdateSettings(ctx, userID, settings Settings) (*Settings, error)` — UPSERT user_settings (INSERT ON CONFLICT UPDATE)
- `UploadAvatar(ctx, userID, file io.Reader, contentType string, size int64) (string, error)` — S3 upload, UPDATE users SET avatar_url
- `DeleteAvatar(ctx, userID) error` — S3 delete, UPDATE users SET avatar_url = NULL
- `CompleteOnboarding(ctx, userID) error` — UPDATE users SET onboarding_completed = true
- `EnsureSettingsExist(ctx, userID) error` — INSERT user_settings IF NOT EXISTS (called on register)

**Key SQL patterns:**

GetProfile query:
```sql
SELECT u.id, u.email, u.name, u.role, u.avatar_url, u.onboarding_completed,
       COALESCE(s.language, 'ru'), COALESCE(s.units, 'metric'),
       s.telegram_username, s.instagram_username, COALESCE(s.apple_health_enabled, false)
FROM users u
LEFT JOIN user_settings s ON s.user_id = u.id
WHERE u.id = $1
```

UpdateSettings upsert:
```sql
INSERT INTO user_settings (user_id, language, units, telegram_username, instagram_username, apple_health_enabled, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
ON CONFLICT (user_id) DO UPDATE SET
  language = EXCLUDED.language,
  units = EXCLUDED.units,
  telegram_username = EXCLUDED.telegram_username,
  instagram_username = EXCLUDED.instagram_username,
  apple_health_enabled = EXCLUDED.apple_health_enabled,
  updated_at = NOW()
RETURNING language, units, telegram_username, instagram_username, apple_health_enabled
```

Avatar S3 key: `avatars/{userID}/avatar{ext}` where ext is derived from content type.

**Step 4: Run tests**

```bash
cd apps/api && go test ./internal/modules/users/ -v
```

**Step 5: Commit**

```bash
git add apps/api/internal/modules/users/
git commit -m "feat: implement users service with real DB queries"
```

---

## Task 4: Backend — Users Handler (New Endpoints)

Add handlers for settings, avatar upload/delete, and onboarding complete.

**Files:**
- Rewrite: `apps/api/internal/modules/users/handler.go`
- Create: `apps/api/internal/modules/users/handler_test.go`

**Step 1: Update Handler struct**

Handler now takes `db *sql.DB` and `s3 *storage.S3Client`:

```go
func NewHandler(db *sql.DB, cfg *config.Config, log *logger.Logger, s3 *storage.S3Client) *Handler {
    return &Handler{
        cfg:     cfg,
        log:     log,
        service: NewService(db, s3, cfg, log),
    }
}
```

**Step 2: Implement new handlers**

- `GetProfile` — calls service.GetProfile, returns full profile + settings
- `UpdateProfile` — binds `{name: string}`, calls service.UpdateProfile
- `UpdateSettings` — binds Settings struct, calls service.UpdateSettings
- `UploadAvatar` — parses multipart form (max 5MB, image/* only), calls service.UploadAvatar
- `DeleteAvatar` — calls service.DeleteAvatar
- `CompleteOnboarding` — calls service.CompleteOnboarding

UploadAvatar handler pattern:
```go
func (h *Handler) UploadAvatar(c *gin.Context) {
    userID := getUserID(c)
    file, header, err := c.Request.FormFile("avatar")
    if err != nil {
        response.Error(c, http.StatusBadRequest, "Файл не найден")
        return
    }
    defer file.Close()

    // Validate content type
    contentType := header.Header.Get("Content-Type")
    if !strings.HasPrefix(contentType, "image/") {
        response.Error(c, http.StatusBadRequest, "Допустимы только изображения")
        return
    }

    // Max 5MB
    if header.Size > 5*1024*1024 {
        response.Error(c, http.StatusBadRequest, "Максимальный размер файла 5 МБ")
        return
    }

    url, err := h.service.UploadAvatar(c.Request.Context(), userID, file, contentType, header.Size)
    if err != nil {
        response.Error(c, http.StatusInternalServerError, "Не удалось загрузить фото")
        return
    }

    response.Success(c, http.StatusOK, gin.H{"avatar_url": url})
}
```

**Step 3: Write handler tests**

Test each handler with httptest + gin test mode. Verify status codes, response shapes, error cases.

**Step 4: Run tests**

```bash
cd apps/api && go test ./internal/modules/users/ -v
```

**Step 5: Commit**

```bash
git add apps/api/internal/modules/users/
git commit -m "feat: add users handlers for settings, avatar, onboarding"
```

---

## Task 5: Backend — Route Registration + Auth Changes

Wire up new routes and add `onboarding_completed` to auth responses.

**Files:**
- Modify: `apps/api/cmd/server/main.go` (routes)
- Modify: `apps/api/internal/modules/auth/service.go` (add onboarding_completed to User struct + queries)
- Modify: `apps/api/internal/modules/auth/handler.go` (if needed)

**Step 1: Update auth User struct**

In `apps/api/internal/modules/auth/service.go`:

```go
type User struct {
    ID                  int64     `json:"id"`
    Email               string    `json:"email"`
    Name                string    `json:"name,omitempty"`
    Role                string    `json:"role"`
    OnboardingCompleted bool      `json:"onboarding_completed"`
    CreatedAt           time.Time `json:"created_at"`
}
```

Update Login query to SELECT onboarding_completed:
```sql
SELECT id, email, name, password, role, COALESCE(onboarding_completed, false), created_at
FROM users WHERE email = $1
```

Update Register: after INSERT, also call `INSERT INTO user_settings (user_id) VALUES ($1)` to create default settings row.

**Step 2: Update route registration in main.go**

Change users handler creation to pass db and profilePhotosS3:
```go
usersHandler := users.NewHandler(db.DB, cfg, log, profilePhotosS3)
```

Add new routes in the users group:
```go
usersGroup.PUT("/settings", usersHandler.UpdateSettings)
usersGroup.POST("/avatar", usersHandler.UploadAvatar)
usersGroup.DELETE("/avatar", usersHandler.DeleteAvatar)
usersGroup.PUT("/onboarding/complete", usersHandler.CompleteOnboarding)
```

**Step 3: Run all backend tests**

```bash
cd apps/api && go test ./... -v
```

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat: wire up settings/avatar routes, add onboarding_completed to auth"
```

---

## Task 6: Frontend — Shared Settings Components (Selectors)

Create controlled components for language and unit selection.

**Files:**
- Create: `apps/web/src/shared/components/settings/LanguageSelector.tsx`
- Create: `apps/web/src/shared/components/settings/UnitSelector.tsx`
- Create: `apps/web/src/shared/components/settings/index.ts`

**Step 1: Create LanguageSelector**

Controlled component. Two pill-buttons side by side. Active = purple (#8B5CF6 from brand.secondary). Inactive = light gray bg.

```tsx
'use client'

interface LanguageSelectorProps {
    value: 'ru' | 'en'
    onChange: (value: 'ru' | 'en') => void
    disabled?: boolean
}
```

UI: Two buttons in a flex row. Active button has `bg-purple-500 text-white`. Inactive has `bg-gray-100 text-gray-700`. Labels: "Русский" / "English". Section header: "Язык интерфейса".

**Step 2: Create UnitSelector**

Same pattern. Value: 'metric' | 'imperial'. Labels: "Кг, см" / "Фунты, дюймы". Header: "Единицы измерения".

**Step 3: Create barrel export**

```tsx
// index.ts
export { LanguageSelector } from './LanguageSelector'
export { UnitSelector } from './UnitSelector'
```

**Step 4: Commit**

```bash
git add apps/web/src/shared/components/settings/
git commit -m "feat: add LanguageSelector and UnitSelector shared components"
```

---

## Task 7: Frontend — Shared Settings Components (Photo, Social, Apple Health)

**Files:**
- Create: `apps/web/src/shared/components/settings/PhotoUploader.tsx`
- Create: `apps/web/src/shared/components/settings/SocialAccountsForm.tsx`
- Create: `apps/web/src/shared/components/settings/AppleHealthToggle.tsx`
- Update: `apps/web/src/shared/components/settings/index.ts`

**Step 1: Create PhotoUploader**

```tsx
interface PhotoUploaderProps {
    avatarUrl?: string
    userName?: string
    onUpload: (file: File) => Promise<string>  // returns new URL
    onRemove?: () => Promise<void>
    isLoading?: boolean
}
```

UI per Figma: Large circle (128px) with avatar preview or initial letter. Below: "Редактирование фото профиля" text. Purple button "Сделать или выбрать фото" triggers hidden file input (accept="image/*"). Shows loading spinner during upload.

**Step 2: Create SocialAccountsForm**

```tsx
interface SocialAccountsFormProps {
    telegram: string
    instagram: string
    onTelegramChange: (value: string) => void
    onInstagramChange: (value: string) => void
}
```

UI: Two Input fields. Telegram label "Ник в Telegram", placeholder "Привяжи свой @username". Instagram label "Профиль в Instagram", helper "В формате @твойпрофиль, например: @zingilevskiy". Values auto-prefixed with @ if missing.

**Step 3: Create AppleHealthToggle**

```tsx
interface AppleHealthToggleProps {
    enabled: boolean
    onChange: (enabled: boolean) => void
}
```

UI: Row with "Синхронизация с Apple Здоровье" + toggle switch + chevron. Below: "Как настроить Apple Health" link (blue text). On toggle ON → toast "Скоро будет доступно" and revert to off.

**Step 4: Update barrel export, commit**

```bash
git add apps/web/src/shared/components/settings/
git commit -m "feat: add PhotoUploader, SocialAccountsForm, AppleHealthToggle"
```

---

## Task 8: Frontend — Settings Feature

Standalone settings pages accessible from profile menu.

**Files:**
- Create: `apps/web/src/features/settings/components/SettingsLocality.tsx`
- Create: `apps/web/src/features/settings/components/SettingsSocial.tsx`
- Create: `apps/web/src/features/settings/components/SettingsAppleHealth.tsx`
- Create: `apps/web/src/features/settings/hooks/useSettings.ts`
- Create: `apps/web/src/features/settings/api/settings.ts`
- Create: `apps/web/src/features/settings/index.ts`

**Step 1: Create settings API client**

```tsx
// api/settings.ts
import { apiClient } from '@/shared/utils/api-client'

export async function getProfile() {
    return apiClient.get('/backend-api/v1/users/profile')
}

export async function updateSettings(settings: SettingsPayload) {
    return apiClient.put('/backend-api/v1/users/settings', settings)
}

export async function uploadAvatar(file: File) {
    // Use raw fetch for multipart
    const formData = new FormData()
    formData.append('avatar', file)
    const token = localStorage.getItem('auth_token')
    const res = await fetch('/backend-api/v1/users/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    })
    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    return data.data?.avatar_url || data.avatar_url
}

export async function deleteAvatar() {
    return apiClient.delete('/backend-api/v1/users/avatar')
}
```

**Step 2: Create useSettings hook**

Fetches profile on mount, provides update functions. Uses local state + API calls.

```tsx
export function useSettings() {
    const [profile, setProfile] = useState<FullProfile | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => { loadProfile() }, [])

    const loadProfile = async () => { ... }
    const saveSettings = async (settings: Partial<Settings>) => { ... }
    const handleAvatarUpload = async (file: File) => { ... }
    const handleAvatarDelete = async () => { ... }

    return { profile, isLoading, saveSettings, handleAvatarUpload, handleAvatarDelete }
}
```

**Step 3: Create SettingsLocality**

Page with back button header "Настройки профиля". Uses LanguageSelector + UnitSelector from shared. Auto-saves on change via useSettings.saveSettings(). Red "Удалить аккаунт" link at bottom (shows confirmation, but actual deletion not in scope — just alert).

**Step 4: Create SettingsSocial**

Page with back button header "Аккаунты социальных сетей". Uses SocialAccountsForm. Save button at bottom.

**Step 5: Create SettingsAppleHealth**

Page with back button header "Apple Health". Uses AppleHealthToggle.

**Step 6: Commit**

```bash
git add apps/web/src/features/settings/
git commit -m "feat: add settings feature with locality, social, apple health pages"
```

---

## Task 9: Frontend — Onboarding Feature (Wizard)

Step-by-step wizard that reuses shared components.

**Files:**
- Create: `apps/web/src/features/onboarding/components/OnboardingWizard.tsx`
- Create: `apps/web/src/features/onboarding/components/OnboardingStep.tsx`
- Create: `apps/web/src/features/onboarding/components/StepIndicator.tsx`
- Create: `apps/web/src/features/onboarding/hooks/useOnboarding.ts`
- Create: `apps/web/src/features/onboarding/store/onboardingStore.ts`
- Create: `apps/web/src/features/onboarding/api/onboarding.ts`
- Create: `apps/web/src/features/onboarding/index.ts`

**Step 1: Create onboarding API**

```tsx
// api/onboarding.ts
import { apiClient } from '@/shared/utils/api-client'

export async function completeOnboarding() {
    return apiClient.put('/backend-api/v1/users/onboarding/complete', {})
}
```

(Avatar upload and settings update reuse functions from `features/settings/api/settings.ts`)

**Step 2: Create Zustand store**

```tsx
// store/onboardingStore.ts
import { create } from 'zustand'

interface OnboardingState {
    currentStep: number
    totalSteps: number  // 4
    avatarUrl: string | null
    language: 'ru' | 'en'
    units: 'metric' | 'imperial'
    telegram: string
    instagram: string
    appleHealthEnabled: boolean

    setStep: (step: number) => void
    nextStep: () => void
    prevStep: () => void
    setAvatarUrl: (url: string | null) => void
    setLanguage: (lang: 'ru' | 'en') => void
    setUnits: (units: 'metric' | 'imperial') => void
    setTelegram: (val: string) => void
    setInstagram: (val: string) => void
    setAppleHealth: (val: boolean) => void
    reset: () => void
}
```

**Step 3: Create StepIndicator**

Small dots or numbered steps at the top. Current step highlighted purple. Pattern: 4 circles with connecting lines.

**Step 4: Create OnboardingStep**

Wrapper component for each step. Takes `title`, `children`, `onNext`, `onSkip`, `isLast`.

Layout:
- StepIndicator at top
- Title text
- Content (children — the shared component)
- Bottom: "Далее" primary button + "Пропустить" ghost button
- Last step: "Далее" button text changes to "Завершить"

**Step 5: Create OnboardingWizard**

Main component that renders the correct step:
- Step 0: PhotoUploader
- Step 1: LanguageSelector + UnitSelector (combined in one step per Figma "Locality")
- Step 2: SocialAccountsForm
- Step 3: AppleHealthToggle

Each "Next" saves that step's data via API (updateSettings / uploadAvatar). "Skip" moves to next without saving. After step 3: call completeOnboarding(), reset store, redirect to `/dashboard`.

**Step 6: Create useOnboarding hook**

Orchestrates the wizard: loads existing profile data (in case user returns mid-onboarding), handles save-per-step, handles completion.

**Step 7: Commit**

```bash
git add apps/web/src/features/onboarding/
git commit -m "feat: add onboarding wizard feature"
```

---

## Task 10: Frontend — Profile Page Redesign

Completely rewrite the profile page per Figma design.

**Files:**
- Rewrite: `apps/web/src/app/profile/page.tsx`

**Step 1: Implement new design**

Layout per Figma Screen 1:
- Back button + header "Мой профиль"
- Large avatar circle (96px) with user photo or initial. Tap opens photo editor modal/bottom-sheet
- User name below avatar, centered
- Info badges row (if applicable — program name, kcal target, subscription date)
- Menu list (Card-style, rows with chevron arrows):
  - "Фудтрекер" → `/dashboard`
  - "Настройки профиля" → `/settings/profile`
  - "Аккаунты социальных сетей" → `/settings/social`
  - "Apple Health" → `/settings/apple-health`
- "Выйти из аккаунта" button at bottom

Use the useSettings hook to load profile data. Avatar click triggers PhotoUploader in a modal.

**Step 2: Commit**

```bash
git add apps/web/src/app/profile/page.tsx
git commit -m "feat: redesign profile page per Figma"
```

---

## Task 11: Frontend — Route Pages

Create Next.js App Router pages for onboarding and settings.

**Files:**
- Create: `apps/web/src/app/onboarding/page.tsx`
- Create: `apps/web/src/app/settings/profile/page.tsx`
- Create: `apps/web/src/app/settings/social/page.tsx`
- Create: `apps/web/src/app/settings/apple-health/page.tsx`

**Step 1: Create onboarding page**

```tsx
// app/onboarding/page.tsx
'use client'
import { OnboardingWizard } from '@/features/onboarding'

export default function OnboardingPage() {
    return <OnboardingWizard />
}
```

Add auth guard: redirect to `/auth` if no token.

**Step 2: Create settings pages**

Each settings page: auth guard + the corresponding component from features/settings.

```tsx
// app/settings/profile/page.tsx
'use client'
import { SettingsLocality } from '@/features/settings'
export default function SettingsProfilePage() { return <SettingsLocality /> }

// app/settings/social/page.tsx
'use client'
import { SettingsSocial } from '@/features/settings'
export default function SettingsSocialPage() { return <SettingsSocial /> }

// app/settings/apple-health/page.tsx
'use client'
import { SettingsAppleHealth } from '@/features/settings'
export default function SettingsAppleHealthPage() { return <SettingsAppleHealth /> }
```

**Step 3: Commit**

```bash
git add apps/web/src/app/onboarding/ apps/web/src/app/settings/
git commit -m "feat: add onboarding and settings route pages"
```

---

## Task 12: Frontend — Auth Flow Changes

Update login to check onboarding_completed and redirect accordingly.

**Files:**
- Modify: `apps/web/src/features/auth/hooks/useAuth.ts`
- Modify: `apps/web/src/features/auth/types/index.ts` (add onboarding_completed to User type)

**Step 1: Update auth types**

Add `onboarding_completed: boolean` to the User type in auth types.

**Step 2: Update login redirect logic**

In `useAuth.ts`, change the login function:

```tsx
// After successful login:
if (!response.user.onboarding_completed) {
    router.push('/onboarding')
} else {
    router.push('/dashboard')
}
```

Register stays as-is (always → `/onboarding`).

**Step 3: Run frontend tests**

```bash
cd apps/web && npx jest --watch
```

Fix any broken auth tests due to the new field.

**Step 4: Commit**

```bash
git add apps/web/src/features/auth/
git commit -m "feat: redirect to onboarding if not completed on login"
```

---

## Task 13: Integration Verification

**Step 1: Run all backend tests**

```bash
cd apps/api && go test ./... -v
```

**Step 2: Run all frontend tests**

```bash
cd apps/web && npx jest
```

**Step 3: Run type check**

```bash
cd apps/web && npm run type-check
```

**Step 4: Run lint**

```bash
cd apps/web && npm run lint
```

**Step 5: Manual smoke test**

```bash
make dev
```

Test flow:
1. Register new user → should land on onboarding wizard
2. Walk through wizard steps → should reach dashboard
3. Go to profile → should see new design
4. Navigate to each settings page → verify data persists
5. Login with existing user → should redirect to onboarding (if not completed)

**Step 6: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for onboarding & settings"
```
