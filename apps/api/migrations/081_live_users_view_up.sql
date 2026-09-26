-- Migration: Живые пользователи и их события
-- Version: 081
--
-- На проде живут постоянные учётные записи прогонов E2E, и их видно во всех
-- подсчётах. 2026-09-24 это выглядело так: за неделю «пять новых аккаунтов»,
-- из которых живых — ноль. Отчёт, показывающий рост в пять раз на ровном
-- месте, хуже отсутствующего: на него сошлются.
--
-- Правило совпадает с internal/shared/testaccounts.IsTest и обязано с ним
-- совпадать впредь — за этим следит TestLiveUsersViewMatchesIsTest. Держать
-- его здесь нужно потому, что запросы к базе пишут не только из Go: пока
-- условие переписывали в каждом отчёте руками, забыть его было делом времени.
--
-- Представления, а не колонка `is_test`: признак вычисляется из адреса, и
-- хранить его отдельно значит завести вторую правду, которая разойдётся с
-- первой при первом же переименовании домена.

CREATE OR REPLACE VIEW live_users AS
SELECT *
FROM users
WHERE lower(btrim(email)) NOT LIKE '%@burcev.test'
  AND NOT (lower(btrim(email)) LIKE 'e2e-%' AND lower(btrim(email)) LIKE '%@burcev.team');

COMMENT ON VIEW live_users IS
    'Пользователи без служебных учёток прогонов. Правило — testaccounts.IsTest.';

-- События, у которых либо нет пользователя (аноним до регистрации), либо он
-- живой. Анонимную часть воронки терять нельзя: именно в ней происходит почти
-- всё, что интересно.
CREATE OR REPLACE VIEW live_analytics_events AS
SELECT e.*
FROM analytics_events e
WHERE e.user_id IS NULL
   OR EXISTS (SELECT 1 FROM live_users u WHERE u.id = e.user_id);

COMMENT ON VIEW live_analytics_events IS
    'События живых пользователей плюс вся анонимная часть воронки.';
