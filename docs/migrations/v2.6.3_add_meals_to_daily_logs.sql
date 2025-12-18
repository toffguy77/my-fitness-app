-- Migration: v2.6.3_add_meals_to_daily_logs
-- Description: Добавление поля meals (JSONB) для хранения отдельных приемов пищи в daily_logs
-- Dependencies: v2.6.2_add_phone_to_profiles.sql
-- Date: 2024-12-12
-- 
-- meals будет JSONB массив объектов с информацией о каждом приеме пищи

ALTER TABLE daily_logs
ADD COLUMN IF NOT EXISTS meals JSONB DEFAULT '[]'::jsonb;

-- Создаем индекс для быстрого поиска по meals (GIN индекс для JSONB)
CREATE INDEX IF NOT EXISTS idx_daily_logs_meals ON daily_logs USING GIN (meals);

-- Комментарий к полю
COMMENT ON COLUMN daily_logs.meals IS 'Массив приемов пищи за день. Формат: [{"id": "uuid", "title": "string", "weight": number, "calories": number, "protein": number, "fats": number, "carbs": number, "mealDate": "YYYY-MM-DD", "createdAt": "timestamp"}]';

