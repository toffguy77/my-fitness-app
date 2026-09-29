-- Rollback: 086_index_hygiene
--
-- Возвращает снятые индексы и убирает добавленные. Определения совпадают с
-- теми, что были до миграции, включая направление сортировки и частичные
-- условия — иначе откат оставил бы схему похожей, но не той же.

-- 1. Снять индексы под внешние ключи.
DROP INDEX IF EXISTS idx_magic_links_user_id;
DROP INDEX IF EXISTS idx_ws_tickets_user_id;
DROP INDEX IF EXISTS idx_message_read_status_user;
DROP INDEX IF EXISTS idx_weekly_plans_created_by;
DROP INDEX IF EXISTS idx_leads_handled_by;
DROP INDEX IF EXISTS idx_support_messages_operator;
DROP INDEX IF EXISTS idx_user_favorite_foods_food;
DROP INDEX IF EXISTS idx_user_nutrient_preferences_nutrient;
DROP INDEX IF EXISTS idx_food_entries_created_by;
DROP INDEX IF EXISTS idx_support_conversations_user;
DROP INDEX IF EXISTS idx_support_conversations_closed_by;

-- 2. Вернуть дубликаты.
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_token_hash ON reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_barcode_cache_barcode ON barcode_cache (barcode);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_user_date ON daily_metrics (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week ON weekly_reports (user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_dct_user_date ON daily_calculated_targets (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_articles_scheduled ON articles (status, scheduled_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_water_logs_user ON water_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_food_entries_user_date ON food_entries (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_task_completions_task_id ON task_completions (task_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_foods_user_id ON user_favorite_foods (user_id);
CREATE INDEX IF NOT EXISTS idx_user_nutrient_preferences_user_id ON user_nutrient_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_nutrient_norms_nutrient ON nutrient_norms (nutrient_id);
CREATE INDEX IF NOT EXISTS idx_meal_templates_user_id ON meal_templates (user_id);
CREATE INDEX IF NOT EXISTS idx_curator_daily_snap_curator ON curator_daily_snapshots (curator_id);
CREATE INDEX IF NOT EXISTS idx_curator_weekly_snap_curator ON curator_weekly_snapshots (curator_id);

CREATE INDEX IF NOT EXISTS idx_food_items_name_fts
  ON food_items USING gin (to_tsvector('russian', name));
CREATE INDEX IF NOT EXISTS idx_products_name
  ON products USING gin (to_tsvector('russian', name));
