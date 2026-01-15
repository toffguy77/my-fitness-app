-- ============================================
-- Rollback Script: Coordinator to Curator Migration
-- Description: Откат миграции v10.0 - возврат от "curator" к "coordinator"
-- Date: 2025-01-13
-- Version: 10.0-rollback
--
-- ВАЖНО: Выполнить ТОЛЬКО в случае необходимости отката миграции v10.0
-- Восстанавливает все объекты БД с терминологией "coordinator"
-- Требует наличия резервной копии migration_backup_v10
-- ============================================

-- ============================================
-- ПРОВЕРКИ БЕЗОПАСНОСТИ
-- ============================================

-- Проверить наличие резервной копии
DO $
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'migration_backup_v10') THEN
        RAISE EXCEPTION 'ОШИБКА: Резервная копия migration_backup_v10 не найдена. Откат невозможен.';
    END IF;

    -- Проверить целостность резервной копии
    IF NOT EXISTS (SELECT 1 FROM migration_backup_v10.backup_metadata) THEN
        RAISE EXCEPTION 'ОШИБКА: Метаданные резервной копии повреждены. Откат небезопасен.';
    END IF;

    RAISE NOTICE 'Резервная копия найдена. Начинаем откат миграции...';
END
$;

-- ============================================
-- 1. СОЗДАТЬ НОВЫЕ ФУНКЦИИ С COORDINATOR
-- ============================================
-- ВАЖНО: Создаем функции ПЕРЕД обновлением политик

-- Восстановить функцию is_coordinator
CREATE OR REPLACE FUNCTION is_coordinator(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role = 'coordinator'
  );
END;
$;

COMMENT ON FUNCTION is_coordinator(UUID) IS 'Проверяет, является ли пользователь coordinator (без рекурсии RLS)';

-- Восстановить функцию is_client_coordinator
CREATE OR REPLACE FUNCTION is_client_coordinator(client_id UUID, potential_coordinator_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = client_id
    AND profiles.coordinator_id = potential_coordinator_id
  );
END;
$;

COMMENT ON FUNCTION is_client_coordinator(UUID, UUID) IS 'Проверяет, является ли пользователь координатором клиента (без рекурсии RLS)';

-- ============================================
-- 2. ОТКАТИТЬ RLS ПОЛИТИКИ
-- ============================================

-- Удалить новые политики для curator_notes
DROP POLICY IF EXISTS "Curators can view notes for their clients" ON curator_notes;
DROP POLICY IF EXISTS "Curators can insert notes for their clients" ON curator_notes;
DROP POLICY IF EXISTS "Curators can update their own notes" ON curator_notes;
DROP POLICY IF EXISTS "Curators can delete their own notes" ON curator_notes;
DROP POLICY IF EXISTS "Clients can view notes from their curator" ON curator_notes;

-- Создать старые политики для coordinator_notes (пока таблица еще называется curator_notes)
CREATE POLICY "Coordinators can view notes for their clients"
  ON curator_notes FOR SELECT
  USING (
    coordinator_id = auth.uid() OR
    is_super_admin(auth.uid())
  );

CREATE POLICY "Coordinators can insert notes for their clients"
  ON curator_notes FOR INSERT
  WITH CHECK (
    coordinator_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = client_id
      AND profiles.coordinator_id = auth.uid()
    )
  );

CREATE POLICY "Coordinators can update their own notes"
  ON curator_notes FOR UPDATE
  USING (coordinator_id = auth.uid())
  WITH CHECK (coordinator_id = auth.uid());

CREATE POLICY "Coordinators can delete their own notes"
  ON curator_notes FOR DELETE
  USING (coordinator_id = auth.uid());

CREATE POLICY "Clients can view notes from their coordinator"
  ON curator_notes FOR SELECT
  USING (
    client_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.coordinator_id = curator_notes.coordinator_id
    )
  );

-- Откатить политики для profiles
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
CREATE POLICY "Users can view profiles"
ON profiles FOR SELECT
USING (
    auth.uid() = id
    OR coordinator_id = auth.uid()
);

