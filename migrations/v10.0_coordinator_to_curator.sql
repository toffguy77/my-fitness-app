-- ============================================
-- Migration: Coordinator to Curator
-- Description: Замена роли "coordinator" на "curator" во всей базе данных
-- Date: 2025-01-12
-- Version: 10.0
-- 
-- ВАЖНО: Эта миграция переименовывает роль coordinator в curator
-- и все связанные объекты БД (таблицы, колонки, функции, индексы)
-- ============================================

-- ============================================
-- 1. ОБНОВИТЬ ENUM user_role
-- ============================================

-- Переименовать значение в ENUM
ALTER TYPE user_role RENAME VALUE 'coordinator' TO 'curator';

-- ============================================
-- 2. ПЕРЕИМЕНОВАТЬ КОЛОНКИ
-- ============================================

-- Переименовать coordinator_id в profiles
ALTER TABLE profiles RENAME COLUMN coordinator_id TO curator_id;

-- Переименовать coordinator_id в invite_codes
ALTER TABLE invite_codes RENAME COLUMN coordinator_id TO curator_id;

-- Переименовать coordinator_id в coordinator_notes (перед переименованием таблицы)
ALTER TABLE coordinator_notes RENAME COLUMN coordinator_id TO curator_id;

-- ============================================
-- 3. ПЕРЕИМЕНОВАТЬ ТАБЛИЦУ
-- ============================================

ALTER TABLE coordinator_notes RENAME TO curator_notes;

-- ============================================
-- 4. СОЗДАТЬ НОВЫЕ ФУНКЦИИ
-- ============================================
-- ВАЖНО: Создаем новые функции ПЕРЕД обновлением политик,
-- чтобы они были доступны для использования в политиках

-- Создать новую функцию is_curator (может существовать параллельно со старой)
CREATE OR REPLACE FUNCTION is_curator(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role = 'curator'
  );
END;
$$;

COMMENT ON FUNCTION is_curator(UUID) IS 'Проверяет, является ли пользователь curator (без рекурсии RLS)';

-- Создать новую функцию is_client_curator с правильными именами параметров
CREATE OR REPLACE FUNCTION is_client_curator(client_id UUID, potential_curator_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = client_id
    AND profiles.curator_id = potential_curator_id
  );
END;
$$;

COMMENT ON FUNCTION is_client_curator(UUID, UUID) IS 'Проверяет, является ли пользователь куратором клиента (без рекурсии RLS)';

-- ============================================
-- 5. ОБНОВИТЬ ИНДЕКСЫ
-- ============================================

-- Переименовать индексы для profiles
ALTER INDEX IF EXISTS idx_profiles_coordinator_id RENAME TO idx_profiles_curator_id;

-- Переименовать индексы для curator_notes
ALTER INDEX IF EXISTS idx_coordinator_notes_coordinator_date RENAME TO idx_curator_notes_curator_date;
ALTER INDEX IF EXISTS idx_coordinator_notes_client_date RENAME TO idx_curator_notes_client_date;

-- Переименовать индексы для invite_codes
ALTER INDEX IF EXISTS idx_invite_codes_coordinator RENAME TO idx_invite_codes_curator;

-- ============================================
-- 6. ОБНОВИТЬ КОММЕНТАРИИ
-- ============================================

COMMENT ON COLUMN profiles.curator_id IS 'ID куратора (для клиентов)';
COMMENT ON TABLE curator_notes IS 'Заметки куратора для клиентов на конкретную дату';
COMMENT ON COLUMN curator_notes.client_id IS 'ID клиента, для которого оставлена заметка';
COMMENT ON COLUMN curator_notes.curator_id IS 'ID куратора, который оставил заметку';
COMMENT ON COLUMN curator_notes.date IS 'Дата, к которой относится заметка';
COMMENT ON COLUMN curator_notes.content IS 'Текст заметки от куратора';
COMMENT ON COLUMN invite_codes.curator_id IS 'ID куратора, создавшего код';

-- ============================================
-- 7. ОБНОВИТЬ RLS ПОЛИТИКИ
-- ============================================

-- Удалить старые политики для curator_notes
DROP POLICY IF EXISTS "Coordinators can view notes for their clients" ON curator_notes;
DROP POLICY IF EXISTS "Coordinators can insert notes for their clients" ON curator_notes;
DROP POLICY IF EXISTS "Coordinators can update their own notes" ON curator_notes;
DROP POLICY IF EXISTS "Coordinators can delete their own notes" ON curator_notes;
DROP POLICY IF EXISTS "Clients can view notes from their coordinator" ON curator_notes;

-- Создать новые политики для curator_notes
CREATE POLICY "Curators can view notes for their clients"
  ON curator_notes FOR SELECT
  USING (
    curator_id = auth.uid() OR
    is_super_admin(auth.uid())
  );

CREATE POLICY "Curators can insert notes for their clients"
  ON curator_notes FOR INSERT
  WITH CHECK (
    curator_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = client_id
      AND profiles.curator_id = auth.uid()
    )
  );

CREATE POLICY "Curators can update their own notes"
  ON curator_notes FOR UPDATE
  USING (curator_id = auth.uid())
  WITH CHECK (curator_id = auth.uid());

CREATE POLICY "Curators can delete their own notes"
  ON curator_notes FOR DELETE
  USING (curator_id = auth.uid());

CREATE POLICY "Clients can view notes from their curator"
  ON curator_notes FOR SELECT
  USING (
    client_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.curator_id = curator_notes.curator_id
    )
  );

