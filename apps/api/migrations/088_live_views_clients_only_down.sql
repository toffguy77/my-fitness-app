-- Rollback: 088_live_views_clients_only
--
-- Возвращает определения 081: служебные учётки отсекаются, сотрудники нет.

CREATE OR REPLACE VIEW live_users AS
SELECT *
FROM users
WHERE lower(btrim(email)) NOT LIKE '%@burcev.test'
  AND NOT (lower(btrim(email)) LIKE 'e2e-%' AND lower(btrim(email)) LIKE '%@burcev.team');

COMMENT ON VIEW live_users IS
    'Пользователи без служебных учёток прогонов. Правило — testaccounts.IsTest.';

CREATE OR REPLACE VIEW live_analytics_events AS
SELECT e.*
FROM analytics_events e
WHERE e.user_id IS NULL
   OR EXISTS (SELECT 1 FROM live_users u WHERE u.id = e.user_id);

COMMENT ON VIEW live_analytics_events IS
    'События живых пользователей плюс вся анонимная часть воронки.';