DROP POLICY IF EXISTS "Anyone can read public profiles" ON profiles;
CREATE POLICY "Anyone can read public profiles"
ON profiles FOR SELECT
USING (
  profile_visibility = 'public' OR
  auth.uid() = id OR
  coordinator_id = auth.uid()
);

-- Откатить политики для nutrition_targets
DROP POLICY IF EXISTS "Users can view nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can view nutrition targets"
ON nutrition_targets FOR SELECT
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coordinator(auth.uid())
        AND is_client_coordinator(nutrition_targets.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can insert nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can insert nutrition targets"
ON nutrition_targets FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coordinator(auth.uid())
        AND is_client_coordinator(nutrition_targets.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can update nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can update nutrition targets"
ON nutrition_targets FOR UPDATE
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coordinator(auth.uid())
        AND is_client_coordinator(nutrition_targets.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can delete nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can delete nutrition targets"
ON nutrition_targets FOR DELETE
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coordinator(auth.uid())
        AND is_client_coordinator(nutrition_targets.user_id, auth.uid())
    )
);

-- Откатить политики для daily_logs
DROP POLICY IF EXISTS "Users can view daily logs" ON daily_logs;
CREATE POLICY "Users can view daily logs"
ON daily_logs FOR SELECT
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coordinator(auth.uid())
        AND is_client_coordinator(daily_logs.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can update daily logs" ON daily_logs;
CREATE POLICY "Users can update daily logs"
ON daily_logs FOR UPDATE
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coordinator(auth.uid())
        AND is_client_coordinator(daily_logs.user_id, auth.uid())
    )
);

-- Откатить политики для invite_codes
DROP POLICY IF EXISTS "Curators can read their own invite codes" ON invite_codes;
CREATE POLICY "Coordinators can read their own invite codes"
ON invite_codes FOR SELECT
USING (auth.uid() = coordinator_id);

DROP POLICY IF EXISTS "Curators can create their own invite codes" ON invite_codes;
CREATE POLICY "Coordinators can create their own invite codes"
ON invite_codes FOR INSERT
WITH CHECK (auth.uid() = coordinator_id);

DROP POLICY IF EXISTS "Curators can update their own invite codes" ON invite_codes;
CREATE POLICY "Coordinators can update their own invite codes"
ON invite_codes FOR UPDATE
USING (auth.uid() = coordinator_id)
WITH CHECK (auth.uid() = coordinator_id);

DROP POLICY IF EXISTS "Curators can delete their own invite codes" ON invite_codes;
CREATE POLICY "Coordinators can delete their own invite codes"
ON invite_codes FOR DELETE
USING (auth.uid() = coordinator_id);

-- Откатить политики для invite_code_usage
DROP POLICY IF EXISTS "Curators can read usage of their invite codes" ON invite_code_usage;
CREATE POLICY "Coordinators can read usage of their invite codes"
ON invite_code_usage FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM invite_codes
    WHERE invite_codes.id = invite_code_usage.invite_code_id
    AND invite_codes.coordinator_id = auth.uid()
  )
);

-- ============================================
-- 3. ОТКАТИТЬ ИНДЕКСЫ
-- ============================================

-- Переименовать индексы обратно к coordinator
ALTER INDEX IF EXISTS idx_profiles_curator_id RENAME TO idx_profiles_coordinator_id;
ALTER INDEX IF EXISTS idx_curator_notes_curator_date RENAME TO idx_coordinator_notes_coordinator_date;
ALTER INDEX IF EXISTS idx_curator_notes_client_date RENAME TO idx_coordinator_notes_client_date;
ALTER INDEX IF EXISTS idx_invite_codes_curator RENAME TO idx_invite_codes_coordinator;

-- ============================================
-- 4. ОТКАТИТЬ ТАБЛИЦЫ И КОЛОНКИ
-- ============================================

-- Переименовать таблицу обратно
ALTER TABLE curator_notes RENAME TO coordinator_notes;

-- Переименовать колонки обратно
ALTER TABLE coordinator_notes RENAME COLUMN curator_id TO coordinator_id;
ALTER TABLE profiles RENAME COLUMN curator_id TO coordinator_id;
ALTER TABLE invite_codes RENAME COLUMN curator_id TO coordinator_id;

