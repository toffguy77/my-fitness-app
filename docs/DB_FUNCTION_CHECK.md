# Проверка функции create_user_profile в базе данных

## Проблема

Функция `create_user_profile` в базе данных может иметь устаревшую сигнатуру с параметром `user_coach_id` вместо `user_coordinator_id`.

## Способы проверки

### 1. Через Supabase Dashboard (SQL Editor)

Выполните SQL запрос:

```sql
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'create_user_profile';
```

**Правильная сигнатура:**
```
user_id uuid, user_email text, user_full_name text DEFAULT NULL::text, user_role user_role DEFAULT 'client'::user_role, user_coordinator_id uuid DEFAULT NULL::uuid
```

**Неправильная сигнатура (устаревшая):**
```
user_id uuid, user_email text, user_full_name text DEFAULT NULL::text, user_role user_role DEFAULT 'client'::user_role, user_coach_id uuid DEFAULT NULL::uuid
```

### 2. Через TypeScript скрипт

Запустите скрипт проверки:

```bash
npx tsx scripts/test-rpc-function.ts
```

### 3. Через SQL скрипт

Выполните SQL скрипт из `scripts/check-db-function.sql` в Supabase SQL Editor.

## Решение

Если функция имеет неправильную сигнатуру (`user_coach_id` вместо `user_coordinator_id`):

1. **Примените миграцию:**
   - Откройте файл `migrations/v9.1_update_create_user_profile.sql`
   - Скопируйте содержимое
   - Выполните в Supabase Dashboard -> SQL Editor

2. **Или выполните SQL напрямую:**

```sql
CREATE OR REPLACE FUNCTION create_user_profile(
  user_id UUID,
  user_email TEXT,
  user_full_name TEXT DEFAULT NULL,
  user_role user_role DEFAULT 'client',
  user_coordinator_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = user_id) THEN
    RETURN;
  END IF;

  INSERT INTO profiles (
    id,
    email,
    full_name,
    role,
    coordinator_id,
    subscription_status,
    subscription_tier,
    profile_visibility,
    created_at,
    updated_at
  ) VALUES (
    user_id,
    user_email,
    user_full_name,
    user_role,
    user_coordinator_id,
    'free',
    'basic',
    'private',
    NOW(),
    NOW()
  );
END;
$$;
```

## Fallback механизм

Код регистрации автоматически использует прямой `INSERT` в таблицу `profiles`, если:
- RPC функция не найдена
- RPC функция имеет неправильную сигнатуру
- Возникает ошибка "schema cache"

Это обеспечивает работоспособность регистрации даже при отсутствии или неправильной версии функции.

