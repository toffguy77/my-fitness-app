# Onboarding & Settings Design

## Context

After registration, users hit a 404 on `/onboarding`. The profile page is minimal — no avatar, no settings, no navigation to sub-settings. This feature adds a step-by-step onboarding wizard and a full settings system accessible from the profile page.

**Source:** Figma board `BurcevTeam` node `164-486` — 4 screens: Photo Upload, Locality, Social, Apple Health.

## Decisions

- **Onboarding flow:** Step-by-step wizard (photo → locality → social → Apple Health → dashboard)
- **Apple Health:** UI stub only — toggle shows "Скоро будет доступно"
- **Existing users:** Login checks `onboarding_completed`; if false → redirect to wizard
- **Profile page:** Full redesign per Figma (avatar, menu, navigation to sub-settings)
- **Architecture:** Approach C — shared components in `apps/web/src/shared/components/settings/`, separate `features/onboarding/` and `features/settings/`
- **Photo storage:** S3 bucket `profiles-photos`, service account `web-site-profile-photos-upload`

## Data Schema

Migration `014_user_settings`:

```sql
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;

CREATE TABLE user_settings (
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
```

## API Endpoints

All under `/api/v1/users/` (authenticated):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/profile` | Full profile + settings + avatar_url |
| PUT | `/profile` | Update name |
| PUT | `/settings` | Update language, units, socials, apple_health |
| POST | `/avatar` | Upload photo (multipart → S3 `profiles-photos`) |
| DELETE | `/avatar` | Delete photo from S3, clear avatar_url |
| PUT | `/onboarding/complete` | Set onboarding_completed = true |

## Shared Components (`apps/web/src/shared/components/settings/`)

Controlled components (value + onChange) reused in both wizard and standalone:

1. **PhotoUploader** — circular preview, upload button, calls POST /avatar
2. **LanguageSelector** — two option buttons (Русский / English), active = purple
3. **UnitSelector** — two option buttons (Кг, см / Фунты, дюймы), active = purple
4. **SocialAccountsForm** — Telegram + Instagram fields with @username validation
5. **AppleHealthToggle** — toggle + link, stub behavior

## Features

### `features/onboarding/`

- `OnboardingWizard.tsx` — wizard with progress indicator, Next/Skip buttons
- `useOnboarding.ts` — wizard state, step navigation, save on each step
- `onboardingStore.ts` — Zustand store for intermediate data
- Steps: Photo → Locality (language + units) → Social → Apple Health → Complete
- Final step: PUT /onboarding/complete → redirect to /dashboard

### `features/settings/`

- `SettingsLocality.tsx` — language + units + delete account link
- `SettingsSocial.tsx` — Telegram + Instagram
- `SettingsAppleHealth.tsx` — toggle + instructions link
- Each is standalone with header + back button

## Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/onboarding` | OnboardingWizard | Post-registration wizard |
| `/settings/profile` | SettingsLocality | Language, units, delete account |
| `/settings/social` | SettingsSocial | Social accounts |
| `/settings/apple-health` | SettingsAppleHealth | Apple Health integration |
| `/profile` | ProfilePage (redesigned) | Avatar, menu, navigation |

## Auth Flow Changes

- **Register:** always → `/onboarding`
- **Login:** check `onboarding_completed` from API response → if false, redirect to `/onboarding`; otherwise `/dashboard`
- Backend auth response includes `onboarding_completed` field