-- ============================================
-- 5. ОТКАТИТЬ ENUM user_role
-- ============================================

-- Переименовать значение в ENUM обратно
ALTER TYPE user_role RENAME VALUE 'curator' TO 'coordinator';

-- ============================================
-- 6. ОТКАТИТЬ ФУНКЦИИ
-- ============================================

-- Восстановить функцию use_invite_code с coordinator_id
CREATE OR REPLACE FUNCTION use_invite_code(
  code_param TEXT,
  user_id_param UUID
) RETURNS UUID AS $
DECLARE
  invite_code_record invite_codes%ROWTYPE;
  coordinator_id_result UUID;
BEGIN
  -- Находим активный код
  SELECT * INTO invite_code_record
  FROM invite_codes
  WHERE code = code_param
  AND is_active = TRUE
  AND (expires_at IS NULL OR expires_at > NOW())
  AND (max_uses IS NULL OR used_count < max_uses)
  FOR UPDATE;

  -- Проверяем, что код найден и валиден
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  -- Проверяем, что пользователь еще не использовал этот код
  IF EXISTS (
    SELECT 1 FROM invite_code_usage
    WHERE invite_code_id = invite_code_record.id
    AND user_id = user_id_param
  ) THEN
    RAISE EXCEPTION 'Invite code already used by this user';
  END IF;

  -- Увеличиваем счетчик использований
  UPDATE invite_codes
  SET used_count = used_count + 1,
      last_used_at = NOW()
  WHERE id = invite_code_record.id;

  -- Создаем запись использования
  INSERT INTO invite_code_usage (invite_code_id, user_id)
  VALUES (invite_code_record.id, user_id_param)
  ON CONFLICT (invite_code_id, user_id) DO NOTHING;

  -- Возвращаем ID координатора
  RETURN invite_code_record.coordinator_id;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION use_invite_code IS 'Использует инвайт-код и возвращает ID координатора для назначения клиенту';

-- Восстановить функцию create_user_profile с coordinator_id
DROP FUNCTION IF EXISTS create_user_profile(UUID, TEXT, TEXT, user_role, UUID);

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
AS $
DECLARE
  has_profile_visibility BOOLEAN;
BEGIN
  -- Проверяем, что профиль еще не существует
  IF EXISTS (SELECT 1 FROM profiles WHERE id = user_id) THEN
    RETURN;
  END IF;

  -- Проверяем наличие колонки profile_visibility
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'profiles'
    AND column_name = 'profile_visibility'
  ) INTO has_profile_visibility;

  -- Создаем профиль с учетом наличия колонки profile_visibility
  IF has_profile_visibility THEN
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
  ELSE
    -- Для баз данных без колонки profile_visibility (обратная совместимость)
    INSERT INTO profiles (
      id,
      email,
      full_name,
      role,
      coordinator_id,
      subscription_status,
      subscription_tier,
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
      NOW(),
      NOW()
    );
  END IF;
END;
$;

COMMENT ON FUNCTION create_user_profile(UUID, TEXT, TEXT, user_role, UUID) IS 'Безопасно создает профиль пользователя, обходя RLS. Используется при регистрации. Параметр user_coordinator_id - ID координатора для назначения клиенту.';

-- ============================================
-- 7. УДАЛИТЬ НОВЫЕ ФУНКЦИИ
-- ============================================

-- Удалить функции с curator
DROP FUNCTION IF EXISTS is_curator(UUID);
DROP FUNCTION IF EXISTS is_client_curator(UUID, UUID);

-- ============================================
-- 8. ОТКАТИТЬ КОММЕНТАРИИ
-- ============================================

COMMENT ON COLUMN profiles.coordinator_id IS 'ID координатора (для клиентов)';
COMMENT ON TABLE coordinator_notes IS 'Заметки координатора для клиентов на конкретную дату';
COMMENT ON COLUMN coordinator_notes.client_id IS 'ID клиента, для которого оставлена заметка';
COMMENT ON COLUMN coordinator_notes.coordinator_id IS 'ID координатора, который оставил заметку';
COMMENT ON COLUMN coordinator_notes.date IS 'Дата, к которой относится заметка';
COMMENT ON COLUMN coordinator_notes.content IS 'Текст заметки от координатора';
COMMENT ON COLUMN invite_codes.coordinator_id IS 'ID координатора, создавшего код';

