# Проверка функции create_user_profile в базе данных

## Текущая версия: v9.5 (упрощенная)

Функция `create_user_profile` была упрощена для избежания timeout:
- Убраны все проверки существования пользователя
- Убраны задержки (`pg_sleep`)
- Используется `ON CONFLICT DO NOTHING` для idempotency
- Функция должна выполняться быстро (< 100ms)

## Способы проверки

### 1. Через Supabase Dashboard (SQL Editor)

Выполните SQL скрипт из `scripts/check-db-function.sql` в Supabase SQL Editor.

Скрипт проверит:
- ✅ Существование функции
- ✅ Правильность сигнатуры (должна содержать `user_coordinator_id`)
- ✅ Использование `SECURITY DEFINER` (для обхода RLS)
- ✅ Наличие `ON CONFLICT DO NOTHING`
- ✅ Отсутствие `pg_sleep` (задержек)
- ✅ Отсутствие проверок существования пользователя

**Правильная сигнатура (v9.5):**
```
user_id uuid, user_email text, user_full_name text DEFAULT NULL::text, 
user_role user_role DEFAULT 'client'::user_role, 
user_coordinator_id uuid DEFAULT NULL::uuid
```

**Неправильная сигнатура (устаревшая):**
```
user_id uuid, user_email text, user_full_name text DEFAULT NULL::text, 
user_role user_role DEFAULT 'client'::user_role, 
user_coach_id uuid DEFAULT NULL::uuid
```

### 2. Через TypeScript скрипт

Запустите скрипт проверки:

```bash
npx tsx scripts/test-rpc-function.ts
```

Скрипт проверит:
- Существование функции
- Скорость выполнения (должна быть < 100ms)
- Обработку ошибок

## Решение

Если функция не существует или имеет неправильную сигнатуру:

1. **Примените миграцию v9.5:**
   - Откройте файл `migrations/v9.5_simplify_create_user_profile_no_checks.sql`
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
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN unique_violation THEN
    NULL;
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'User with id % does not exist in auth.users', user_id;
END;
$$;
```

## Ключевые особенности версии v9.5

1. **Нет проверок существования пользователя** - функция вызывается сразу после `signUp`, когда пользователь уже должен существовать
2. **Нет задержек** - убран `pg_sleep`, который вызывал timeout
3. **ON CONFLICT DO NOTHING** - идемпотентность, можно вызывать несколько раз
4. **SECURITY DEFINER** - обходит RLS политики
5. **Быстрое выполнение** - должно выполняться < 100ms

## Retry механизм

Код регистрации (`src/app/register/page-content.tsx`) содержит retry механизм на клиентской стороне:
- До 3 попыток с увеличивающейся задержкой (200ms, 400ms, 600ms)
- Обрабатывает race condition, когда пользователь еще не появился в `auth.users`
- Функция в БД остается простой и быстрой

## Fallback механизм (устаревший)

~~Код регистрации автоматически использует прямой `INSERT` в таблицу `profiles`, если:~~
- ~~RPC функция не найдена~~
- ~~RPC функция имеет неправильную сигнатуру~~

**Примечание:** Прямой INSERT блокируется RLS, поэтому всегда используйте RPC функцию `create_user_profile`.

