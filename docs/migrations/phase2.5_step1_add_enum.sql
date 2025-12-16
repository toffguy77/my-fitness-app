-- Phase 2.5: ШАГ 1 - Добавление super_admin в enum
-- Выполните ЭТОТ запрос ПЕРВЫМ

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

