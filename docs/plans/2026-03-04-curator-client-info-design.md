# Curator Client Info Panel Design

**Date:** 2026-03-04
**Status:** Approved

## Problem

Curators lack basic client information when viewing a client's detail page. They cannot see the client's ID, email, height, timezone, or social accounts — all useful for communication and tracking.

## Solution

Add a collapsible "Подробнее" section under the client header (avatar + name) on the curator client detail page. Collapsed by default. Shows a compact grid of client profile data.

### Layout

```
┌────────────────────────────────────────┐
│  [avatar]  Дмитрий          [✉ Чат]   │
│  ▾ Подробнее                           │
│ ┌────────────────────────────────────┐ │
│ │ ID: 1         Email: spass@mail.ru │ │
│ │ Рост: 175 см  Вес: 89.5 кг        │ │
│ │ Часовой пояс: Europe/Moscow        │ │
│ │ 📱 @dmitriy_tg   📷 @dmitriy_ig   │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### Data Fields

| Field | Source | Format |
|-------|--------|--------|
| ID | `users.id` | Number (already in ClientCard) |
| Email | `users.email` | `mailto:` link |
| Height | `user_settings.height` (NEW column) | `N см` |
| Weight | `ClientDetail.lastWeight` (already returned) | `N кг` |
| Timezone | `user_settings.timezone` | Text |
| Telegram | `user_settings.telegram_username` | Link to `t.me/{username}` |
| Instagram | `user_settings.instagram_username` | Link to `instagram.com/{username}` |

Empty fields are hidden (not shown as "—").

Social links open in a new tab.

### What Changes

**Database:**
- Migration 026: add `height DECIMAL(4,1)` to `user_settings`

**Backend (`apps/api/internal/modules/curator/`):**
- Extend `ClientCard` struct with: `Email`, `Height`, `Timezone`, `TelegramUsername`, `InstagramUsername`
- Join `user_settings` and include `users.email` in GetClients/GetClientDetail queries

**Frontend (`apps/web/`):**
- Extend `ClientCard` TypeScript type with new fields
- New component `ClientInfoPanel` — collapsible section with data grid
- Add to `curator/clients/[id]/page.tsx`
- Add "height" input to client profile settings page

### What Doesn't Change

- Curator dashboard client list (ClientCard on main page stays the same)
- All existing blocks on client detail page (weight, water, steps, etc.)
- API endpoint URLs
- Authorization flow
