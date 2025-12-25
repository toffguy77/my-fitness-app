-- SQL скрипт для проверки функции create_user_profile
-- Выполните этот запрос в Supabase SQL Editor
-- Версия: v9.5 (упрощенная версия без проверок и задержек)

-- ============================================
-- 1. ПРОВЕРКА СУЩЕСТВОВАНИЯ И СИГНАТУРЫ
-- ============================================

SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type,
    CASE 
        WHEN p.prosecdef THEN 'SECURITY DEFINER ✅'
        ELSE 'SECURITY INVOKER ❌'
    END as security_type,
    CASE 
        WHEN pg_get_function_arguments(p.oid) LIKE '%user_coordinator_id%' THEN '✅ Правильная сигнатура'
        WHEN pg_get_function_arguments(p.oid) LIKE '%user_coach_id%' THEN '❌ Устаревшая сигнатура (user_coach_id)'
        ELSE '⚠️ Неизвестная сигнатура'
    END as signature_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'create_user_profile';

-- ============================================
-- 2. ПРОВЕРКА ТЕЛА ФУНКЦИИ (логика)
-- ============================================

-- Проверка наличия ON CONFLICT DO NOTHING
SELECT 
    CASE 
        WHEN p.prosrc LIKE '%ON CONFLICT%DO NOTHING%' THEN '✅ ON CONFLICT DO NOTHING найден'
        ELSE '❌ ON CONFLICT DO NOTHING НЕ найден'
    END as on_conflict_check,
    -- Проверка отсутствия pg_sleep
    CASE 
        WHEN p.prosrc LIKE '%pg_sleep%' THEN '❌ pg_sleep найден (может вызывать timeout)'
        ELSE '✅ pg_sleep не найден'
    END as no_delays_check,
    -- Проверка отсутствия проверок существования пользователя
    CASE 
        WHEN p.prosrc LIKE '%EXISTS (SELECT 1 FROM auth.users%' THEN '⚠️ Проверка существования пользователя найдена (может вызывать timeout)'
        ELSE '✅ Нет проверок существования пользователя'
    END as no_user_check,
    -- Проверка наличия SECURITY DEFINER
    CASE 
        WHEN p.prosecdef THEN '✅ SECURITY DEFINER установлен (обходит RLS)'
        ELSE '❌ SECURITY DEFINER НЕ установлен'
    END as security_definer_check
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'create_user_profile';

-- ============================================
-- 3. ПОКАЗАТЬ ПОЛНЫЙ КОД ФУНКЦИИ
-- ============================================

SELECT 
    p.prosrc as function_source_code
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'create_user_profile';

-- ============================================
-- 4. ПРОВЕРКА ВСЕХ ФУНКЦИЙ СО СЛОВОМ "profile"
-- ============================================

SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    CASE 
        WHEN p.prosecdef THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END as security_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname LIKE '%profile%'
ORDER BY p.proname;

-- ============================================
-- 5. ОЖИДАЕМАЯ ПРАВИЛЬНАЯ СИГНАТУРА
-- ============================================

-- Правильная сигнатура должна быть:
-- user_id uuid, user_email text, user_full_name text DEFAULT NULL::text, 
-- user_role user_role DEFAULT 'client'::user_role, 
-- user_coordinator_id uuid DEFAULT NULL::uuid

-- Если функция не существует или имеет неправильную сигнатуру,
-- примените миграцию v9.5_simplify_create_user_profile_no_checks.sql

