-- Migration: Индексы под внешние ключи и снятие дубликатов
-- Version: 086
-- Date: 2026-09-29
--
-- Две независимые части, обе про стоимость записи.
--
-- Мигратор выполняет каждую миграцию в одной транзакции, поэтому CONCURRENTLY
-- здесь недоступно. Затронутые таблицы небольшие (ссылки на вход, тикеты,
-- избранное), так что блокировка на время создания короткая.

-- ---------------------------------------------------------------------------
-- 1. Внешние ключи без индекса.
--
-- Postgres не индексирует ссылающуюся сторону сам. Без индекса удаление
-- родительской строки приводит к последовательному чтению всей дочерней
-- таблицы под блокировкой — на каждый внешний ключ, по которому его нет.
--
-- Все перечисленные ниже лежат на пути удаления аккаунта
-- (internal/modules/account/erasure.go), то есть выполняются вместе, в одной
-- транзакции, на каждое удаление.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_magic_links_user_id
  ON magic_links (user_id);

CREATE INDEX IF NOT EXISTS idx_ws_tickets_user_id
  ON ws_tickets (user_id);

CREATE INDEX IF NOT EXISTS idx_message_read_status_user
  ON message_read_status (user_id);

CREATE INDEX IF NOT EXISTS idx_weekly_plans_created_by
  ON weekly_plans (created_by);

CREATE INDEX IF NOT EXISTS idx_leads_handled_by
  ON leads (handled_by);

CREATE INDEX IF NOT EXISTS idx_support_messages_operator
  ON support_messages (operator_id);

-- food_items — самая большая таблица в схеме. Без этого индекса удаление
-- одной позиции из справочника читает user_favorite_foods целиком.
CREATE INDEX IF NOT EXISTS idx_user_favorite_foods_food
  ON user_favorite_foods (food_id);

CREATE INDEX IF NOT EXISTS idx_user_nutrient_preferences_nutrient
  ON user_nutrient_preferences (nutrient_id);

-- Следующие три колонки разрежены: заполнены только у записей, которые кто-то
-- завёл или закрыл за другого. Частичного индекса достаточно — проверка
-- внешнего ключа ищет `колонка = $1`, а это условие влечёт IS NOT NULL, так
-- что планировщик вправе его взять. Индекс при этом во столько же раз меньше,
-- во сколько колонка разрежена, и это решает судьбу food_entries: полный
-- индекс на самой горячей на запись таблице продукта стоил бы дороже, чем
-- экономит.
CREATE INDEX IF NOT EXISTS idx_food_entries_created_by
  ON food_entries (created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_conversations_user
  ON support_conversations (user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_conversations_closed_by
  ON support_conversations (closed_by) WHERE closed_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Индексы, которые ничего не добавляют.
--
-- Каждый из них либо дословно повторяет соседний, либо является его левым
-- префиксом — а префикс более широкого B-tree обслуживается этим широким.
-- Направление сортировки в определении роли не играет: B-tree читается в обе
-- стороны, поэтому (user_id, date) и (user_id, date DESC) — один и тот же
-- индекс с точки зрения планировщика.
--
-- Лишний индекс не ускоряет чтение, но его обязан обновить каждый INSERT,
-- UPDATE и DELETE. food_entries и water_logs — самые горячие на запись
-- таблицы продукта.
-- ---------------------------------------------------------------------------

-- Дословные повторы уникальных ограничений.
DROP INDEX IF EXISTS idx_users_email;                 -- = users_email_key
DROP INDEX IF EXISTS idx_refresh_tokens_token_hash;   -- = refresh_tokens_token_hash_key
DROP INDEX IF EXISTS idx_reset_tokens_token_hash;     -- = reset_tokens_token_hash_key
DROP INDEX IF EXISTS idx_barcode_cache_barcode;       -- = barcode_cache_barcode_key
DROP INDEX IF EXISTS idx_user_settings_user_id;       -- = user_settings_user_id_key
DROP INDEX IF EXISTS idx_daily_metrics_user_date;     -- = daily_metrics_user_id_date_key
DROP INDEX IF EXISTS idx_water_logs_user_date;        -- = water_logs_user_id_date_key
DROP INDEX IF EXISTS idx_weekly_reports_user_week;    -- = weekly_reports_user_id_week_start_key
DROP INDEX IF EXISTS idx_dct_user_date;               -- = uq_user_date

-- Миграция 043 завела второй индекс с тем же определением, что и у 031.
-- Остаётся тот, что назван в 043; если 043 когда-нибудь откатят, её down
-- удалит оставшийся, поэтому down этой миграции возвращает индекс из 031.
DROP INDEX IF EXISTS idx_articles_scheduled;          -- = idx_articles_status_scheduled_at

-- Левые префиксы более широких индексов.
DROP INDEX IF EXISTS idx_water_logs_user;                     -- ⊂ water_logs_user_id_date_key
DROP INDEX IF EXISTS idx_food_entries_user_date;              -- ⊂ idx_food_entries_user_date_meal
DROP INDEX IF EXISTS idx_task_completions_task_id;            -- ⊂ task_completions_task_id_completed_date_key
DROP INDEX IF EXISTS idx_user_favorite_foods_user_id;         -- ⊂ user_favorite_foods_user_id_food_id_key
DROP INDEX IF EXISTS idx_user_nutrient_preferences_user_id;   -- ⊂ user_nutrient_preferences_user_id_nutrient_id_key
DROP INDEX IF EXISTS idx_nutrient_norms_nutrient;             -- ⊂ nutrient_norms_nutrient_id_sex_min_age_key
DROP INDEX IF EXISTS idx_meal_templates_user_id;              -- ⊂ idx_meal_templates_meal_type
DROP INDEX IF EXISTS idx_curator_daily_snap_curator;          -- ⊂ curator_daily_snapshots_curator_id_date_key
DROP INDEX IF EXISTS idx_curator_weekly_snap_curator;         -- ⊂ curator_weekly_snapshots_curator_id_week_start_key

-- Полнотекстовые индексы только по name. Поиск еды ищет по выражению
-- name || ' ' || brand и к ним не обращается ни разу
-- (internal/modules/food-tracker/service.go). На food_items это GIN по самой
-- большой таблице схемы, который обновляется на каждую запись и не читается.
DROP INDEX IF EXISTS idx_food_items_name_fts;
DROP INDEX IF EXISTS idx_products_name;
