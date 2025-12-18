# Инструкция по созданию тестовых пользователей v3

## Новые пользователи

1. **client1@supa.app** — Free клиент (без тренера)
2. **client2@supa.app** — Premium клиент (с тренером coach1@supa.app)
3. **coach1@supa.app** — Тренер для client2@supa.app

## Важно

- **Free клиенты не могут иметь тренеров** — скрипт автоматически удаляет тренеров у free клиентов
- Пользователи должны быть созданы через Supabase Dashboard перед выполнением SQL

## Шаг 1: Создание пользователей в Authentication

1. Откройте Supabase Dashboard → **Authentication** → **Users**
2. Нажмите **Add User** → **Create new user**

**Создайте трех пользователей:**

### 1. client1@supa.app
- Email: `client1@supa.app`
- Password: `client1pass123!` (или любой другой)
- Auto Confirm User: ✅ (включено)

### 2. client2@supa.app
- Email: `client2@supa.app`
- Password: `client2pass123!` (или любой другой)
- Auto Confirm User: ✅ (включено)

### 3. coach1@supa.app
- Email: `coach1@supa.app`
- Password: `coach1pass123!` (или любой другой)
- Auto Confirm User: ✅ (включено)

## Шаг 2: Выполнение SQL миграции

После создания пользователей выполните SQL из файла `create_test_users_v3.sql` в Supabase SQL Editor.

## Шаг 3: Проверка

После выполнения SQL миграции проверьте результат запросом:

```sql
SELECT 
    p.email,
    p.role,
    p.subscription_status,
    p.subscription_tier,
    coach.email as coach_email,
    CASE 
        WHEN p.subscription_status = 'free' AND p.coach_id IS NULL THEN '✅ Правильно (Free без тренера)'
        WHEN p.subscription_status = 'active' AND p.coach_id IS NOT NULL THEN '✅ Правильно (Premium с тренером)'
        WHEN p.subscription_status = 'free' AND p.coach_id IS NOT NULL THEN '❌ ОШИБКА (Free с тренером)'
        ELSE '⚠️ Проверьте'
    END as validation
FROM profiles p
LEFT JOIN profiles coach ON coach.id = p.coach_id
WHERE p.email IN ('client1@supa.app', 'client2@supa.app', 'coach1@supa.app')
ORDER BY p.email;
```

## Ожидаемый результат:

- `client1@supa.app` → role: `client`, subscription: `free`, coach: `NULL`
- `client2@supa.app` → role: `client`, subscription: `active`, coach: `coach1@supa.app`
- `coach1@supa.app` → role: `coach`, subscription: `active`

