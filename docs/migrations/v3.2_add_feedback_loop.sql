-- Migration: v3.2_add_feedback_loop
-- Description: Добавление Feedback Loop функционала (Check-in и Coach Notes)
-- Dependencies: v3.1_add_onboarding_fields.sql
-- Date: 2024-12-17

-- 1. Добавляем поле completed_at в daily_logs (если еще нет is_completed, добавим и его)
ALTER TABLE daily_logs
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN daily_logs.completed_at IS 'Время завершения дня (Check-in). Устанавливается при нажатии кнопки "Завершить день".';

-- 2. Создаем таблицу coach_notes для заметок тренера
CREATE TABLE IF NOT EXISTS coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, coach_id, date)
);

COMMENT ON TABLE coach_notes IS 'Заметки тренера для клиентов на конкретную дату';
COMMENT ON COLUMN coach_notes.client_id IS 'ID клиента, для которого оставлена заметка';
COMMENT ON COLUMN coach_notes.coach_id IS 'ID тренера, который оставил заметку';
COMMENT ON COLUMN coach_notes.date IS 'Дата, к которой относится заметка';
COMMENT ON COLUMN coach_notes.content IS 'Текст заметки от тренера';

-- 3. Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_coach_notes_client_date ON coach_notes(client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_coach_notes_coach_date ON coach_notes(coach_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_completed_at ON daily_logs(user_id, is_completed, completed_at DESC);

-- 4. RLS политики для coach_notes
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;

-- Тренер может читать и писать заметки для своих клиентов
CREATE POLICY "Coaches can view notes for their clients"
  ON coach_notes FOR SELECT
  USING (
    coach_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Coaches can insert notes for their clients"
  ON coach_notes FOR INSERT
  WITH CHECK (
    coach_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = client_id
      AND profiles.coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update their own notes"
  ON coach_notes FOR UPDATE
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can delete their own notes"
  ON coach_notes FOR DELETE
  USING (coach_id = auth.uid());

-- Клиент может читать заметки от своего тренера
CREATE POLICY "Clients can view notes from their coach"
  ON coach_notes FOR SELECT
  USING (
    client_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.coach_id = coach_notes.coach_id
    )
  );

