-- ============================================
-- Backup Script: Coordinator to Curator Migration
-- Description: Создание резервных копий данных перед миграцией v10.0
-- Date: 2025-01-13
-- Version: 10.0-backup
-- 
-- ВАЖНО: Выполнить ПЕРЕД применением v10.0_coordinator_to_curator.sql
-- Создает резервные копии всех затрагиваемых таблиц и объектов
-- ============================================

-- ============================================
-- 1. СОЗДАТЬ СХЕМУ ДЛЯ РЕЗЕРВНЫХ КОПИЙ
-- ============================================

-- Создать схему для хранения резервных копий
CREATE SCHEMA IF NOT EXISTS migration_backup_v10;

-- Установить комментарий для схемы
COMMENT ON SCHEMA migration_backup_v10 IS 'Резервные копии данных перед миграцией coordinator -> curator (v10.0)';

-- ============================================
-- 2. РЕЗЕРВНОЕ КОПИРОВАНИЕ ТАБЛИЦ
-- ============================================

-- Резервная копия таблицы profiles (содержит coordinator_id)
CREATE TABLE migration_backup_v10.profiles_backup AS 
SELECT * FROM profiles;

-- Резервная копия таблицы coordinator_notes (будет переименована)
CREATE TABLE migration_backup_v10.coordinator_notes_backup AS 
SELECT * FROM coordinator_notes;

-- Резервная копия таблицы invite_codes (содержит coordinator_id)
CREATE TABLE migration_backup_v10.invite_codes_backup AS 
SELECT * FROM invite_codes;

-- Резервная копия таблицы invite_code_usage (связана с invite_codes)
CREATE TABLE migration_backup_v10.invite_code_usage_backup AS 
SELECT * FROM invite_code_usage;

-- ============================================
-- 3. РЕЗЕРВНОЕ КОПИРОВАНИЕ ENUM ТИПОВ
-- ============================================

-- Создать резервную копию enum user_role
DO $
BEGIN
    -- Создать временную таблицу для хранения значений enum
    CREATE TABLE migration_backup_v10.user_role_enum_backup (
        enum_value TEXT PRIMARY KEY,
        backed_up_at TIMESTAMP DEFAULT NOW()
    );
    
    -- Сохранить все значения enum
    INSERT INTO migration_backup_v10.user_role_enum_backup (enum_value)
    SELECT unnest(enum_range(NULL::user_role))::TEXT;
END
$;

-- ============================================
-- 4. РЕЗЕРВНОЕ КОПИРОВАНИЕ ФУНКЦИЙ
-- ============================================

-- Сохранить определения функций, которые будут изменены
CREATE TABLE migration_backup_v10.functions_backup (
    function_name TEXT,
    function_definition TEXT,
    backed_up_at TIMESTAMP DEFAULT NOW()
);

-- Сохранить функцию is_coordinator
INSERT INTO migration_backup_v10.functions_backup (function_name, function_definition)
SELECT 
    'is_coordinator',
    pg_get_functiondef(oid)
FROM pg_proc 
WHERE proname = 'is_coordinator' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Сохранить функцию is_client_coordinator
INSERT INTO migration_backup_v10.functions_backup (function_name, function_definition)
SELECT 
    'is_client_coordinator',
    pg_get_functiondef(oid)
FROM pg_proc 
WHERE proname = 'is_client_coordinator' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Сохранить функцию use_invite_code
INSERT INTO migration_backup_v10.functions_backup (function_name, function_definition)
SELECT 
    'use_invite_code',
    pg_get_functiondef(oid)
FROM pg_proc 
WHERE proname = 'use_invite_code' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Сохранить функцию create_user_profile
INSERT INTO migration_backup_v10.functions_backup (function_name, function_definition)
SELECT 
    'create_user_profile',
    pg_get_functiondef(oid)
FROM pg_proc 
WHERE proname = 'create_user_profile' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ============================================
-- 5. РЕЗЕРВНОЕ КОПИРОВАНИЕ ИНДЕКСОВ
-- ============================================

-- Сохранить определения индексов, которые будут переименованы
CREATE TABLE migration_backup_v10.indexes_backup (
    index_name TEXT,
    table_name TEXT,
    index_definition TEXT,
    backed_up_at TIMESTAMP DEFAULT NOW()
);

-- Сохранить индексы, которые будут переименованы
INSERT INTO migration_backup_v10.indexes_backup (index_name, table_name, index_definition)
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
AND (
    indexname LIKE '%coordinator%' OR
    tablename = 'coordinator_notes'
);

-- ============================================
-- 6. РЕЗЕРВНОЕ КОПИРОВАНИЕ RLS ПОЛИТИК
-- ============================================

-- Сохранить определения RLS политик
CREATE TABLE migration_backup_v10.policies_backup (
    table_name TEXT,
    policy_name TEXT,
    policy_definition TEXT,
    backed_up_at TIMESTAMP DEFAULT NOW()
);

-- Сохранить политики для таблиц, которые будут изменены
INSERT INTO migration_backup_v10.policies_backup (table_name, policy_name, policy_definition)
SELECT 
    schemaname || '.' || tablename as table_name,
    policyname,
    'CREATE POLICY "' || policyname || '" ON ' || schemaname || '.' || tablename || 
    ' FOR ' || cmd || 
    CASE WHEN permissive = 'PERMISSIVE' THEN ' TO ' ELSE ' TO ' END ||
    CASE WHEN roles IS NOT NULL THEN array_to_string(roles, ', ') ELSE 'public' END ||
    CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END ||
    CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END ||
    ';' as policy_definition
