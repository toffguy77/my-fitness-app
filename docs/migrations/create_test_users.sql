-- Создание тестовых пользователей и назначение ролей
-- ВАЖНО: Пользователи должны быть созданы в Supabase Auth перед выполнением этого скрипта
-- Или создайте их через Supabase Dashboard → Authentication → Users → Add User

-- ============================================
-- ШАГ 1: Создание пользователей в auth.users (если еще не созданы)
-- ============================================
-- Если пользователи уже созданы через Supabase Auth, пропустите этот шаг

-- Функция для создания пользователя (если не существует)
DO $$
DECLARE
    client_user_id UUID;
    coach_user_id UUID;
    admin_user_id UUID;
BEGIN
    -- Проверяем и создаем client@supa.app
    SELECT id INTO client_user_id FROM auth.users WHERE email = 'client@supa.app';
    IF client_user_id IS NULL THEN
        -- Создаем пользователя через auth.users (требует расширенных прав)
        -- ВАЖНО: Обычно пользователи создаются через Supabase Auth API
        -- Если у вас нет прав на прямую вставку в auth.users, создайте пользователя вручную через Dashboard
        RAISE NOTICE 'Пользователь client@supa.app не найден. Создайте его через Supabase Dashboard → Authentication';
    END IF;

    -- Проверяем и создаем coach@supa.app
    SELECT id INTO coach_user_id FROM auth.users WHERE email = 'coach@supa.app';
    IF coach_user_id IS NULL THEN
        RAISE NOTICE 'Пользователь coach@supa.app не найден. Создайте его через Supabase Dashboard → Authentication';
    END IF;

    -- Проверяем thatguy@yandex.ru
    SELECT id INTO admin_user_id FROM auth.users WHERE email = 'thatguy@yandex.ru';
    IF admin_user_id IS NULL THEN
        RAISE NOTICE 'Пользователь thatguy@yandex.ru не найден. Создайте его через Supabase Dashboard → Authentication';
    END IF;
END $$;

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

