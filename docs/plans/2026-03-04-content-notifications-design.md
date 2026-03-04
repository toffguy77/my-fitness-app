# Content Notification Subscriptions — Design

Date: 2026-03-04

## Overview

Пользователи получают уведомления о новом контенте (статьях) от куратора. Подписки настраиваются в разделе настроек через toggles по категориям контента. Уведомления доставляются в реалтайме через WebSocket и отображаются в dropdown колокольчика.

## Data Model

### Новые таблицы

**`content_notification_preferences`** — opt-out модель (запись = пользователь отписан от категории):

```sql
CREATE TABLE content_notification_preferences (
    user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
    category   content_category NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, category)
);
```

**`content_notification_mute`** — режим "не беспокоить":

```sql
CREATE TABLE content_notification_mute (
    user_id  BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    muted_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Изменения в `notifications`

- Добавить `action_url VARCHAR(500)` — ссылка для перехода по клику
- Добавить `content_category content_category` — nullable, категория контента (для группировки)
- Расширить CHECK constraint на `type`: добавить `new_content`

### Единый источник типов контента

`content_category` PostgreSQL enum — единый источник. Дублируется в Go constants и TS types (`CATEGORY_LABELS`). При добавлении нового типа:

1. Миграция: `ALTER TYPE content_category ADD VALUE 'new_type'`
2. Обновить Go constants + TS `CATEGORY_LABELS`
3. Opt-out модель автоматически подписывает всех на новый тип

## Backend

### Генерация нотификаций при публикации

В `content/service.go` → `PublishArticle` и `PublishScheduledArticles`:

1. Статья публикуется → определяем целевую аудиторию (all / my_clients / selected)
2. Из аудитории исключаем пользователей:
   - С записью в `content_notification_preferences` для категории статьи (отписаны)
   - С записью в `content_notification_mute` (замьючены)
3. Batch INSERT в `notifications`:
   - `category = 'content'`, `type = 'new_content'`
   - `content_category = article.category`
   - `action_url = '/content/{article_id}'`
   - `title` = название статьи, `content` = excerpt

### WebSocket

Новый event type:

```go
EventContentNotification = "content_notification"
```

После создания нотификаций — `hub.SendToUser(userID, event)` для каждого онлайн-пользователя:

```json
{
  "type": "content_notification",
  "unread_count": 5,
  "notification": { "id": "...", "title": "...", "action_url": "...", "category": "nutrition" }
}
```

### Новые API эндпоинты

- `GET /api/v1/notifications/preferences` — возвращает замьюченные категории + mute status
- `PUT /api/v1/notifications/preferences` — body: `{ muted_categories: ["training"], muted: false }`

Существующие эндпоинты используются без изменений:

- `GET /api/notifications?category=content&limit=10` — для dropdown
- `POST /api/notifications/mark-all-read` с `{ category: "content" }` — при открытии dropdown

## Frontend

### Notification Bell Dropdown

Заменяет текущий `router.push('/notifications')` на dropdown popover:

- Последние 10 непрочитанных контент-нотификаций
- Группировка: 3+ нотификации одной категории за последний час → "3 новых статьи о питании" (раскрываются по клику)
- Каждая нотификация кликабельна → `router.push(action_url)`
- Внизу ссылка "Все уведомления" → `/notifications`
- Открытие dropdown → `mark-all-read` для category=content → счётчик обнуляется

Компонент: `NotificationDropdown.tsx` в `features/notifications/components/`.

### WebSocket интеграция

В `WebSocketProvider` — обработчик `content_notification`:

- Обновить `unreadCounts.content` в Zustand store
- Добавить нотификацию в локальный список
- Анимация badge (bounce/pulse)
- Polling остаётся как fallback

### Страница настроек `/settings/notifications`

В `SettingsPageLayout`:

```
Уведомления о контенте
─────────────────────
[toggle] Не беспокоить          — отключает все

Категории контента
[toggle] Питание
[toggle] Тренировки
[toggle] Рецепты
[toggle] Здоровье
[toggle] Мотивация
[toggle] Общее
```

- Toggles по умолчанию ON (opt-out)
- "Не беспокоить" ON → toggles визуально disabled (состояние сохраняется)
- Список рендерится из `CATEGORY_LABELS` — новый тип появляется автоматически

Компонент: `SettingsNotifications.tsx` в `features/settings/components/`.

### Навигация

Добавить пункт "Уведомления" в навигацию настроек рядом с Профиль, Соцсети, Apple Health.
