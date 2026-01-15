-- ============================================
-- Migration: Coach to Coordinator
-- Description: Замена роли "coach" на "coordinator" во всей базе данных
-- Date: 2025-01-XX
-- Version: 9.0
--
-- ВАЖНО: Эта миграция переименовывает роль coach в coordinator
-- и все связанные объекты БД (таблицы, колонки, функции, индексы)
-- ============================================

-- ============================================
-- 1. ОБНОВИТЬ ENUM user_role
-- ============================================

-- Переименовать значение в ENUM
ALTER TYPE user_role RENAME VALUE 'coach' TO 'coordinator';

-- ============================================
-- 2. ПЕРЕИМЕНОВАТЬ КОЛОНКИ
-- ============================================

-- Переименовать coach_id в profiles
ALTER TABLE profiles RENAME COLUMN coach_id TO coordinator_id;

-- Переименовать coach_id в invite_codes
ALTER TABLE invite_codes RENAME COLUMN coach_id TO coordinator_id;

-- Переименовать coach_id в coach_notes (перед переименованием таблицы)
ALTER TABLE coach_notes RENAME COLUMN coach_id TO coordinator_id;

-- ============================================
-- 3. ПЕРЕИМЕНОВАТЬ ТАБЛИЦУ
-- ============================================

ALTER TABLE coach_notes RENAME TO coordinator_notes;

-- ============================================
-- 4. СОЗДАТЬ НОВЫЕ ФУНКЦИИ
-- ============================================
-- ВАЖНО: Создаем новые функции ПЕРЕД обновлением политик,
-- чтобы они были доступны для использования в политиках

-- Создать новую функцию is_coordinator (может существовать параллельно со старой)
CREATE OR REPLACE FUNCTION is_coordinator(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role = 'coordinator'
  );
END;
$$;

COMMENT ON FUNCTION is_coordinator(UUID) IS 'Проверяет, является ли пользователь coordinator (без рекурсии RLS)';

-- Создать новую функцию is_client_coordinator с правильными именами параметров
CREATE OR REPLACE FUNCTION is_client_coordinator(client_id UUID, potential_coordinator_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = client_id
    AND profiles.coordinator_id = potential_coordinator_id
  );
END;
$$;

COMMENT ON FUNCTION is_client_coordinator(UUID, UUID) IS 'Проверяет, является ли пользователь координатором клиента (без рекурсии RLS)';

-- ============================================
-- 5. ОБНОВИТЬ ИНДЕКСЫ
-- ============================================

-- Переименовать индексы для profiles
ALTER INDEX IF EXISTS idx_profiles_coach_id RENAME TO idx_profiles_coordinator_id;

-- Переименовать индексы для coordinator_notes
ALTER INDEX IF EXISTS idx_coach_notes_coach_date RENAME TO idx_coordinator_notes_coordinator_date;
ALTER INDEX IF EXISTS idx_coach_notes_client_date RENAME TO idx_coordinator_notes_client_date;

-- Переименовать индексы для invite_codes
ALTER INDEX IF EXISTS idx_invite_codes_coach RENAME TO idx_invite_codes_coordinator;

-- ============================================
-- 6. ОБНОВИТЬ КОММЕНТАРИИ
-- ============================================

COMMENT ON COLUMN profiles.coordinator_id IS 'ID координатора (для клиентов)';
COMMENT ON TABLE coordinator_notes IS 'Заметки координатора для клиентов на конкретную дату';
COMMENT ON COLUMN coordinator_notes.client_id IS 'ID клиента, для которого оставлена заметка';
COMMENT ON COLUMN coordinator_notes.coordinator_id IS 'ID координатора, который оставил заметку';
COMMENT ON COLUMN coordinator_notes.date IS 'Дата, к которой относится заметка';
COMMENT ON COLUMN coordinator_notes.content IS 'Текст заметки от координатора';
COMMENT ON COLUMN invite_codes.coordinator_id IS 'ID координатора, создавшего код';

-- ============================================
-- 7. ОБНОВИТЬ RLS ПОЛИТИКИ
-- ============================================

-- Удалить старые политики для coordinator_notes
DROP POLICY IF EXISTS "Coaches can view notes for their clients" ON coordinator_notes;
DROP POLICY IF EXISTS "Coaches can insert notes for their clients" ON coordinator_notes;
DROP POLICY IF EXISTS "Coaches can update their own notes" ON coordinator_notes;
DROP POLICY IF EXISTS "Coaches can delete their own notes" ON coordinator_notes;
DROP POLICY IF EXISTS "Clients can view notes from their coach" ON coordinator_notes;

-- Создать новые политики для coordinator_notes
CREATE POLICY "Coordinators can view notes for their clients"
  ON coordinator_notes FOR SELECT
  USING (
    coordinator_id = auth.uid() OR
    is_super_admin(auth.uid())
  );

CREATE POLICY "Coordinators can insert notes for their clients"
  ON coordinator_notes FOR INSERT
  WITH CHECK (
    coordinator_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = client_id
      AND profiles.coordinator_id = auth.uid()
    )
  );

CREATE POLICY "Coordinators can update their own notes"
  ON coordinator_notes FOR UPDATE
  USING (coordinator_id = auth.uid())
  WITH CHECK (coordinator_id = auth.uid());

CREATE POLICY "Coordinators can delete their own notes"
  ON coordinator_notes FOR DELETE
  USING (coordinator_id = auth.uid());

CREATE POLICY "Clients can view notes from their coordinator"
  ON coordinator_notes FOR SELECT
  USING (
    client_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.coordinator_id = coordinator_notes.coordinator_id
    )
  );

-- Обновить политики для profiles (если есть упоминания coach)
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

-- Обновить политики для nutrition_targets
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

-- Обновить политики для daily_logs
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

-- Обновить политики для invite_codes
DROP POLICY IF EXISTS "Coaches can read their own invite codes" ON invite_codes;
CREATE POLICY "Coordinators can read their own invite codes"
ON invite_codes FOR SELECT
USING (auth.uid() = coordinator_id);

DROP POLICY IF EXISTS "Coaches can create their own invite codes" ON invite_codes;
CREATE POLICY "Coordinators can create their own invite codes"
ON invite_codes FOR INSERT
WITH CHECK (auth.uid() = coordinator_id);

DROP POLICY IF EXISTS "Coaches can update their own invite codes" ON invite_codes;
CREATE POLICY "Coordinators can update their own invite codes"
ON invite_codes FOR UPDATE
USING (auth.uid() = coordinator_id)
WITH CHECK (auth.uid() = coordinator_id);

DROP POLICY IF EXISTS "Coaches can delete their own invite codes" ON invite_codes;
CREATE POLICY "Coordinators can delete their own invite codes"
ON invite_codes FOR DELETE
USING (auth.uid() = coordinator_id);

-- Обновить политики для invite_code_usage
DROP POLICY IF EXISTS "Coaches can read usage of their invite codes" ON invite_code_usage;
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
-- 8. УДАЛИТЬ СТАРЫЕ ФУНКЦИИ
-- ============================================
-- ВАЖНО: Удаляем старые функции ПОСЛЕ обновления всех политик,
-- которые их использовали

-- Удалить старую функцию is_coach (теперь все политики используют is_coordinator)
DROP FUNCTION IF EXISTS is_coach(UUID);

-- Удалить старую функцию is_client_coach (теперь все политики используют is_client_coordinator)
DROP FUNCTION IF EXISTS is_client_coach(UUID, UUID);

-- ============================================
-- ГОТОВО!
-- ============================================

-- Миграция завершена. Все объекты БД переименованы с coach на coordinator.
