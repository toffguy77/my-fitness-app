-- Migration: v2.6.4_add_weight_tracking
-- Description: Добавление поля weight (вес тела) в таблицу daily_logs для отслеживания веса
-- Dependencies: v2.6.3_add_meals_to_daily_logs.sql
-- Date: 2024-12-15

ALTER TABLE daily_logs 
ADD COLUMN IF NOT EXISTS weight DECIMAL(5,2);

COMMENT ON COLUMN daily_logs.weight IS 'Вес тела клиента в килограммах на дату лога';

-- Индекс для быстрого поиска по весу (опционально, только для не-NULL значений)
CREATE INDEX IF NOT EXISTS idx_daily_logs_weight ON daily_logs(weight) WHERE weight IS NOT NULL;

