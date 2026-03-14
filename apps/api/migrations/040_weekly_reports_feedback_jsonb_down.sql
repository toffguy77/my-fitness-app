ALTER TABLE weekly_reports
  ALTER COLUMN curator_feedback TYPE TEXT USING
    CASE
      WHEN curator_feedback IS NULL THEN NULL
      ELSE curator_feedback->>'summary'
    END;

ALTER TABLE weekly_plans DROP COLUMN IF EXISTS comment;