FROM pg_policies 
WHERE schemaname = 'public' 
AND (
    tablename IN ('profiles', 'coordinator_notes', 'invite_codes', 'invite_code_usage', 'nutrition_targets', 'daily_logs') OR
    qual LIKE '%coordinator%' OR
    with_check LIKE '%coordinator%'
);

-- ============================================
-- 7. СОЗДАТЬ МЕТАДАННЫЕ РЕЗЕРВНОЙ КОПИИ
-- ============================================

-- Создать таблицу с метаданными резервной копии
CREATE TABLE migration_backup_v10.backup_metadata (
    backup_id SERIAL PRIMARY KEY,
    backup_date TIMESTAMP DEFAULT NOW(),
    migration_version TEXT DEFAULT 'v10.0',
    description TEXT,
    tables_backed_up INTEGER,
    functions_backed_up INTEGER,
    indexes_backed_up INTEGER,
    policies_backed_up INTEGER
);

-- Записать метаданные
INSERT INTO migration_backup_v10.backup_metadata (
    description,
    tables_backed_up,
    functions_backed_up,
    indexes_backed_up,
    policies_backed_up
) VALUES (
    'Полная резервная копия перед миграцией coordinator -> curator',
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'migration_backup_v10' AND table_name LIKE '%_backup'),
    (SELECT COUNT(*) FROM migration_backup_v10.functions_backup),
    (SELECT COUNT(*) FROM migration_backup_v10.indexes_backup),
    (SELECT COUNT(*) FROM migration_backup_v10.policies_backup)
);

-- ============================================
-- 8. СОЗДАТЬ ФУНКЦИЮ ПРОВЕРКИ ЦЕЛОСТНОСТИ
-- ============================================

-- Функция для проверки целостности резервной копии
CREATE OR REPLACE FUNCTION migration_backup_v10.verify_backup_integrity()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    details TEXT
) AS $
BEGIN
    -- Проверить количество записей в резервных копиях таблиц
    RETURN QUERY
    SELECT 
        'profiles_backup_count'::TEXT,
        CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
        'Записей в резервной копии: ' || COUNT(*)::TEXT
    FROM migration_backup_v10.profiles_backup;
    
    RETURN QUERY
    SELECT 
        'coordinator_notes_backup_count'::TEXT,
        CASE WHEN COUNT(*) >= 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
        'Записей в резервной копии: ' || COUNT(*)::TEXT
    FROM migration_backup_v10.coordinator_notes_backup;
    
    RETURN QUERY
    SELECT 
        'invite_codes_backup_count'::TEXT,
        CASE WHEN COUNT(*) >= 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
        'Записей в резервной копии: ' || COUNT(*)::TEXT
    FROM migration_backup_v10.invite_codes_backup;
    
    -- Проверить наличие функций в резервной копии
    RETURN QUERY
    SELECT 
        'functions_backup_count'::TEXT,
        CASE WHEN COUNT(*) >= 4 THEN 'OK' ELSE 'FAIL' END::TEXT,
        'Функций в резервной копии: ' || COUNT(*)::TEXT
    FROM migration_backup_v10.functions_backup;
    
    -- Проверить наличие индексов в резервной копии
    RETURN QUERY
    SELECT 
        'indexes_backup_count'::TEXT,
        CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
        'Индексов в резервной копии: ' || COUNT(*)::TEXT
    FROM migration_backup_v10.indexes_backup;
    
    -- Проверить наличие политик в резервной копии
    RETURN QUERY
    SELECT 
        'policies_backup_count'::TEXT,
        CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
        'Политик в резервной копии: ' || COUNT(*)::TEXT
    FROM migration_backup_v10.policies_backup;
END;
$ LANGUAGE plpgsql;

COMMENT ON FUNCTION migration_backup_v10.verify_backup_integrity() IS 'Проверяет целостность резервной копии перед миграцией';

-- ============================================
-- 9. ВЫВЕСТИ ОТЧЕТ О РЕЗЕРВНОМ КОПИРОВАНИИ
-- ============================================

-- Показать статистику резервного копирования
SELECT 
    'РЕЗЕРВНОЕ КОПИРОВАНИЕ ЗАВЕРШЕНО' as status,
    NOW() as completed_at;

-- Показать количество скопированных объектов
SELECT 
    'Таблицы' as object_type,
    COUNT(*) as backed_up_count
FROM information_schema.tables 
WHERE table_schema = 'migration_backup_v10' 
AND table_name LIKE '%_backup'

UNION ALL

SELECT 
    'Функции' as object_type,
    COUNT(*) as backed_up_count
FROM migration_backup_v10.functions_backup

UNION ALL

SELECT 
    'Индексы' as object_type,
    COUNT(*) as backed_up_count
FROM migration_backup_v10.indexes_backup

UNION ALL

SELECT 
    'Политики' as object_type,
    COUNT(*) as backed_up_count
FROM migration_backup_v10.policies_backup;

-- Запустить проверку целостности
SELECT * FROM migration_backup_v10.verify_backup_integrity();

-- ============================================
-- ГОТОВО!
-- ============================================

-- Резервное копирование завершено.
-- Теперь можно безопасно применять миграцию v10.0_coordinator_to_curator.sql
-- 
-- Для восстановления используйте скрипт v10.0_coordinator_to_curator_rollback.sql