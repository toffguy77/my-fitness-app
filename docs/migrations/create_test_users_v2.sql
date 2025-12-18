-- Создание тестовых пользователей и назначение ролей
-- Версия 2: С созданием пользователей через auth.users (требует расширенных прав)

-- ============================================
-- ШАГ 1: Создание пользователей в auth.users
-- ============================================
-- ВАЖНО: Этот шаг требует расширенных прав на auth.users
-- Если получаете ошибку доступа, создайте пользователей через Supabase Dashboard

-- Функция для безопасного создания пользователя
CREATE OR REPLACE FUNCTION create_user_if_not_exists(
    p_email TEXT,
    p_password TEXT DEFAULT 'TempPassword123!',
    p_email_confirmed BOOLEAN DEFAULT TRUE
) RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_encrypted_password TEXT;
BEGIN
    -- Проверяем, существует ли пользователь
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    
    IF v_user_id IS NULL THEN
        -- Генерируем UUID для нового пользователя
        v_user_id := gen_random_uuid();
        
        -- Хешируем пароль (используем crypt из pgcrypto)
        -- ВАЖНО: В реальности Supabase использует свою систему хеширования
        -- Этот код может не работать без расширенных прав
        v_encrypted_password := crypt(p_password, gen_salt('bf'));
        
        -- Создаем пользователя
        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            created_at,
            updated_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            role
        ) VALUES (
            v_user_id,
            '00000000-0000-0000-0000-000000000000',
            p_email,
            v_encrypted_password,
            CASE WHEN p_email_confirmed THEN NOW() ELSE NULL END,
            NOW(),
            NOW(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            FALSE,
            'authenticated'
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id INTO v_user_id;
        
        RAISE NOTICE 'Создан пользователь: % (ID: %)', p_email, v_user_id;
    ELSE
        RAISE NOTICE 'Пользователь уже существует: % (ID: %)', p_email, v_user_id;
    END IF;
    
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Создаем пользователей (если функция работает)
-- Если получаете ошибку доступа, создайте пользователей через Dashboard
DO $$
DECLARE
    client_id UUID;
    coach_id UUID;
    admin_id UUID;
BEGIN
    -- Пытаемся создать пользователей
    BEGIN
        SELECT create_user_if_not_exists('client@supa.app', 'client123!') INTO client_id;
        SELECT create_user_if_not_exists('coach@supa.app', 'coach123!') INTO coach_id;
        
        -- Проверяем существование thatguy@yandex.ru
        SELECT id INTO admin_id FROM auth.users WHERE email = 'thatguy@yandex.ru';
        IF admin_id IS NULL THEN
            RAISE NOTICE 'Пользователь thatguy@yandex.ru не найден. Создайте его вручную.';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Не удалось создать пользователей автоматически. Создайте их через Supabase Dashboard → Authentication → Users';
        RAISE NOTICE 'Ошибка: %', SQLERRM;
    END;
END $$;

-- Удаляем временную функцию
DROP FUNCTION IF EXISTS create_user_if_not_exists(TEXT, TEXT, BOOLEAN);

-- ============================================
-- ШАГ 2: Создание/обновление профилей
-- ============================================

-- 1. Создаем профиль для client@supa.app (клиент)
INSERT INTO profiles (id, email, role, subscription_status, subscription_tier, full_name)
SELECT 
    u.id,
    'client@supa.app',
    'client',
    'free',
    'basic',
    'Тестовый Клиент'
FROM auth.users u
WHERE u.email = 'client@supa.app'
ON CONFLICT (id) DO UPDATE SET
    role = 'client',
    subscription_status = COALESCE(profiles.subscription_status, 'free'),
    subscription_tier = COALESCE(profiles.subscription_tier, 'basic'),
    email = 'client@supa.app',
    full_name = COALESCE(profiles.full_name, 'Тестовый Клиент');

-- 2. Создаем профиль для coach@supa.app (тренер)
INSERT INTO profiles (id, email, role, subscription_status, subscription_tier, full_name)
SELECT 
    u.id,
    'coach@supa.app',
    'coach',
    'active',
    'premium',
    'Тестовый Тренер'
FROM auth.users u
WHERE u.email = 'coach@supa.app'
ON CONFLICT (id) DO UPDATE SET
    role = 'coach',
    subscription_status = 'active',
    subscription_tier = 'premium',
    email = 'coach@supa.app',
    full_name = COALESCE(profiles.full_name, 'Тестовый Тренер');

-- 3. Обновляем профиль thatguy@yandex.ru на super_admin
UPDATE profiles
SET 
    role = 'super_admin',
    email = 'thatguy@yandex.ru',
    full_name = COALESCE(full_name, 'Супер Админ')
WHERE id IN (
    SELECT id FROM auth.users WHERE email = 'thatguy@yandex.ru'
);

-- ============================================
-- ШАГ 3: Назначение тренера клиенту
-- ============================================

-- Назначаем coach@supa.app тренером для client@supa.app
UPDATE profiles
SET coach_id = (
    SELECT u.id 
    FROM auth.users u 
    WHERE u.email = 'coach@supa.app'
    LIMIT 1
)
WHERE id IN (
    SELECT u.id 
    FROM auth.users u 
    WHERE u.email = 'client@supa.app'
    LIMIT 1
)
AND role = 'client';

-- ============================================
-- ШАГ 4: Проверка результатов
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
        WHEN p.role = 'client' AND p.coach_id IS NOT NULL THEN '👤 Клиент (с тренером)'
        WHEN p.role = 'client' THEN '👤 Клиент (без тренера)'
        ELSE '❓ Неизвестная роль'
    END as status
FROM profiles p
LEFT JOIN profiles coach ON coach.id = p.coach_id
WHERE p.email IN ('client@supa.app', 'coach@supa.app', 'thatguy@yandex.ru')
ORDER BY 
    CASE p.role
        WHEN 'super_admin' THEN 1
        WHEN 'coach' THEN 2
        WHEN 'client' THEN 3
        ELSE 4
    END,
    p.email;

