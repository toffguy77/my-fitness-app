-- Создание новых тестовых пользователей
-- ВАЖНО: Пользователи должны быть созданы в Supabase Auth перед выполнением этого скрипта
-- Создайте их через Supabase Dashboard → Authentication → Users → Add User

-- ============================================
-- ШАГ 1: Проверка существования пользователей
-- ============================================

DO $$
DECLARE
    client1_id UUID;
    client2_id UUID;
    coach1_id UUID;
BEGIN
    -- Проверяем client1@supa.app
    SELECT id INTO client1_id FROM auth.users WHERE email = 'client1@supa.app';
    IF client1_id IS NULL THEN
        RAISE NOTICE 'Пользователь client1@supa.app не найден. Создайте его через Supabase Dashboard → Authentication';
    END IF;

    -- Проверяем client2@supa.app
    SELECT id INTO client2_id FROM auth.users WHERE email = 'client2@supa.app';
    IF client2_id IS NULL THEN
        RAISE NOTICE 'Пользователь client2@supa.app не найден. Создайте его через Supabase Dashboard → Authentication';
    END IF;

    -- Проверяем coach1@supa.app
    SELECT id INTO coach1_id FROM auth.users WHERE email = 'coach1@supa.app';
    IF coach1_id IS NULL THEN
        RAISE NOTICE 'Пользователь coach1@supa.app не найден. Создайте его через Supabase Dashboard → Authentication';
    END IF;
END $$;

-- ============================================
-- ШАГ 2: Создание/обновление профилей
-- ============================================

-- 1. client1@supa.app — FREE клиент (без тренера)
INSERT INTO profiles (id, email, role, subscription_status, subscription_tier, full_name, coach_id)
SELECT 
    u.id,
    'client1@supa.app',
    'client',
    'free',
    'basic',
    'Тестовый Клиент 1 (Free)',
    NULL  -- Free клиенты не могут иметь тренеров
FROM auth.users u
WHERE u.email = 'client1@supa.app'
ON CONFLICT (id) DO UPDATE SET
    role = 'client',
    subscription_status = 'free',
    subscription_tier = 'basic',
    email = 'client1@supa.app',
    full_name = COALESCE(profiles.full_name, 'Тестовый Клиент 1 (Free)'),
    coach_id = NULL;  -- Убеждаемся, что у free клиента нет тренера

-- 2. client2@supa.app — PREMIUM клиент (с тренером)
INSERT INTO profiles (id, email, role, subscription_status, subscription_tier, full_name, coach_id)
SELECT 
    u.id,
    'client2@supa.app',
    'client',
    'active',
    'premium',
    'Тестовый Клиент 2 (Premium)',
    (
        SELECT u2.id 
        FROM auth.users u2 
        WHERE u2.email = 'coach1@supa.app'
        LIMIT 1
    )
FROM auth.users u
WHERE u.email = 'client2@supa.app'
ON CONFLICT (id) DO UPDATE SET
    role = 'client',
    subscription_status = 'active',
    subscription_tier = 'premium',
    email = 'client2@supa.app',
    full_name = COALESCE(profiles.full_name, 'Тестовый Клиент 2 (Premium)'),
    coach_id = (
        SELECT u2.id 
        FROM auth.users u2 
        WHERE u2.email = 'coach1@supa.app'
        LIMIT 1
    );

-- 3. coach1@supa.app — Тренер
INSERT INTO profiles (id, email, role, subscription_status, subscription_tier, full_name)
SELECT 
    u.id,
    'coach1@supa.app',
    'coach',
    'active',
    'premium',
    'Тестовый Тренер 1'
FROM auth.users u
WHERE u.email = 'coach1@supa.app'
ON CONFLICT (id) DO UPDATE SET
    role = 'coach',
    subscription_status = 'active',
    subscription_tier = 'premium',
    email = 'coach1@supa.app',
    full_name = COALESCE(profiles.full_name, 'Тестовый Тренер 1');

-- ============================================
-- ШАГ 3: Создание триггера для защиты от назначения тренеров free клиентам
-- ============================================

-- Функция для проверки перед обновлением профиля
CREATE OR REPLACE FUNCTION prevent_coach_for_free_clients()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Если клиент free и пытается назначить тренера - запрещаем
    IF NEW.subscription_status = 'free' AND NEW.coach_id IS NOT NULL THEN
        RAISE EXCEPTION 'Free клиенты не могут иметь тренеров. Статус подписки: %, coach_id: %', NEW.subscription_status, NEW.coach_id;
    END IF;
    
    -- Если клиент становится free, убираем тренера
    IF NEW.subscription_status = 'free' AND OLD.subscription_status != 'free' AND NEW.coach_id IS NOT NULL THEN
        NEW.coach_id := NULL;
        RAISE NOTICE 'Тренер автоматически удален у клиента %, так как статус подписки изменен на free', NEW.email;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Создаем триггер
DROP TRIGGER IF EXISTS check_coach_for_free_clients ON profiles;
CREATE TRIGGER check_coach_for_free_clients
    BEFORE INSERT OR UPDATE ON profiles
    FOR EACH ROW
    WHEN (NEW.role = 'client')
    EXECUTE FUNCTION prevent_coach_for_free_clients();

-- ============================================
-- ШАГ 4: Проверка и валидация существующих данных
-- ============================================

-- Проверяем, что у free клиентов нет тренеров
DO $$
DECLARE
    free_with_coach_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO free_with_coach_count
    FROM profiles
    WHERE subscription_status = 'free'
    AND coach_id IS NOT NULL;
    
    IF free_with_coach_count > 0 THEN
        RAISE WARNING 'Обнаружены free клиенты с назначенными тренерами: %', free_with_coach_count;
        -- Убираем тренеров у free клиентов
        UPDATE profiles
        SET coach_id = NULL
        WHERE subscription_status = 'free'
        AND coach_id IS NOT NULL;
        RAISE NOTICE 'Тренеры удалены у free клиентов';
    END IF;
END $$;

-- ============================================
-- ШАГ 5: Проверка результатов
-- ============================================

-- Проверяем созданные профили
SELECT 
    p.id,
    p.email,
    p.role,
    p.subscription_status,
    p.subscription_tier,
    p.coach_id,
    coach.email as coach_email,
    p.full_name,
    CASE 
        WHEN p.role = 'super_admin' THEN '✅ Супер-админ'
        WHEN p.role = 'coach' THEN '👨‍🏫 Тренер'
        WHEN p.role = 'client' AND p.subscription_status = 'active' AND p.coach_id IS NOT NULL THEN '👤 Клиент Premium (с тренером)'
        WHEN p.role = 'client' AND p.subscription_status = 'free' AND p.coach_id IS NULL THEN '👤 Клиент Free (без тренера)'
        WHEN p.role = 'client' AND p.subscription_status = 'free' AND p.coach_id IS NOT NULL THEN '⚠️ Клиент Free (с тренером - ОШИБКА!)'
        WHEN p.role = 'client' THEN '👤 Клиент'
        ELSE '❓ Неизвестная роль'
    END as status
FROM profiles p
LEFT JOIN profiles coach ON coach.id = p.coach_id
WHERE p.email IN ('client1@supa.app', 'client2@supa.app', 'coach1@supa.app')
ORDER BY 
    CASE p.role
        WHEN 'super_admin' THEN 1
        WHEN 'coach' THEN 2
        WHEN 'client' THEN 3
        ELSE 4
    END,
    p.email;

