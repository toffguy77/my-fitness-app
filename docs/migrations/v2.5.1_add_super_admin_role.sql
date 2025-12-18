-- Migration: v2.5.1_add_super_admin_role
-- Description: Добавление роли super_admin в enum user_role для Phase 2.5 (Freemium SaaS)
-- Dependencies: None (базовая миграция для Phase 2.5)
-- Date: 2024-12-01
-- 
-- ВАЖНО: Эта миграция должна быть выполнена ПЕРВОЙ в Phase 2.5
-- PostgreSQL требует коммита после добавления нового значения enum

DO $$ 
BEGIN
    -- Проверяем, существует ли значение 'super_admin' в enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'super_admin' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
        ALTER TYPE user_role ADD VALUE 'super_admin';
    END IF;
END $$;

