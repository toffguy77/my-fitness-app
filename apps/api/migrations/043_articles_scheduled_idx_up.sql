CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_status_scheduled_at
    ON articles (status, scheduled_at)
    WHERE status = 'scheduled';
