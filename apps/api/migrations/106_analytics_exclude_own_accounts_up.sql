-- Migration: Свои учётки клиента вне аналитики
-- Version: 106
--
-- 088 отсекла сотрудников по роли, но у владельца продукта и разработчика есть
-- личные учётки с ролью client: ими проверяют продукт, и по роли их не
-- отличить. За 2026-10-06..19 они дали 22 из 24 записей еды и почти все входы
-- «клиентов» — живого использования за ними почти не было.
--
-- Признак ставится явно, по учётке. Учётки отмечены по md5 нормализованного
-- адреса, а не по id: id на dev и проде разные, а адресов в репозитории быть не
-- должно. На стенде, где такого адреса нет, UPDATE ничего не делает.

ALTER TABLE users ADD COLUMN IF NOT EXISTS exclude_from_analytics boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.exclude_from_analytics IS
    'Своя учётка с ролью client (владелец, разработчик): не попадает в live_users.';

UPDATE users
SET exclude_from_analytics = true
WHERE md5(lower(btrim(email))) IN (
    'd84eab7a0f48d713cab5ea387d9cabb6',
    '64d0bc4b45f773ad7f40f35606295102'
);

-- Колонки перечислены, а не SELECT *: звёздочка при пересоздании захватила бы
-- всё, что добавили к users после 088 (push_show_message_text из 103), и откат
-- 103 перестал бы проходить — представление держало бы его колонку. Список —
-- ровно столбцы представления 088.
CREATE OR REPLACE VIEW live_users AS
SELECT id, email, password, name, role, created_at, updated_at,
       password_changed_at, avatar_url, onboarding_completed, email_verified,
       deletion_requested_at, deleted_at, anonymized_at, is_system,
       files_purged_at, quiet_hours_start, quiet_hours_end,
       email_unsubscribed_at, token_version, pending_file_prefixes
FROM users
WHERE lower(btrim(email)) NOT LIKE '%@burcev.test'
  AND NOT (lower(btrim(email)) LIKE 'e2e-%' AND lower(btrim(email)) LIKE '%@burcev.team')
  AND role = 'client'
  AND NOT is_system
  AND NOT exclude_from_analytics;

COMMENT ON VIEW live_users IS
    'Клиенты без служебных учёток прогонов и своих учёток. Правило учёток — testaccounts.IsTest; сотрудники отсекаются по роли, свои — по exclude_from_analytics.';
