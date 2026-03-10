-- Migration: Curator analytics snapshot and benchmark tables
-- Version: 041
-- Date: 2026-03-10

CREATE TABLE IF NOT EXISTS curator_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_clients INTEGER NOT NULL DEFAULT 0,
  attention_clients INTEGER NOT NULL DEFAULT 0,
  avg_kbzhu_percent NUMERIC(5,1) NOT NULL DEFAULT 0,
  total_unread INTEGER NOT NULL DEFAULT 0,
  active_tasks INTEGER NOT NULL DEFAULT 0,
  overdue_tasks INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  avg_client_streak NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(curator_id, date)
);

CREATE INDEX IF NOT EXISTS idx_curator_daily_snap_curator ON curator_daily_snapshots(curator_id);
CREATE INDEX IF NOT EXISTS idx_curator_daily_snap_date ON curator_daily_snapshots(date);

CREATE TABLE IF NOT EXISTS curator_weekly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  avg_kbzhu_percent NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_response_time_hours NUMERIC(5,1) NOT NULL DEFAULT 0,
  clients_with_feedback INTEGER NOT NULL DEFAULT 0,
  clients_total INTEGER NOT NULL DEFAULT 0,
  task_completion_rate NUMERIC(5,1) NOT NULL DEFAULT 0,
  clients_on_track INTEGER NOT NULL DEFAULT 0,
  clients_off_track INTEGER NOT NULL DEFAULT 0,
  avg_client_streak NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(curator_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_curator_weekly_snap_curator ON curator_weekly_snapshots(curator_id);

CREATE TABLE IF NOT EXISTS platform_weekly_benchmarks (
  week_start DATE PRIMARY KEY,
  avg_kbzhu_percent NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_response_time_hours NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_task_completion_rate NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_feedback_rate NUMERIC(5,1) NOT NULL DEFAULT 0,
  avg_client_streak NUMERIC(5,1) NOT NULL DEFAULT 0,
  curator_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