-- Обновить политики для profiles (если есть упоминания coordinator)
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
CREATE POLICY "Users can view profiles"
ON profiles FOR SELECT
USING (
    auth.uid() = id
    OR curator_id = auth.uid()
);

DROP POLICY IF EXISTS "Anyone can read public profiles" ON profiles;
CREATE POLICY "Anyone can read public profiles"
ON profiles FOR SELECT
USING (
  profile_visibility = 'public' OR
  auth.uid() = id OR
  curator_id = auth.uid()
);

-- Обновить политики для nutrition_targets
DROP POLICY IF EXISTS "Users can view nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can view nutrition targets"
ON nutrition_targets FOR SELECT
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_curator(auth.uid())
        AND is_client_curator(nutrition_targets.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can insert nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can insert nutrition targets"
ON nutrition_targets FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_curator(auth.uid())
        AND is_client_curator(nutrition_targets.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can update nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can update nutrition targets"
ON nutrition_targets FOR UPDATE
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_curator(auth.uid())
        AND is_client_curator(nutrition_targets.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can delete nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can delete nutrition targets"
ON nutrition_targets FOR DELETE
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_curator(auth.uid())
        AND is_client_curator(nutrition_targets.user_id, auth.uid())
    )
);

-- Обновить политики для daily_logs
DROP POLICY IF EXISTS "Users can view daily logs" ON daily_logs;
CREATE POLICY "Users can view daily logs"
ON daily_logs FOR SELECT
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_curator(auth.uid())
        AND is_client_curator(daily_logs.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can update daily logs" ON daily_logs;
CREATE POLICY "Users can update daily logs"
ON daily_logs FOR UPDATE
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_curator(auth.uid())
        AND is_client_curator(daily_logs.user_id, auth.uid())
    )
);

-- Обновить политики для invite_codes
DROP POLICY IF EXISTS "Coordinators can read their own invite codes" ON invite_codes;
CREATE POLICY "Curators can read their own invite codes"
ON invite_codes FOR SELECT
USING (auth.uid() = curator_id);

DROP POLICY IF EXISTS "Coordinators can create their own invite codes" ON invite_codes;
CREATE POLICY "Curators can create their own invite codes"
ON invite_codes FOR INSERT
WITH CHECK (auth.uid() = curator_id);

DROP POLICY IF EXISTS "Coordinators can update their own invite codes" ON invite_codes;
CREATE POLICY "Curators can update their own invite codes"
ON invite_codes FOR UPDATE
USING (auth.uid() = curator_id)
WITH CHECK (auth.uid() = curator_id);

DROP POLICY IF EXISTS "Coordinators can delete their own invite codes" ON invite_codes;
CREATE POLICY "Curators can delete their own invite codes"
ON invite_codes FOR DELETE
USING (auth.uid() = curator_id);

-- Обновить политики для invite_code_usage
DROP POLICY IF EXISTS "Coordinators can read usage of their invite codes" ON invite_code_usage;
CREATE POLICY "Curators can read usage of their invite codes"
ON invite_code_usage FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM invite_codes
    WHERE invite_codes.id = invite_code_usage.invite_code_id
    AND invite_codes.curator_id = auth.uid()
  )
);

-- ============================================
-- 8. ОБНОВИТЬ ФУНКЦИЮ use_invite_code
-- ============================================

-- Обновить функцию для использования инвайт-кода с новым именем колонки
CREATE OR REPLACE FUNCTION use_invite_code(
  code_param TEXT,
  user_id_param UUID
) RETURNS UUID AS $$
DECLARE
  invite_code_record invite_codes%ROWTYPE;
  curator_id_result UUID;
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

  -- Возвращаем ID куратора
  RETURN invite_code_record.curator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION use_invite_code IS 'Использует инвайт-код и возвращает ID куратора для назначения клиенту';

-- ============================================
-- 9. ОБНОВИТЬ ФУНКЦИЮ create_user_profile
-- ============================================

-- Сначала удаляем старую функцию, так как нельзя изменить имена параметров
DROP FUNCTION IF EXISTS create_user_profile(UUID, TEXT, TEXT, user_role, UUID);

-- Создаем функцию заново с новым именем параметра
CREATE OR REPLACE FUNCTION create_user_profile(
  user_id UUID,
  user_email TEXT,
  user_full_name TEXT DEFAULT NULL,
  user_role user_role DEFAULT 'client',
  user_curator_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      curator_id,
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
      user_curator_id,
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
      curator_id,
      subscription_status,
      subscription_tier,
      created_at,
      updated_at
    ) VALUES (
      user_id,
      user_email,
      user_full_name,
      user_role,
      user_curator_id,
      'free',
      'basic',
      NOW(),
      NOW()
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION create_user_profile(UUID, TEXT, TEXT, user_role, UUID) IS 'Безопасно создает профиль пользователя, обходя RLS. Используется при регистрации. Параметр user_curator_id - ID куратора для назначения клиенту.';

-- ============================================
-- 10. УДАЛИТЬ СТАРЫЕ ФУНКЦИИ
-- ============================================
-- ВАЖНО: Удаляем старые функции ПОСЛЕ обновления всех политик,
-- которые их использовали

-- Удалить старую функцию is_coordinator (теперь все политики используют is_curator)
DROP FUNCTION IF EXISTS is_coordinator(UUID);

-- Удалить старую функцию is_client_coordinator (теперь все политики используют is_client_curator)
DROP FUNCTION IF EXISTS is_client_coordinator(UUID, UUID);

-- ============================================
-- ГОТОВО!
-- ============================================

-- Миграция завершена. Все объекты БД переименованы с coordinator на curator.