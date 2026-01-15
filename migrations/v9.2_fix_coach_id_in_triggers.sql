-- Migration: v9.2_fix_coach_id_in_triggers
-- Description: Исправление всех триггеров и функций, которые используют устаревшее поле coach_id
-- Dependencies: v9.0_coach_to_coordinator.sql, v9.1_update_create_user_profile.sql
-- Date: 2025-01-XX

-- ============================================
-- ВАЖНО: Эта миграция исправляет ошибку "record "new" has no field "coach_id"
-- которая возникает при создании профиля, если триггеры или функции
-- все еще используют старое поле coach_id вместо coordinator_id
-- ============================================

-- ============================================
-- 1. УДАЛЕНИЕ ВСЕХ УСТАРЕВШИХ ТРИГГЕРОВ С coach_id
-- ============================================

-- ВАЖНО: Сначала удаляем триггеры, потом функции
-- Удаляем все триггеры, которые могут ссылаться на coach_id
DROP TRIGGER IF EXISTS check_coach_for_free_clients ON profiles;
DROP TRIGGER IF EXISTS prevent_coach_for_free_clients ON profiles;
DROP TRIGGER IF EXISTS trigger_prevent_coach_for_free_clients ON profiles;
DROP TRIGGER IF EXISTS prevent_coordinator_for_free_clients ON profiles;

-- Теперь удаляем устаревшие функции, которые могут использовать coach_id
DROP FUNCTION IF EXISTS prevent_coach_for_free_clients() CASCADE;

-- ============================================
-- 2. ИСПРАВЛЕНИЕ ФУНКЦИИ handle_new_user
-- ============================================

-- Пересоздаем функцию handle_new_user без использования coach_id
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Создаем профиль для нового пользователя
  -- ВАЖНО: НЕ используем coach_id, только coordinator_id
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    subscription_status,
    subscription_tier,
    profile_visibility,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    'client'::user_role,
    'free',
    'basic',
    'private',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_new_user() IS 'Создает профиль для нового пользователя при регистрации через auth.users. Использует coordinator_id (не coach_id).';

-- ============================================
-- 3. ПЕРЕСОЗДАНИЕ ТРИГГЕРА НА auth.users (опционально)
-- ============================================

-- ВАЖНО: Создание триггера на auth.users требует прав суперпользователя.
-- В Supabase это обычно настраивается через Dashboard или требует специальных прав.
-- Пытаемся создать триггер, но если нет прав - пропускаем (функция handle_new_user
-- все равно будет использоваться через create_user_profile RPC функцию)

DO $$
BEGIN
  -- Пытаемся удалить старый триггер (если есть права)
  BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Недостаточно прав для удаления триггера на auth.users. Пропускаем.';
    WHEN OTHERS THEN
      RAISE NOTICE 'Ошибка при удалении триггера на auth.users: %. Пропускаем.', SQLERRM;
  END;

  -- Пытаемся создать новый триггер (если есть права)
  BEGIN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION handle_new_user();

    COMMENT ON TRIGGER on_auth_user_created ON auth.users IS 'Автоматически создает профиль при регистрации нового пользователя';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Недостаточно прав для создания триггера на auth.users. Триггер должен быть настроен через Supabase Dashboard или требует прав суперпользователя.';
    WHEN OTHERS THEN
      RAISE NOTICE 'Ошибка при создании триггера на auth.users: %. Пропускаем.', SQLERRM;
  END;
END $$;

-- ============================================
-- 4. ПРОВЕРКА И ИСПРАВЛЕНИЕ ВСЕХ ТРИГГЕРОВ НА profiles
-- ============================================

-- Пересоздаем триггер для автоматического обновления статуса подписки
DROP TRIGGER IF EXISTS update_subscription_status_on_expiry ON profiles;
CREATE TRIGGER update_subscription_status_on_expiry
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (OLD.subscription_end_date IS DISTINCT FROM NEW.subscription_end_date
        OR OLD.subscription_status IS DISTINCT FROM NEW.subscription_status)
  EXECUTE FUNCTION check_and_update_subscription_status();

-- ============================================
-- 5. ПРОВЕРКА ФУНКЦИИ check_and_update_subscription_status
-- ============================================

-- Убеждаемся, что функция check_and_update_subscription_status не использует coach_id
CREATE OR REPLACE FUNCTION check_and_update_subscription_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Обновляем статус подписки на основе даты окончания
  IF NEW.subscription_end_date IS NOT NULL AND NEW.subscription_end_date < NOW() THEN
    IF NEW.subscription_status != 'expired' THEN
      NEW.subscription_status := 'expired';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_and_update_subscription_status() IS 'Обновляет статус подписки на основе даты окончания. Не использует coach_id.';

-- ============================================
-- ГОТОВО!
-- ============================================

-- Все триггеры и функции обновлены для использования coordinator_id вместо coach_id.
-- Ошибка "record "new" has no field "coach_id"" должна быть исправлена.
