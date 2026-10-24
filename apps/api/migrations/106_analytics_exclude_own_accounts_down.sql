-- Rollback: 106_analytics_exclude_own_accounts
--
-- Колонку из SELECT * представления не убрать через CREATE OR REPLACE, поэтому
-- оба представления пересоздаются в редакции 088 — с тем же явным списком
-- колонок, что и в up, иначе звёздочка захватит колонки из 103.

DROP VIEW IF EXISTS live_analytics_events;
DROP VIEW IF EXISTS live_users;

ALTER TABLE users DROP COLUMN IF EXISTS exclude_from_analytics;

CREATE VIEW live_users AS
SELECT id, email, password, name, role, created_at, updated_at,
       password_changed_at, avatar_url, onboarding_completed, email_verified,
       deletion_requested_at, deleted_at, anonymized_at, is_system,
       files_purged_at, quiet_hours_start, quiet_hours_end,
       email_unsubscribed_at, token_version, pending_file_prefixes
FROM users
WHERE lower(btrim(email)) NOT LIKE '%@burcev.test'
  AND NOT (lower(btrim(email)) LIKE 'e2e-%' AND lower(btrim(email)) LIKE '%@burcev.team')
  AND role = 'client'
  AND NOT is_system;

COMMENT ON VIEW live_users IS
    'Клиенты без служебных учёток прогонов. Правило учёток — testaccounts.IsTest; сотрудники отсекаются по роли.';

CREATE VIEW live_analytics_events AS
SELECT e.*
FROM analytics_events e
WHERE EXISTS (SELECT 1 FROM live_users u WHERE u.id = e.user_id)
   OR (e.user_id IS NULL
       AND NOT EXISTS (
           SELECT 1
           FROM analytics_identities i
           WHERE i.visitor_id = e.visitor_id
             AND NOT EXISTS (SELECT 1 FROM live_users u WHERE u.id = i.user_id)));

COMMENT ON VIEW live_analytics_events IS
    'События клиентов плюс анонимная часть воронки, кроме браузеров сотрудников и прогонов.';
