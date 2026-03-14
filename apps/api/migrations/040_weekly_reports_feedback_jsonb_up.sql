-- Migration: Convert curator_feedback from TEXT to JSONB
-- Version: 040
-- Date: 2026-03-10

ALTER TABLE weekly_reports
  ALTER COLUMN curator_feedback TYPE JSONB USING
    CASE
      WHEN curator_feedback IS NULL THEN NULL
      WHEN curator_feedback = '' THEN NULL
      ELSE jsonb_build_object('summary', curator_feedback)
    END;

-- Add comment column to weekly_plans for curator notes
ALTER TABLE weekly_plans ADD COLUMN IF NOT EXISTS comment TEXT;
