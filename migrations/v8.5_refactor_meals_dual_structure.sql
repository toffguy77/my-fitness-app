-- Migration: v8.5_refactor_meals_dual_structure
-- Description: Рефакторинг структуры meals: использование двух вложенных объектов (per100 и totals)
--              с автоматической синхронизацией через триггеры БД
-- Dependencies: setup_database.sql
-- Date: 2025-01-XX

-- ============================================
-- 1. ФУНКЦИИ ДЛЯ РАБОТЫ СО СТРУКТУРОЙ MEALS
-- ============================================

-- Функция нормализации структуры meal: преобразует старую структуру в новую
-- Обрабатывает все варианты старых данных для обратной совместимости
CREATE OR REPLACE FUNCTION normalize_meal_structure(meal JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized_meal JSONB;
  weight_val NUMERIC;
  calories_per100 NUMERIC;
  protein_per100 NUMERIC;
  fats_per100 NUMERIC;
  carbs_per100 NUMERIC;
  calories_total NUMERIC;
  protein_total NUMERIC;
  fats_total NUMERIC;
  carbs_total NUMERIC;
BEGIN
  -- Извлекаем вес
  weight_val := COALESCE((meal->>'weight')::NUMERIC, 0);

  -- Проверяем, есть ли уже новая структура (per100 и totals)
  IF meal ? 'per100' AND meal ? 'totals' THEN
    -- Уже нормализованная структура, возвращаем как есть
    RETURN meal;
  END IF;

  -- Извлекаем значения на 100г (старая структура: caloriesPer100, proteinPer100 и т.д.)
  calories_per100 := COALESCE((meal->>'caloriesPer100')::NUMERIC, 0);
  protein_per100 := COALESCE((meal->>'proteinPer100')::NUMERIC, 0);
  fats_per100 := COALESCE((meal->>'fatsPer100')::NUMERIC, 0);
  carbs_per100 := COALESCE((meal->>'carbsPer100')::NUMERIC, 0);

  -- Извлекаем итоговые значения (старая структура: calories, protein и т.д.)
  calories_total := COALESCE((meal->>'calories')::NUMERIC, 0);
  protein_total := COALESCE((meal->>'protein')::NUMERIC, 0);
  fats_total := COALESCE((meal->>'fats')::NUMERIC, 0);
  carbs_total := COALESCE((meal->>'carbs')::NUMERIC, 0);

  -- Если есть значения на 100г, используем их как источник истины
  IF calories_per100 > 0 OR protein_per100 > 0 OR fats_per100 > 0 OR carbs_per100 > 0 THEN
    -- Вычисляем totals из per100 и weight
    calories_total := CASE
      WHEN weight_val > 0 AND calories_per100 > 0 THEN ROUND((calories_per100 * weight_val) / 100)
      ELSE calories_total
    END;
    protein_total := CASE
      WHEN weight_val > 0 AND protein_per100 > 0 THEN ROUND((protein_per100 * weight_val) / 100)
      ELSE protein_total
    END;
    fats_total := CASE
      WHEN weight_val > 0 AND fats_per100 > 0 THEN ROUND((fats_per100 * weight_val) / 100)
      ELSE fats_total
    END;
    carbs_total := CASE
      WHEN weight_val > 0 AND carbs_per100 > 0 THEN ROUND((carbs_per100 * weight_val) / 100)
      ELSE carbs_total
    END;
  -- Если значений на 100г нет, но есть итоговые значения и вес, вычисляем per100
  ELSIF weight_val > 0 AND (calories_total > 0 OR protein_total > 0 OR fats_total > 0 OR carbs_total > 0) THEN
    calories_per100 := CASE
      WHEN calories_total > 0 THEN ROUND((calories_total * 100) / weight_val)
      ELSE 0
    END;
    protein_per100 := CASE
      WHEN protein_total > 0 THEN ROUND((protein_total * 100) / weight_val)
      ELSE 0
    END;
    fats_per100 := CASE
      WHEN fats_total > 0 THEN ROUND((fats_total * 100) / weight_val)
      ELSE 0
    END;
    carbs_per100 := CASE
      WHEN carbs_total > 0 THEN ROUND((carbs_total * 100) / weight_val)
      ELSE 0
    END;
  END IF;

  -- Создаем нормализованную структуру
  normalized_meal := meal || jsonb_build_object(
    'per100', jsonb_build_object(
      'calories', calories_per100,
      'protein', protein_per100,
      'fats', fats_per100,
      'carbs', carbs_per100
    ),
    'totals', jsonb_build_object(
      'calories', calories_total,
      'protein', protein_total,
      'fats', fats_total,
      'carbs', carbs_total
    )
  );

  -- Удаляем старые поля, если они есть
  normalized_meal := normalized_meal - 'caloriesPer100' - 'proteinPer100' - 'fatsPer100' - 'carbsPer100';
  normalized_meal := normalized_meal - 'calories' - 'protein' - 'fats' - 'carbs';

  RETURN normalized_meal;
END;
$$;

COMMENT ON FUNCTION normalize_meal_structure(JSONB) IS 'Нормализует структуру meal: преобразует старую структуру (плоские поля) в новую (per100 + totals)';

-- Функция пересчета totals из per100 и weight
CREATE OR REPLACE FUNCTION recalc_meal_totals(meal JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  weight_val NUMERIC;
  per100_obj JSONB;
  totals_obj JSONB;
BEGIN
  -- Извлекаем вес и объект per100
  weight_val := COALESCE((meal->>'weight')::NUMERIC, 0);
  per100_obj := meal->'per100';

  -- Если нет per100 или веса, возвращаем meal как есть
  IF per100_obj IS NULL OR weight_val <= 0 THEN
    RETURN meal;
  END IF;

  -- Вычисляем totals из per100 и weight
  totals_obj := jsonb_build_object(
    'calories', CASE
      WHEN (per100_obj->>'calories')::NUMERIC > 0 THEN ROUND(((per100_obj->>'calories')::NUMERIC * weight_val) / 100)
      ELSE 0
    END,
    'protein', CASE
      WHEN (per100_obj->>'protein')::NUMERIC > 0 THEN ROUND(((per100_obj->>'protein')::NUMERIC * weight_val) / 100)
      ELSE 0
    END,
    'fats', CASE
      WHEN (per100_obj->>'fats')::NUMERIC > 0 THEN ROUND(((per100_obj->>'fats')::NUMERIC * weight_val) / 100)
      ELSE 0
    END,
    'carbs', CASE
      WHEN (per100_obj->>'carbs')::NUMERIC > 0 THEN ROUND(((per100_obj->>'carbs')::NUMERIC * weight_val) / 100)
      ELSE 0
    END
  );

  -- Обновляем totals в meal
  RETURN meal || jsonb_build_object('totals', totals_obj);
END;
$$;

COMMENT ON FUNCTION recalc_meal_totals(JSONB) IS 'Пересчитывает totals из per100 и weight';

-- Функция пересчета per100 из totals и weight
CREATE OR REPLACE FUNCTION recalc_meal_per100(meal JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  weight_val NUMERIC;
  totals_obj JSONB;
  per100_obj JSONB;
BEGIN
  -- Извлекаем вес и объект totals
  weight_val := COALESCE((meal->>'weight')::NUMERIC, 0);
  totals_obj := meal->'totals';

  -- Если нет totals или веса, возвращаем meal как есть
  IF totals_obj IS NULL OR weight_val <= 0 THEN
    RETURN meal;
  END IF;

  -- Вычисляем per100 из totals и weight
  per100_obj := jsonb_build_object(
    'calories', CASE
      WHEN (totals_obj->>'calories')::NUMERIC > 0 THEN ROUND(((totals_obj->>'calories')::NUMERIC * 100) / weight_val)
      ELSE 0
    END,
    'protein', CASE
      WHEN (totals_obj->>'protein')::NUMERIC > 0 THEN ROUND(((totals_obj->>'protein')::NUMERIC * 100) / weight_val)
      ELSE 0
    END,
    'fats', CASE
      WHEN (totals_obj->>'fats')::NUMERIC > 0 THEN ROUND(((totals_obj->>'fats')::NUMERIC * 100) / weight_val)
      ELSE 0
    END,
    'carbs', CASE
      WHEN (totals_obj->>'carbs')::NUMERIC > 0 THEN ROUND(((totals_obj->>'carbs')::NUMERIC * 100) / weight_val)
      ELSE 0
    END
  );

  -- Обновляем per100 в meal
  RETURN meal || jsonb_build_object('per100', per100_obj);
END;
$$;

COMMENT ON FUNCTION recalc_meal_per100(JSONB) IS 'Пересчитывает per100 из totals и weight';

-- ============================================
-- 2. ТРИГГЕР ДЛЯ АВТОМАТИЧЕСКОЙ СИНХРОНИЗАЦИИ
-- ============================================

-- Функция триггера для синхронизации meals
CREATE OR REPLACE FUNCTION sync_meal_totals_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  meals_array JSONB;
  normalized_meals JSONB := '[]'::jsonb;
  meal JSONB;
  i INT;
BEGIN
  -- Проверяем, есть ли meals
  IF NEW.meals IS NULL OR jsonb_typeof(NEW.meals) != 'array' THEN
    RETURN NEW;
  END IF;

  meals_array := NEW.meals;

  -- Обрабатываем каждый meal в массиве
  FOR i IN 0..jsonb_array_length(meals_array) - 1 LOOP
    meal := meals_array->i;

    -- Нормализуем структуру meal (преобразует старую структуру в новую)
    meal := normalize_meal_structure(meal);

    -- Если изменен per100 или weight, пересчитываем totals
    IF meal ? 'per100' AND meal ? 'weight' THEN
      meal := recalc_meal_totals(meal);
    -- Если изменен totals (и нет per100), пересчитываем per100
    ELSIF meal ? 'totals' AND NOT (meal ? 'per100') THEN
      meal := recalc_meal_per100(meal);
    END IF;

    -- Добавляем нормализованный meal в массив
    normalized_meals := normalized_meals || jsonb_build_array(meal);
  END LOOP;

  -- Обновляем meals в NEW
  NEW.meals := normalized_meals;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_meal_totals_trigger() IS 'Триггер для автоматической синхронизации структуры meals: нормализует структуру и пересчитывает totals/per100';

-- Создаем триггер
DROP TRIGGER IF EXISTS sync_meal_totals_trigger ON daily_logs;
CREATE TRIGGER sync_meal_totals_trigger
BEFORE INSERT OR UPDATE ON daily_logs
FOR EACH ROW
WHEN (NEW.meals IS NOT NULL)
EXECUTE FUNCTION sync_meal_totals_trigger();

COMMENT ON TRIGGER sync_meal_totals_trigger ON daily_logs IS 'Автоматически нормализует структуру meals и синхронизирует per100 и totals при INSERT/UPDATE';

-- ============================================
-- 3. МИГРАЦИЯ СУЩЕСТВУЮЩИХ ДАННЫХ
-- ============================================

-- Временно отключаем триггер валидации для миграции данных
ALTER TABLE daily_logs DISABLE TRIGGER nutrition_validation_trigger;

-- Обновляем все существующие meals в daily_logs
-- Используем CTE для нормализации meals, затем обновляем actual_* значения
WITH normalized_data AS (
  SELECT
    id,
    (
      SELECT jsonb_agg(normalize_meal_structure(meal))
      FROM jsonb_array_elements(meals) AS meal
    ) AS normalized_meals
  FROM daily_logs
  WHERE meals IS NOT NULL
    AND jsonb_typeof(meals) = 'array'
    AND jsonb_array_length(meals) > 0
)
UPDATE daily_logs dl
SET
  meals = nd.normalized_meals,
  -- Пересчитываем actual_* значения из новых totals в meals
  actual_calories = COALESCE((
    SELECT SUM((meal->'totals'->>'calories')::INTEGER)
    FROM jsonb_array_elements(nd.normalized_meals) AS meal
    WHERE meal->'totals'->>'calories' IS NOT NULL
      AND (meal->'totals'->>'calories')::INTEGER > 0
  ), 0),
  actual_protein = COALESCE((
    SELECT SUM((meal->'totals'->>'protein')::INTEGER)
    FROM jsonb_array_elements(nd.normalized_meals) AS meal
    WHERE meal->'totals'->>'protein' IS NOT NULL
      AND (meal->'totals'->>'protein')::INTEGER > 0
  ), 0),
  actual_fats = COALESCE((
    SELECT SUM((meal->'totals'->>'fats')::INTEGER)
    FROM jsonb_array_elements(nd.normalized_meals) AS meal
    WHERE meal->'totals'->>'fats' IS NOT NULL
      AND (meal->'totals'->>'fats')::INTEGER > 0
  ), 0),
  actual_carbs = COALESCE((
    SELECT SUM((meal->'totals'->>'carbs')::INTEGER)
    FROM jsonb_array_elements(nd.normalized_meals) AS meal
    WHERE meal->'totals'->>'carbs' IS NOT NULL
      AND (meal->'totals'->>'carbs')::INTEGER > 0
  ), 0)
FROM normalized_data nd
WHERE dl.id = nd.id;

-- Включаем триггер валидации обратно
ALTER TABLE daily_logs ENABLE TRIGGER nutrition_validation_trigger;

COMMENT ON TABLE daily_logs IS 'Дневные логи питания пользователей. Структура meals: [{"id": "uuid", "title": "string", "weight": number, "per100": {"calories": number, "protein": number, "fats": number, "carbs": number}, "totals": {"calories": number, "protein": number, "fats": number, "carbs": number}, "mealDate": "YYYY-MM-DD", "createdAt": "timestamp"}]';
