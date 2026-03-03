# Default Name & Avatar for New Users

**Date:** 2026-03-03
**Status:** Approved

## Problem

When users register they only provide email + password. Name and avatar remain empty. Curators see blank client cards with no name and empty initials badges, making it hard to distinguish clients.

## Solution

Assign a generated name ("Цвет Животное") and a matching default SVG avatar at registration time on the backend.

### Name Generation

Two hardcoded Russian-language lists:

**Colors (~10):** Синий, Зелёный, Красный, Оранжевый, Фиолетовый, Золотой, Серебряный, Бирюзовый, Розовый, Белый

**Animals (~12):** Кот, Ёж, Лис, Медведь, Волк, Тигр, Сокол, Дельфин, Панда, Кролик, Лев, Олень

Selection: deterministic by user ID — `colors[id % len(colors)]`, `animals[(id / len(colors)) % len(animals)]`. ~120 unique combinations.

Only assigned when `name` is empty at registration.

### Default Avatar

~8 simple SVG animal silhouette icons stored as static files in `apps/web/public/avatars/default/`. At registration, backend sets `avatar_url = "/avatars/default/{animal}.svg"` — a relative path to static assets, not S3.

The animal in the avatar matches the animal in the name.

When the user later uploads their own avatar, `avatar_url` is overwritten with an S3 URL.

### What Doesn't Change

- Registration form (still email + password only)
- Profile update mechanism (user can change name/avatar later)
- Frontend display logic (already renders name and avatar_url — they just won't be empty anymore)
- Curator client list queries

## Files Changed

| File | Change |
|------|--------|
| `apps/api/internal/modules/auth/service.go` | Generate default name + avatar_url in Register() when name is empty |
| `apps/web/public/avatars/default/*.svg` | **NEW** — ~8 SVG animal icons |
