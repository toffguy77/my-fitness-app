# Инструкция по созданию тестовых пользователей

## Важно

Supabase не позволяет напрямую создавать пользователей в `auth.users` через SQL без специальных расширенных прав. 
Пользователей нужно создать через Supabase Dashboard или Auth API.

## Способ 1: Через Supabase Dashboard (рекомендуется)

### Шаг 1: Создание пользователей в Authentication

1. Откройте Supabase Dashboard → **Authentication** → **Users**
2. Нажмите **Add User** → **Create new user**

**Создайте трех пользователей:**

#### 1. client@supa.app
- Email: `client@supa.app`
- Password: `client123` (или любой другой)
- Auto Confirm User: ✅ (включено)

#### 2. coach@supa.app
- Email: `coach@supa.app`
- Password: `coach123` (или любой другой)
- Auto Confirm User: ✅ (включено)

#### 3. thatguy@yandex.ru (если еще не создан)
- Email: `thatguy@yandex.ru`
- Password: (существующий пароль)
- Auto Confirm User: ✅ (включено)

### Шаг 2: Выполнение SQL миграции

После создания пользователей выполните SQL из файла `create_test_users.sql` в Supabase SQL Editor.

## Способ 2: Через Supabase CLI (альтернатива)

```bash
# Установите Supabase CLI если еще не установлен
# npm install -g supabase

# Создание пользователей через CLI
supabase auth admin create-user \
  --email client@supa.app \
  --password client123 \
  --email-confirm

supabase auth admin create-user \
  --email coach@supa.app \
  --password coach123 \
  --email-confirm
```

## Проверка

После выполнения SQL миграции проверьте:

```sql
SELECT 
    p.email,
    p.role,
    p.subscription_status,
    coach.email as coach_email
FROM profiles p
LEFT JOIN profiles coach ON coach.id = p.coach_id
WHERE p.email IN ('client@supa.app', 'coach@supa.app', 'thatguy@yandex.ru');
```

Ожидаемый результат:
- `client@supa.app` → role: `client`, coach: `coach@supa.app`
- `coach@supa.app` → role: `coach`
- `thatguy@yandex.ru` → role: `super_admin`