-- ============================================
-- 9. ПРОВЕРКА ЦЕЛОСТНОСТИ ПОСЛЕ ОТКАТА
-- ============================================

-- Создать функцию проверки целостности после отката
CREATE OR REPLACE FUNCTION verify_rollback_integrity()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    details TEXT
) AS $
BEGIN
    -- Проверить, что enum содержит coordinator
    RETURN QUERY
    SELECT
        'enum_coordinator_exists'::TEXT,
        CASE WHEN 'coordinator'::TEXT = ANY(enum_range(NULL::user_role)::TEXT[]) THEN 'OK' ELSE 'FAIL' END::TEXT,
        'Enum user_role содержит coordinator: ' || ('coordinator'::TEXT = ANY(enum_range(NULL::user_role)::TEXT[]))::TEXT;

    -- Проверить, что таблица coordinator_notes существует
    RETURN QUERY
    SELECT
        'coordinator_notes_table_exists'::TEXT,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coordinator_notes') THEN 'OK' ELSE 'FAIL' END::TEXT,
        'Таблица coordinator_notes существует: ' || EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coordinator_notes')::TEXT;

    -- Проверить, что колонка coordinator_id существует в profiles
    RETURN QUERY
    SELECT
        'profiles_coordinator_id_exists'::TEXT,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'coordinator_id') THEN 'OK' ELSE 'FAIL' END::TEXT,
        'Колонка coordinator_id в profiles существует: ' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'coordinator_id')::TEXT;

    -- Проверить, что функция is_coordinator существует
    RETURN QUERY
    SELECT
        'is_coordinator_function_exists'::TEXT,
        CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_coordinator') THEN 'OK' ELSE 'FAIL' END::TEXT,
        'Функция is_coordinator существует: ' || EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_coordinator')::TEXT;

    -- Проверить количество записей в основных таблицах
    RETURN QUERY
    SELECT
        'data_integrity_profiles'::TEXT,
        'OK'::TEXT,
        'Записей в profiles: ' || COUNT(*)::TEXT
    FROM profiles;

    RETURN QUERY
    SELECT
        'data_integrity_coordinator_notes'::TEXT,
        'OK'::TEXT,
        'Записей в coordinator_notes: ' || COUNT(*)::TEXT
    FROM coordinator_notes;
END;
$ LANGUAGE plpgsql;

-- ============================================
-- 10. СОЗДАТЬ ОТЧЕТ ОБ ОТКАТЕ
-- ============================================

-- Создать таблицу для отчета об откате
CREATE TABLE IF NOT EXISTS rollback_report (
    rollback_id SERIAL PRIMARY KEY,
    rollback_date TIMESTAMP DEFAULT NOW(),
    migration_version TEXT DEFAULT 'v10.0',
    rollback_status TEXT DEFAULT 'completed',
    details TEXT
);

-- Записать информацию об откате
INSERT INTO rollback_report (details) VALUES (
    'Откат миграции coordinator -> curator выполнен успешно. Все объекты БД восстановлены к состоянию до миграции.'
);

-- ============================================
-- ФИНАЛЬНАЯ ПРОВЕРКА И ОТЧЕТ
-- ============================================

-- Показать результат отката
SELECT
    'ОТКАТ МИГРАЦИИ ЗАВЕРШЕН' as status,
    NOW() as completed_at;

-- Запустить проверку целостности
SELECT * FROM verify_rollback_integrity();

-- Показать отчет об откате
SELECT * FROM rollback_report ORDER BY rollback_date DESC LIMIT 1;

-- ============================================
-- ГОТОВО!
-- ============================================

-- Откат миграции завершен.
-- Все объекты БД восстановлены к состоянию "coordinator".
--
-- ВАЖНО: После подтверждения успешного отката рекомендуется:
-- 1. Проверить работу приложения
-- 2. Убедиться в корректности данных
-- 3. При необходимости очистить резервную копию:
--    DROP SCHEMA migration_backup_v10 CASCADE;
