-- Добавление поля weight (вес тела) в таблицу daily_logs

ALTER TABLE daily_logs 
ADD COLUMN IF NOT EXISTS weight DECIMAL(5,2);

-- Комментарий к полю
COMMENT ON COLUMN daily_logs.weight IS 'Вес тела клиента в килограммах';

-- Индекс для быстрого поиска по весу (опционально)
CREATE INDEX IF NOT EXISTS idx_daily_logs_weight ON daily_logs(weight) WHERE weight IS NOT NULL;

