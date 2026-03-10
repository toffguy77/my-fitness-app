-- Migration: Extend tasks with type/recurrence and create task_completions
-- Version: 039
-- Date: 2026-03-10

-- Add type column (nutrition, workout, habit, measurement)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'habit';
ALTER TABLE tasks ADD CONSTRAINT chk_task_type
  CHECK (type IN ('nutrition', 'workout', 'habit', 'measurement'));

-- Add recurrence columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20) NOT NULL DEFAULT 'once';
ALTER TABLE tasks ADD CONSTRAINT chk_task_recurrence
  CHECK (recurrence IN ('once', 'daily', 'weekly'));

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_days INTEGER[];

-- Task completions for tracking recurring task execution
CREATE TABLE IF NOT EXISTS task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, completed_date)
);

CREATE INDEX IF NOT EXISTS idx_task_completions_task_id ON task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(completed_date);
