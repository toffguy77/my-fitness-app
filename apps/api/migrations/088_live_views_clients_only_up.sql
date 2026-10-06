-- Migration: Живые пользователи — только клиенты
-- Version: 088
--
-- 081 отсекала служебные учётки прогонов, но не сотрудников. Кураторы и
-- администратор входят в продукт каждый день, открывают посадочную, чат
-- поддержки — и всё это считалось поведением клиентов. За 2026-09-22..10-05
-- «живые» входы наполовину оказались кураторскими, а клиентов, которые хоть
-- что-то сделали, было двое.
--
-- Заодно уходит заглушка «Удалённый пользователь» из 048 (is_system): у неё
-- роль клиента, и она числилась живым клиентом.
--
-- Отсечь сотрудников по адресу нельзя: у кураторов обычные почты (yandex.ru,
-- bk.ru), и граница проходит по роли, а не по домену.
--
-- Анонимная часть тоже чистится: браузер, который потом вошёл под сотрудником
-- или под учёткой прогона, — не посетитель. Связь берётся из
-- analytics_identities. Аноним, так и не связанный ни с кем, остаётся: в нём
-- почти вся воронка.

CREATE OR REPLACE VIEW live_users AS
SELECT *
FROM users
WHERE lower(btrim(email)) NOT LIKE '%@burcev.test'
  AND NOT (lower(btrim(email)) LIKE 'e2e-%' AND lower(btrim(email)) LIKE '%@burcev.team')
  AND role = 'client'
  AND NOT is_system;

COMMENT ON VIEW live_users IS
    'Клиенты без служебных учёток прогонов. Правило учёток — testaccounts.IsTest; сотрудники отсекаются по роли.';

CREATE OR REPLACE VIEW live_analytics_events AS
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
