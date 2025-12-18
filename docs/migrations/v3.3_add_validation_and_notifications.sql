-- Migration: v3.3_add_validation_and_notifications
-- Description: Добавление валидации данных о питании на уровне БД и подготовка к системе уведомлений
-- Dependencies: v3.2_add_feedback_loop.sql
-- Date: 2025-01-XX

-- 1. Функция валидации соответствия калорий макронутриентам
-- Формула: белки*4 + жиры*9 + углеводы*4 ≈ калории
-- Допускаем погрешность 50 ккал
CREATE OR REPLACE FUNCTION validate_calories_match_macros(
  calories NUMERIC,
  protein NUMERIC,
  fats NUMERIC,
  carbs NUMERIC
) RETURNS BOOLEAN AS $$
BEGIN
  -- Расчет: белки*4 + жиры*9 + углеводы*4 ≈ калории
  -- Допускаем погрешность 50 ккал
  RETURN ABS((protein * 4 + fats * 9 + carbs * 4) - calories) <= 50;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_calories_match_macros IS 'Проверяет соответствие калорий макронутриентам с допуском 50 ккал';

-- 2. Функция валидации максимальных значений
CREATE OR REPLACE FUNCTION validate_nutrition_limits(
  calories NUMERIC,
  protein NUMERIC,
  fats NUMERIC,
  carbs NUMERIC
) RETURNS BOOLEAN AS $$
BEGIN
  -- Проверка максимальных значений
  IF calories < 0 OR calories > 10000 THEN
    RETURN FALSE;
  END IF;
  
  IF protein < 0 OR protein > 1000 THEN
    RETURN FALSE;
  END IF;
  
  IF fats < 0 OR fats > 500 THEN
    RETURN FALSE;
  END IF;
  
  IF carbs < 0 OR carbs > 1500 THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_nutrition_limits IS 'Проверяет максимальные значения КБЖУ';

-- 3. Триггер для валидации при сохранении daily_logs
CREATE OR REPLACE FUNCTION check_nutrition_validation()
RETURNS TRIGGER AS $$
BEGIN
  -- Проверка максимальных значений
  IF NOT validate_nutrition_limits(
    NEW.actual_calories,
    NEW.actual_protein,
    NEW.actual_fats,
    NEW.actual_carbs
  ) THEN
    RAISE EXCEPTION 'Значения КБЖУ выходят за допустимые пределы. Калории: 0-10000, Белки: 0-1000г, Жиры: 0-500г, Углеводы: 0-1500г';
  END IF;
  
  -- Проверка соответствия калорий макронутриентам (только если есть данные)
  -- Если все значения равны 0, пропускаем проверку (пустой день)
  IF NEW.actual_calories > 0 OR NEW.actual_protein > 0 OR NEW.actual_fats > 0 OR NEW.actual_carbs > 0 THEN
    IF NOT validate_calories_match_macros(
      NEW.actual_calories,
      NEW.actual_protein,
      NEW.actual_fats,
      NEW.actual_carbs
    ) THEN
      RAISE WARNING 'Калории не соответствуют макронутриентам. Расчетные: %, введенные: %', 
        (NEW.actual_protein * 4 + NEW.actual_fats * 9 + NEW.actual_carbs * 4),
        NEW.actual_calories;
      -- Не блокируем сохранение, только предупреждаем
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_nutrition_validation IS 'Триггер для валидации данных о питании при сохранении';

-- Создаем триггер (если еще не существует)
DROP TRIGGER IF EXISTS nutrition_validation_trigger ON daily_logs;
CREATE TRIGGER nutrition_validation_trigger
BEFORE INSERT OR UPDATE ON daily_logs
FOR EACH ROW
EXECUTE FUNCTION check_nutrition_validation();

-- 4. Индексы для производительности (если еще не существуют)
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_is_completed ON daily_logs(user_id, is_completed, date DESC);

-- 5. Функция для проверки истечения подписок (для будущего использования в Edge Functions)
CREATE OR REPLACE FUNCTION get_expired_subscriptions()
RETURNS TABLE (
  id UUID,
  email TEXT,
  subscription_end_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.subscription_end_date
  FROM profiles p
  WHERE p.subscription_status = 'active'
    AND p.subscription_tier = 'premium'
    AND p.subscription_end_date IS NOT NULL
    AND p.subscription_end_date < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_expired_subscriptions IS 'Возвращает список подписок с истекшей датой окончания';

-- 6. Функция для проверки подписок, истекающих через N дней
CREATE OR REPLACE FUNCTION get_expiring_subscriptions(days_ahead INTEGER DEFAULT 3)
RETURNS TABLE (
  id UUID,
  email TEXT,
  subscription_end_date TIMESTAMPTZ,
  days_remaining INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.subscription_end_date,
    EXTRACT(DAY FROM (p.subscription_end_date - NOW()))::INTEGER as days_remaining
  FROM profiles p
  WHERE p.subscription_status = 'active'
    AND p.subscription_tier = 'premium'
    AND p.subscription_end_date IS NOT NULL
    AND p.subscription_end_date >= NOW()
    AND p.subscription_end_date <= NOW() + (days_ahead || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_expiring_subscriptions IS 'Возвращает список подписок, истекающих в течение указанного количества дней';

-- 7. Функция для деактивации истекших подписок
CREATE OR REPLACE FUNCTION deactivate_expired_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE profiles
  SET 
    subscription_status = 'cancelled',
    updated_at = NOW()
  WHERE subscription_status = 'active'
    AND subscription_tier = 'premium'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW();
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION deactivate_expired_subscriptions IS 'Деактивирует все истекшие Premium подписки. Возвращает количество обновленных записей';

