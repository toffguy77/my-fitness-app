-- ============================================
-- Setup Database from Scratch
-- Description: Полный сетап базы данных My Fitness App с нуля
-- Date: 2025-01-XX
-- 
-- ВАЖНО: Этот скрипт создает базу данных с нуля.
-- Используйте только для новых проектов или полного пересоздания базы.
-- ============================================

-- ============================================
-- 1. СОЗДАНИЕ ТИПОВ (ENUM)
-- ============================================

DO $$ 
BEGIN
    -- Создаем enum для ролей пользователей
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('client', 'coach', 'super_admin');
    END IF;
END $$;

-- ============================================
-- 2. СОЗДАНИЕ ВСПОМОГАТЕЛЬНЫХ ФУНКЦИЙ (для RLS)
-- ============================================

-- Функция для проверки, является ли пользователь super_admin
-- Использует SECURITY DEFINER и BYPASSRLS для обхода RLS и предотвращения рекурсии
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Используем прямой запрос к auth.users для проверки роли без RLS
  -- или читаем из profiles с обходом RLS через SECURITY DEFINER
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role = 'super_admin'
  );
END;
$$;

COMMENT ON FUNCTION is_super_admin(UUID) IS 'Проверяет, является ли пользователь super_admin (без рекурсии RLS)';

-- Функция для проверки, является ли пользователь coach
CREATE OR REPLACE FUNCTION is_coach(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role = 'coach'
  );
END;
$$;

COMMENT ON FUNCTION is_coach(UUID) IS 'Проверяет, является ли пользователь coach (без рекурсии RLS)';

-- Функция для проверки, является ли пользователь coach для конкретного клиента
CREATE OR REPLACE FUNCTION is_client_coach(client_id UUID, potential_coach_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = client_id
    AND profiles.coach_id = potential_coach_id
  );
END;
$$;

COMMENT ON FUNCTION is_client_coach(UUID, UUID) IS 'Проверяет, является ли пользователь тренером клиента (без рекурсии RLS)';

-- ============================================
-- 3. СОЗДАНИЕ ТАБЛИЦ
-- ============================================

-- 3.1 Таблица profiles (профили пользователей)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    phone TEXT,
    role user_role DEFAULT 'client',
    coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    avatar_url TEXT,
    
    -- Подписка
    subscription_status TEXT DEFAULT 'free' 
        CHECK (subscription_status IN ('free', 'active', 'cancelled', 'past_due', 'expired')),
    subscription_tier TEXT DEFAULT 'basic' 
        CHECK (subscription_tier IN ('basic', 'premium')),
    subscription_start_date TIMESTAMPTZ,
    subscription_end_date TIMESTAMPTZ,
    
    -- Биометрия (для онбординга)
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    birth_date DATE,
    height DECIMAL(5,2), -- см
    
    -- Активность
    activity_level TEXT CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
    
    -- Приватность профиля
    profile_visibility TEXT DEFAULT 'private' 
        CHECK (profile_visibility IN ('private', 'public')),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'Профили пользователей приложения';
COMMENT ON COLUMN profiles.role IS 'Роль пользователя: client, coach, super_admin';
COMMENT ON COLUMN profiles.coach_id IS 'ID тренера (для клиентов)';
COMMENT ON COLUMN profiles.subscription_status IS 'Статус подписки: free, active, cancelled, past_due, expired';
COMMENT ON COLUMN profiles.subscription_tier IS 'Уровень подписки: basic, premium';
COMMENT ON COLUMN profiles.phone IS 'Телефон пользователя';
COMMENT ON COLUMN profiles.gender IS 'Пол пользователя (male, female, other)';
COMMENT ON COLUMN profiles.birth_date IS 'Дата рождения для расчета возраста';
COMMENT ON COLUMN profiles.height IS 'Рост в сантиметрах';
COMMENT ON COLUMN profiles.activity_level IS 'Уровень активности: sedentary (1.2), light (1.375), moderate (1.55), active (1.725), very_active (1.9)';
COMMENT ON COLUMN profiles.profile_visibility IS 'Видимость профиля: private (приватный) или public (публичный)';

-- 3.2 Таблица nutrition_targets (цели питания)
CREATE TABLE IF NOT EXISTS nutrition_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    day_type TEXT NOT NULL CHECK (day_type IN ('training', 'rest')),
    calories INTEGER NOT NULL CHECK (calories >= 1000 AND calories <= 6000),
    protein INTEGER NOT NULL CHECK (protein >= 20 AND protein <= 500),
    fats INTEGER NOT NULL CHECK (fats >= 20 AND fats <= 200),
    carbs INTEGER NOT NULL CHECK (carbs >= 20 AND carbs <= 500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, day_type, is_active) WHERE is_active = true
);

COMMENT ON TABLE nutrition_targets IS 'Цели питания для пользователей (тренировочные дни и дни отдыха)';
COMMENT ON COLUMN nutrition_targets.day_type IS 'Тип дня: training (тренировка) или rest (отдых)';

-- 3.3 Таблица daily_logs (дневные логи питания)
CREATE TABLE IF NOT EXISTS daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    target_type TEXT CHECK (target_type IN ('training', 'rest')),
    
    -- Фактические значения КБЖУ
    actual_calories INTEGER DEFAULT 0,
    actual_protein INTEGER DEFAULT 0,
    actual_fats INTEGER DEFAULT 0,
    actual_carbs INTEGER DEFAULT 0,
    
    -- Дополнительные данные
    weight DECIMAL(5,2), -- кг
    hunger_level INTEGER CHECK (hunger_level >= 1 AND hunger_level <= 10),
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10),
    notes TEXT,
    
    -- Приемы пищи (JSONB)
    meals JSONB DEFAULT '[]'::jsonb,
    
    -- Check-in
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

COMMENT ON TABLE daily_logs IS 'Дневные логи питания пользователей';
COMMENT ON COLUMN daily_logs.target_type IS 'Тип дня, для которого был создан лог: training или rest';
COMMENT ON COLUMN daily_logs.weight IS 'Вес тела клиента в килограммах на дату лога';
COMMENT ON COLUMN daily_logs.meals IS 'Массив приемов пищи за день. Формат: [{"id": "uuid", "title": "string", "weight": number, "calories": number, "protein": number, "fats": number, "carbs": number, "mealDate": "YYYY-MM-DD", "createdAt": "timestamp"}]';
COMMENT ON COLUMN daily_logs.is_completed IS 'Флаг завершения дня (Check-in). True означает, что день завершен и отправлен тренеру.';
COMMENT ON COLUMN daily_logs.completed_at IS 'Время завершения дня (Check-in). Устанавливается при нажатии кнопки "Завершить день".';

-- 3.4 Таблица coach_notes (заметки тренера)
CREATE TABLE IF NOT EXISTS coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, coach_id, date)
);

COMMENT ON TABLE coach_notes IS 'Заметки тренера для клиентов на конкретную дату';
COMMENT ON COLUMN coach_notes.client_id IS 'ID клиента, для которого оставлена заметка';
COMMENT ON COLUMN coach_notes.coach_id IS 'ID тренера, который оставил заметку';
COMMENT ON COLUMN coach_notes.date IS 'Дата, к которой относится заметка';
COMMENT ON COLUMN coach_notes.content IS 'Текст заметки от тренера';

-- 3.5 Таблица messages (сообщения чата)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT check_sender_receiver CHECK (sender_id != receiver_id)
);

COMMENT ON TABLE messages IS 'Сообщения чата между тренером и клиентом';
COMMENT ON COLUMN messages.sender_id IS 'ID отправителя сообщения';
COMMENT ON COLUMN messages.receiver_id IS 'ID получателя сообщения';
COMMENT ON COLUMN messages.content IS 'Текст сообщения (макс 1000 символов)';
COMMENT ON COLUMN messages.read_at IS 'Время прочтения сообщения (NULL если не прочитано)';
COMMENT ON COLUMN messages.is_deleted IS 'Флаг мягкого удаления сообщения';

-- 3.6 Таблица products (кэш продуктов)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT UNIQUE,
  calories_per_100g DECIMAL(10,2) NOT NULL CHECK (calories_per_100g >= 0),
  protein_per_100g DECIMAL(10,2) NOT NULL CHECK (protein_per_100g >= 0),
  fats_per_100g DECIMAL(10,2) NOT NULL CHECK (fats_per_100g >= 0),
  carbs_per_100g DECIMAL(10,2) NOT NULL CHECK (carbs_per_100g >= 0),
  source TEXT DEFAULT 'openfoodfacts' CHECK (source IN ('openfoodfacts', 'usda', 'user')),
  source_id TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  usage_count INTEGER DEFAULT 0 CHECK (usage_count >= 0),
  
  CONSTRAINT check_macros_positive CHECK (
    calories_per_100g >= 0 AND
    protein_per_100g >= 0 AND
    fats_per_100g >= 0 AND
    carbs_per_100g >= 0
  )
);

COMMENT ON TABLE products IS 'Кэш популярных продуктов из внешних API (Open Food Facts, USDA)';
COMMENT ON COLUMN products.name IS 'Название продукта';
COMMENT ON COLUMN products.brand IS 'Бренд продукта (опционально)';
COMMENT ON COLUMN products.barcode IS 'Штрих-код продукта (уникальный)';
COMMENT ON COLUMN products.calories_per_100g IS 'Калории на 100г продукта';
COMMENT ON COLUMN products.protein_per_100g IS 'Белки на 100г продукта (г)';
COMMENT ON COLUMN products.fats_per_100g IS 'Жиры на 100г продукта (г)';
COMMENT ON COLUMN products.carbs_per_100g IS 'Углеводы на 100г продукта (г)';
COMMENT ON COLUMN products.source IS 'Источник данных: openfoodfacts, usda, user';
COMMENT ON COLUMN products.source_id IS 'ID продукта в исходной базе';
COMMENT ON COLUMN products.usage_count IS 'Счетчик использования для сортировки популярных продуктов';

-- 3.7 Таблица user_products (пользовательские продукты)
CREATE TABLE IF NOT EXISTS user_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calories_per_100g DECIMAL(10,2) NOT NULL CHECK (calories_per_100g >= 0),
  protein_per_100g DECIMAL(10,2) NOT NULL CHECK (protein_per_100g >= 0),
  fats_per_100g DECIMAL(10,2) NOT NULL CHECK (fats_per_100g >= 0),
  carbs_per_100g DECIMAL(10,2) NOT NULL CHECK (carbs_per_100g >= 0),
  category TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT check_user_macros_positive CHECK (
    calories_per_100g >= 0 AND
    protein_per_100g >= 0 AND
    fats_per_100g >= 0 AND
    carbs_per_100g >= 0
  )
);

COMMENT ON TABLE user_products IS 'Пользовательские продукты, добавленные вручную';
COMMENT ON COLUMN user_products.user_id IS 'ID пользователя, создавшего продукт';
COMMENT ON COLUMN user_products.name IS 'Название продукта';
COMMENT ON COLUMN user_products.category IS 'Категория продукта (опционально)';
COMMENT ON COLUMN user_products.notes IS 'Заметки пользователя о продукте';

-- 3.8 Таблица product_usage_history (история использования продуктов)
CREATE TABLE IF NOT EXISTS product_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  user_product_id UUID REFERENCES user_products(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT check_product_reference CHECK (
    (product_id IS NOT NULL AND user_product_id IS NULL) OR
    (product_id IS NULL AND user_product_id IS NOT NULL)
  )
);

COMMENT ON TABLE product_usage_history IS 'История использования продуктов пользователями';
COMMENT ON COLUMN product_usage_history.product_id IS 'ID продукта из глобальной базы (если используется глобальный продукт)';
COMMENT ON COLUMN product_usage_history.user_product_id IS 'ID пользовательского продукта (если используется пользовательский продукт)';
COMMENT ON COLUMN product_usage_history.used_at IS 'Время использования продукта';

-- 3.9 Таблица favorite_products (избранные продукты)
CREATE TABLE IF NOT EXISTS favorite_products (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  user_product_id UUID REFERENCES user_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT check_favorite_reference CHECK (
    (product_id IS NOT NULL AND user_product_id IS NULL) OR
    (product_id IS NULL AND user_product_id IS NOT NULL)
  )
);

COMMENT ON TABLE favorite_products IS 'Избранные продукты пользователей';
COMMENT ON COLUMN favorite_products.product_id IS 'ID продукта из глобальной базы';
COMMENT ON COLUMN favorite_products.user_product_id IS 'ID пользовательского продукта';

-- 3.10 Таблица invite_codes (инвайт-коды)
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  used_count INTEGER DEFAULT 0 CHECK (used_count >= 0),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  
  CONSTRAINT check_used_count CHECK (
    max_uses IS NULL OR used_count <= max_uses
  )
);

COMMENT ON TABLE invite_codes IS 'Инвайт-коды для регистрации клиентов тренерами';
COMMENT ON COLUMN invite_codes.code IS 'Уникальный 8-символьный код';
COMMENT ON COLUMN invite_codes.coach_id IS 'ID тренера, создавшего код';
COMMENT ON COLUMN invite_codes.max_uses IS 'Максимальное количество использований (NULL = безлимит)';
COMMENT ON COLUMN invite_codes.used_count IS 'Текущее количество использований';
COMMENT ON COLUMN invite_codes.expires_at IS 'Срок действия кода (NULL = без срока)';
COMMENT ON COLUMN invite_codes.is_active IS 'Флаг активности кода';

-- 3.11 Таблица invite_code_usage (история использования инвайт-кодов)
CREATE TABLE IF NOT EXISTS invite_code_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code_id UUID NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(invite_code_id, user_id)
);

COMMENT ON TABLE invite_code_usage IS 'История использования инвайт-кодов';
COMMENT ON COLUMN invite_code_usage.invite_code_id IS 'ID использованного кода';
COMMENT ON COLUMN invite_code_usage.user_id IS 'ID пользователя, использовавшего код';

-- 3.12 Таблица ocr_scans (OCR сканирования)
CREATE TABLE IF NOT EXISTS ocr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  image_hash TEXT,
  ocr_provider TEXT NOT NULL CHECK (
    ocr_provider IN (
      'tesseract', 
      'google_vision', 
      'aws_textract',
      'lighton_ocr_1b',
      'deepseek_ocr',
      'paddleocr_vl',
      'qwen3_omni',
      'qwen3_vl_30b',
      'gemma_27b_vision',
      'openrouter_lighton',
      'openrouter_deepseek',
      'openrouter_paddleocr',
      'openrouter_qwen3_omni',
      'openrouter_qwen3_vl',
      'openrouter_gemma',
      'direct_qwen'
    )
  ),
  model_name TEXT,
  confidence DECIMAL(5,2) CHECK (confidence >= 0 AND confidence <= 100),
  success BOOLEAN DEFAULT FALSE,
  extracted_data JSONB,
  processing_time_ms INTEGER CHECK (processing_time_ms >= 0),
  cost_usd DECIMAL(10,6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE ocr_scans IS 'История OCR сканирований для аналитики';
COMMENT ON COLUMN ocr_scans.image_hash IS 'Хэш изображения для предотвращения дубликатов';
COMMENT ON COLUMN ocr_scans.ocr_provider IS 'Провайдер OCR: tesseract, openrouter модели, direct подключения';
COMMENT ON COLUMN ocr_scans.model_name IS 'Конкретное имя модели (например, lighton/lightonocr-1b)';
COMMENT ON COLUMN ocr_scans.confidence IS 'Уверенность распознавания (0-100)';
COMMENT ON COLUMN ocr_scans.success IS 'Был ли успешно использован результат OCR';
COMMENT ON COLUMN ocr_scans.extracted_data IS 'Извлеченные данные в формате JSON';
COMMENT ON COLUMN ocr_scans.processing_time_ms IS 'Время обработки в миллисекундах';
COMMENT ON COLUMN ocr_scans.cost_usd IS 'Стоимость обработки в USD (для платных API)';

-- 3.13 Таблица achievements (достижения)
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('nutrition', 'weight', 'activity', 'accuracy')),
  icon_name TEXT,
  condition_type TEXT NOT NULL,
  condition_value INTEGER NOT NULL CHECK (condition_value > 0),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE achievements IS 'Справочник достижений';
COMMENT ON COLUMN achievements.code IS 'Уникальный код достижения (например, 7_days_streak)';
COMMENT ON COLUMN achievements.category IS 'Категория достижения: nutrition, weight, activity, accuracy';
COMMENT ON COLUMN achievements.condition_type IS 'Тип условия (streak_days, total_meals, weight_loss, ocr_used, etc.)';
COMMENT ON COLUMN achievements.condition_value IS 'Значение условия для получения достижения';

-- 3.14 Таблица user_achievements (достижения пользователей)
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  progress INTEGER DEFAULT 100 CHECK (progress >= 0 AND progress <= 100),
  
  UNIQUE(user_id, achievement_id)
);

COMMENT ON TABLE user_achievements IS 'История получения достижений пользователями';
COMMENT ON COLUMN user_achievements.progress IS 'Процент выполнения (100 = получено)';

-- 3.15 Таблица notification_settings (настройки уведомлений)
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_daily_digest BOOLEAN DEFAULT true,
  email_realtime_alerts BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE notification_settings IS 'Настройки уведомлений пользователя';
COMMENT ON COLUMN notification_settings.email_daily_digest IS 'Ежедневная сводка по email (default: true)';
COMMENT ON COLUMN notification_settings.email_realtime_alerts IS 'Мгновенные уведомления по email (default: false)';

-- 3.16 Таблица pending_notifications (очередь уведомлений)
CREATE TABLE IF NOT EXISTS pending_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('coach_note', 'check_in_reminder', 'weekly_digest')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0
);

COMMENT ON TABLE pending_notifications IS 'Очередь уведомлений для отправки (дайджесты и отложенные)';
COMMENT ON COLUMN pending_notifications.notification_type IS 'Тип уведомления: coach_note, check_in_reminder, weekly_digest';
COMMENT ON COLUMN pending_notifications.content IS 'JSONB с данными уведомления';
COMMENT ON COLUMN pending_notifications.sent_at IS 'Время отправки (NULL если еще не отправлено)';
COMMENT ON COLUMN pending_notifications.retry_count IS 'Количество попыток отправки';

-- ============================================
-- 4. СОЗДАНИЕ ИНДЕКСОВ
-- ============================================

-- Индексы для profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_coach_id ON profiles(coach_id);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_birth_date ON profiles(birth_date);
CREATE INDEX IF NOT EXISTS idx_profiles_public ON profiles(profile_visibility) WHERE profile_visibility = 'public';

-- Индексы для nutrition_targets
CREATE INDEX IF NOT EXISTS idx_nutrition_targets_user_id ON nutrition_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_targets_active ON nutrition_targets(user_id, is_active) WHERE is_active = true;

-- Индексы для daily_logs
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_is_completed ON daily_logs(user_id, is_completed, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_weight ON daily_logs(weight) WHERE weight IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_logs_meals ON daily_logs USING GIN (meals);

-- Индексы для coach_notes
CREATE INDEX IF NOT EXISTS idx_coach_notes_client_date ON coach_notes(client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_coach_notes_coach_date ON coach_notes(coach_id, date DESC);

-- Индексы для messages
CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread ON messages(receiver_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Индексы для products
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_popular ON products(usage_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source, source_id) WHERE source_id IS NOT NULL;

-- Индексы для user_products
CREATE INDEX IF NOT EXISTS idx_user_products_user ON user_products(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_products_name ON user_products(name);
CREATE INDEX IF NOT EXISTS idx_user_products_name_lower ON user_products(LOWER(name));

-- Индексы для product_usage_history
CREATE INDEX IF NOT EXISTS idx_product_usage_user ON product_usage_history(user_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_usage_product ON product_usage_history(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_usage_user_product ON product_usage_history(user_product_id) WHERE user_product_id IS NOT NULL;

-- Индексы для favorite_products
CREATE INDEX IF NOT EXISTS idx_favorite_products_user ON favorite_products(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorite_products_product ON favorite_products(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_favorite_products_user_product ON favorite_products(user_product_id) WHERE user_product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_favorite_products_unique_global 
ON favorite_products(user_id, product_id) 
WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_favorite_products_unique_user 
ON favorite_products(user_id, user_product_id) 
WHERE user_product_id IS NOT NULL;

-- Индексы для invite_codes
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_invite_codes_coach ON invite_codes(coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invite_codes_active ON invite_codes(is_active, expires_at) WHERE is_active = TRUE;

-- Индексы для invite_code_usage
CREATE INDEX IF NOT EXISTS idx_invite_code_usage_code ON invite_code_usage(invite_code_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_invite_code_usage_user ON invite_code_usage(user_id);

-- Индексы для ocr_scans
CREATE INDEX IF NOT EXISTS idx_ocr_scans_user ON ocr_scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_scans_success ON ocr_scans(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_scans_provider ON ocr_scans(ocr_provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_scans_cost ON ocr_scans(cost_usd) WHERE cost_usd IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ocr_scans_image_hash ON ocr_scans(image_hash) WHERE image_hash IS NOT NULL;

-- Индексы для achievements
CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category, is_active);
CREATE INDEX IF NOT EXISTS idx_achievements_code ON achievements(code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_achievements_condition_type ON achievements(condition_type, is_active) WHERE is_active = TRUE;

-- Индексы для user_achievements
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id, unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_progress ON user_achievements(user_id, progress) WHERE progress < 100;

-- Индексы для notification_settings
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);

-- Индексы для pending_notifications
CREATE INDEX IF NOT EXISTS idx_pending_notifications_user_id ON pending_notifications(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_pending_notifications_unsent ON pending_notifications(sent_at) WHERE sent_at IS NULL;

-- ============================================
-- 5. СОЗДАНИЕ ФУНКЦИЙ
-- ============================================

-- 5.1 Функция валидации соответствия калорий макронутриентам
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

-- 5.2 Функция валидации максимальных значений
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

-- 5.3 Функция для получения истекших подписок
CREATE OR REPLACE FUNCTION get_expired_subscriptions()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  subscription_end_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.subscription_end_date
  FROM profiles p
  WHERE p.subscription_status = 'active'
    AND p.subscription_tier = 'premium'
    AND p.subscription_end_date IS NOT NULL
    AND p.subscription_end_date < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_expired_subscriptions IS 'Возвращает список подписок с истекшей датой окончания';

-- 5.4 Функция для получения подписок, истекающих через N дней
CREATE OR REPLACE FUNCTION get_expiring_subscriptions(days_ahead INTEGER DEFAULT 3)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  subscription_end_date TIMESTAMPTZ,
  days_remaining INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
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

-- 5.5 Функция для деактивации истекших подписок
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

-- 5.6 Функция для использования инвайт-кода
CREATE OR REPLACE FUNCTION use_invite_code(
  code_param TEXT,
  user_id_param UUID
) RETURNS UUID AS $$
DECLARE
  invite_code_record invite_codes%ROWTYPE;
  coach_id_result UUID;
BEGIN
  -- Находим активный код
  SELECT * INTO invite_code_record
  FROM invite_codes
  WHERE code = code_param
  AND is_active = TRUE
  AND (expires_at IS NULL OR expires_at > NOW())
  AND (max_uses IS NULL OR used_count < max_uses)
  FOR UPDATE;

  -- Проверяем, что код найден и валиден
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  -- Проверяем, что пользователь еще не использовал этот код
  IF EXISTS (
    SELECT 1 FROM invite_code_usage
    WHERE invite_code_id = invite_code_record.id
    AND user_id = user_id_param
  ) THEN
    RAISE EXCEPTION 'Invite code already used by this user';
  END IF;

  -- Увеличиваем счетчик использований
  UPDATE invite_codes
  SET used_count = used_count + 1,
      last_used_at = NOW()
  WHERE id = invite_code_record.id;

  -- Создаем запись использования
  INSERT INTO invite_code_usage (invite_code_id, user_id)
  VALUES (invite_code_record.id, user_id_param)
  ON CONFLICT (invite_code_id, user_id) DO NOTHING;

  -- Возвращаем ID тренера
  RETURN invite_code_record.coach_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION use_invite_code IS 'Использует инвайт-код и возвращает ID тренера для назначения клиенту';

-- 5.7 Функция проверки достижений (исправленная версия)
CREATE OR REPLACE FUNCTION check_achievements(
  user_id_param UUID,
  trigger_type_param TEXT,
  trigger_data_param JSONB DEFAULT '{}'::jsonb
) RETURNS TABLE(achievement_id UUID, achievement_code TEXT, achievement_name TEXT) AS $$
DECLARE
  achievement_record RECORD;
  current_value INTEGER;
BEGIN
  -- Проверяем все активные достижения с соответствующим типом условия
  FOR achievement_record IN
    SELECT * FROM achievements
    WHERE is_active = TRUE
    AND condition_type = trigger_type_param
  LOOP
    -- Проверяем, не получено ли уже достижение
    IF EXISTS (
      SELECT 1 FROM user_achievements ua
      WHERE ua.user_id = user_id_param
      AND ua.achievement_id = achievement_record.id
      AND ua.progress = 100
    ) THEN
      CONTINUE;
    END IF;

    -- Вычисляем текущее значение в зависимости от типа триггера
    BEGIN
      CASE trigger_type_param
        WHEN 'streak_days' THEN
          -- Подсчитываем количество дней подряд с данными о питании
          WITH RECURSIVE streak AS (
            SELECT CURRENT_DATE as check_date, 1 as streak_count
            WHERE EXISTS (
              SELECT 1 FROM daily_logs
              WHERE user_id = user_id_param
              AND date = CURRENT_DATE
              AND actual_calories > 0
            )
            UNION ALL
            SELECT check_date - INTERVAL '1 day', streak_count + 1
            FROM streak
            WHERE EXISTS (
              SELECT 1 FROM daily_logs
              WHERE user_id = user_id_param
              AND date = check_date - INTERVAL '1 day'
              AND actual_calories > 0
            )
            AND streak_count < 365
          )
          SELECT COALESCE(MAX(streak_count), 0) INTO current_value FROM streak;
          
        WHEN 'total_meals' THEN
          -- Подсчитываем общее количество приемов пищи
          SELECT COALESCE(SUM(
            CASE 
              WHEN meals IS NULL THEN 0
              WHEN jsonb_typeof(meals) = 'array' THEN jsonb_array_length(meals)
              ELSE 0
            END
          ), 0) INTO current_value
          FROM daily_logs
          WHERE user_id = user_id_param
          AND meals IS NOT NULL;
          
        WHEN 'ocr_used' THEN
          -- Подсчитываем количество успешных OCR сканирований
          SELECT COUNT(*) INTO current_value
          FROM ocr_scans
          WHERE user_id = user_id_param
          AND success = TRUE;
          
        WHEN 'weight_logged' THEN
          -- Подсчитываем количество записей веса
          SELECT COUNT(*) INTO current_value
          FROM daily_logs
          WHERE user_id = user_id_param
          AND weight IS NOT NULL;
          
        WHEN 'days_active' THEN
          -- Подсчитываем количество активных дней
          SELECT COUNT(DISTINCT date) INTO current_value
          FROM daily_logs
          WHERE user_id = user_id_param
          AND (actual_calories > 0 OR weight IS NOT NULL);
          
        ELSE
          current_value := 0;
      END CASE;
    EXCEPTION
      WHEN OTHERS THEN
        current_value := 0;
        RAISE WARNING 'Ошибка при вычислении достижения %: %', achievement_record.code, SQLERRM;
    END;

    -- Если условие выполнено, присваиваем достижение
    IF current_value >= achievement_record.condition_value THEN
      BEGIN
        INSERT INTO user_achievements AS ua (user_id, achievement_id, progress)
        VALUES (user_id_param, achievement_record.id, 100)
        ON CONFLICT (user_id, achievement_id) 
        DO UPDATE SET progress = 100, unlocked_at = CASE 
          WHEN ua.progress < 100 THEN NOW()
          ELSE ua.unlocked_at
        END;
        
        RETURN QUERY SELECT achievement_record.id, achievement_record.code, achievement_record.name;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Ошибка при присвоении достижения %: %', achievement_record.code, SQLERRM;
      END;
    ELSE
      -- Обновляем прогресс, если достижение еще не получено
      BEGIN
        INSERT INTO user_achievements AS ua (user_id, achievement_id, progress)
        VALUES (
          user_id_param, 
          achievement_record.id, 
          LEAST(100, (current_value * 100 / NULLIF(achievement_record.condition_value, 0)))
        )
        ON CONFLICT (user_id, achievement_id) 
        DO UPDATE SET progress = LEAST(100, (current_value * 100 / NULLIF(achievement_record.condition_value, 0)))
        WHERE ua.progress < 100;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Ошибка при обновлении прогресса достижения %: %', achievement_record.code, SQLERRM;
      END;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_achievements IS 'Проверяет и присваивает достижения пользователю на основе триггера. Исправленная версия с обработкой ошибок.';

-- 5.8 Функция для обновления счетчика использования продукта
CREATE OR REPLACE FUNCTION update_product_usage_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE products
    SET usage_count = usage_count + 1,
        updated_at = NOW()
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_product_usage_count() IS 'Обновляет счетчик использования продукта при добавлении в историю';

-- 5.9 Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS 'Автоматически обновляет поле updated_at';

-- 5.10 Функция для автоматического обновления статуса подписки при истечении
CREATE OR REPLACE FUNCTION check_and_update_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Если subscription_end_date прошел, но статус еще не expired, обновляем
  IF NEW.subscription_end_date IS NOT NULL 
     AND NEW.subscription_end_date < NOW() 
     AND NEW.subscription_status != 'expired' THEN
    NEW.subscription_status := 'expired';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_and_update_subscription_status() IS 'Автоматически обновляет subscription_status на expired при истечении subscription_end_date';

-- 5.11 Функция для проверки rate limit сообщений
CREATE OR REPLACE FUNCTION check_message_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
    message_count INTEGER;
BEGIN
    -- Подсчитываем количество сообщений от этого пользователя за последнюю минуту
    SELECT COUNT(*) INTO message_count
    FROM messages
    WHERE sender_id = NEW.sender_id
      AND created_at > NOW() - INTERVAL '1 minute'
      AND is_deleted = false;

    -- Если превышен лимит (10 сообщений в минуту), отменяем вставку
    IF message_count >= 10 THEN
        RAISE EXCEPTION 'Rate limit exceeded: максимум 10 сообщений в минуту. Подождите немного.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_message_rate_limit() IS 'Проверяет rate limit: максимум 10 сообщений в минуту от одного пользователя';

-- 5.12 Функция для безопасного создания профиля при регистрации
-- Функция проверяет наличие колонки profile_visibility для совместимости
CREATE OR REPLACE FUNCTION create_user_profile(
  user_id UUID,
  user_email TEXT,
  user_full_name TEXT DEFAULT NULL,
  user_role user_role DEFAULT 'client',
  user_coach_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_profile_visibility BOOLEAN;
BEGIN
  -- Проверяем, что профиль еще не существует
  IF EXISTS (SELECT 1 FROM profiles WHERE id = user_id) THEN
    RETURN;
  END IF;

  -- Проверяем наличие колонки profile_visibility
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'profile_visibility'
  ) INTO has_profile_visibility;

  -- Создаем профиль с учетом наличия колонки profile_visibility
  IF has_profile_visibility THEN
    INSERT INTO profiles (
      id,
      email,
      full_name,
      role,
      coach_id,
      subscription_status,
      subscription_tier,
      profile_visibility,
      created_at,
      updated_at
    ) VALUES (
      user_id,
      user_email,
      user_full_name,
      user_role,
      user_coach_id,
      'free',
      'basic',
      'private',
      NOW(),
      NOW()
    );
  ELSE
    -- Для баз данных без колонки profile_visibility (обратная совместимость)
    INSERT INTO profiles (
      id,
      email,
      full_name,
      role,
      coach_id,
      subscription_status,
      subscription_tier,
      created_at,
      updated_at
    ) VALUES (
      user_id,
      user_email,
      user_full_name,
      user_role,
      user_coach_id,
      'free',
      'basic',
      NOW(),
      NOW()
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION create_user_profile(UUID, TEXT, TEXT, user_role, UUID) IS 'Безопасно создает профиль пользователя, обходя RLS. Используется при регистрации.';

-- ============================================
-- 6. СОЗДАНИЕ ТРИГГЕРОВ
-- ============================================

-- 6.1 Триггер для валидации данных о питании
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
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_nutrition_validation IS 'Триггер для валидации данных о питании при сохранении';

DROP TRIGGER IF EXISTS nutrition_validation_trigger ON daily_logs;
CREATE TRIGGER nutrition_validation_trigger
BEFORE INSERT OR UPDATE ON daily_logs
FOR EACH ROW
EXECUTE FUNCTION check_nutrition_validation();

-- 6.2 Триггер для автоматического обновления статуса подписки
DROP TRIGGER IF EXISTS update_subscription_status_on_expiry ON profiles;
CREATE TRIGGER update_subscription_status_on_expiry
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (OLD.subscription_end_date IS DISTINCT FROM NEW.subscription_end_date 
        OR OLD.subscription_status IS DISTINCT FROM NEW.subscription_status)
  EXECUTE FUNCTION check_and_update_subscription_status();

-- 6.3 Триггер для обновления счетчика использования продукта
DROP TRIGGER IF EXISTS trigger_update_product_usage_count ON product_usage_history;
CREATE TRIGGER trigger_update_product_usage_count
AFTER INSERT ON product_usage_history
FOR EACH ROW
WHEN (NEW.product_id IS NOT NULL)
EXECUTE FUNCTION update_product_usage_count();

-- 6.4 Триггеры для автоматического обновления updated_at
DROP TRIGGER IF EXISTS trigger_update_products_updated_at ON products;
CREATE TRIGGER trigger_update_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_user_products_updated_at ON user_products;
CREATE TRIGGER trigger_update_user_products_updated_at
BEFORE UPDATE ON user_products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 6.5 Триггер для rate limiting сообщений
DROP TRIGGER IF EXISTS trigger_check_message_rate_limit ON messages;
CREATE TRIGGER trigger_check_message_rate_limit
    BEFORE INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION check_message_rate_limit();

-- ============================================
-- 7. НАСТРОЙКА ROW LEVEL SECURITY (RLS)
-- ============================================

-- Включаем RLS для всех таблиц
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_usage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_code_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. СОЗДАНИЕ RLS ПОЛИТИК
-- ============================================

-- 8.1 Политики для profiles
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
CREATE POLICY "Users can view profiles"
ON profiles FOR SELECT
USING (
    auth.uid() = id
    OR coach_id = auth.uid()
);

DROP POLICY IF EXISTS "Anyone can read public profiles" ON profiles;
CREATE POLICY "Anyone can read public profiles"
ON profiles FOR SELECT
USING (
  profile_visibility = 'public' OR
  auth.uid() = id OR
  coach_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can update profiles" ON profiles;
CREATE POLICY "Users can update profiles"
ON profiles FOR UPDATE
USING (
    auth.uid() = id
)
WITH CHECK (
    auth.uid() = id
);

DROP POLICY IF EXISTS "Users can insert profiles" ON profiles;
CREATE POLICY "Users can insert profiles"
ON profiles FOR INSERT
WITH CHECK (
    auth.uid() = id
    OR is_super_admin(auth.uid())
);

-- 8.2 Политики для nutrition_targets
DROP POLICY IF EXISTS "Users can view nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can view nutrition targets"
ON nutrition_targets FOR SELECT
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coach(auth.uid())
        AND is_client_coach(nutrition_targets.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can insert nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can insert nutrition targets"
ON nutrition_targets FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coach(auth.uid())
        AND is_client_coach(nutrition_targets.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can update nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can update nutrition targets"
ON nutrition_targets FOR UPDATE
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coach(auth.uid())
        AND is_client_coach(nutrition_targets.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can delete nutrition targets" ON nutrition_targets;
CREATE POLICY "Users can delete nutrition targets"
ON nutrition_targets FOR DELETE
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coach(auth.uid())
        AND is_client_coach(nutrition_targets.user_id, auth.uid())
    )
);

-- 8.3 Политики для daily_logs
DROP POLICY IF EXISTS "Users can view daily logs" ON daily_logs;
CREATE POLICY "Users can view daily logs"
ON daily_logs FOR SELECT
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coach(auth.uid())
        AND is_client_coach(daily_logs.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can insert daily logs" ON daily_logs;
CREATE POLICY "Users can insert daily logs"
ON daily_logs FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Users can update daily logs" ON daily_logs;
CREATE POLICY "Users can update daily logs"
ON daily_logs FOR UPDATE
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (
        is_coach(auth.uid())
        AND is_client_coach(daily_logs.user_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can delete daily logs" ON daily_logs;
CREATE POLICY "Users can delete daily logs"
ON daily_logs FOR DELETE
USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
);

-- 8.4 Политики для coach_notes
DROP POLICY IF EXISTS "Coaches can view notes for their clients" ON coach_notes;
CREATE POLICY "Coaches can view notes for their clients"
  ON coach_notes FOR SELECT
  USING (
    coach_id = auth.uid() OR
    is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Coaches can insert notes for their clients" ON coach_notes;
CREATE POLICY "Coaches can insert notes for their clients"
  ON coach_notes FOR INSERT
  WITH CHECK (
    coach_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = client_id
      AND profiles.coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Coaches can update their own notes" ON coach_notes;
CREATE POLICY "Coaches can update their own notes"
  ON coach_notes FOR UPDATE
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can delete their own notes" ON coach_notes;
CREATE POLICY "Coaches can delete their own notes"
  ON coach_notes FOR DELETE
  USING (coach_id = auth.uid());

DROP POLICY IF EXISTS "Clients can view notes from their coach" ON coach_notes;
CREATE POLICY "Clients can view notes from their coach"
  ON coach_notes FOR SELECT
  USING (
    client_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.coach_id = coach_notes.coach_id
    )
  );

-- 8.5 Политики для messages
DROP POLICY IF EXISTS "Users can read their own messages" ON messages;
CREATE POLICY "Users can read their own messages"
ON messages FOR SELECT
USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);

DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages"
ON messages FOR INSERT
WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can update their own messages" ON messages;
CREATE POLICY "Users can update their own messages"
ON messages FOR UPDATE
USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
)
WITH CHECK (
  (auth.uid() = sender_id OR auth.uid() = receiver_id)
);

-- 8.6 Политики для products
DROP POLICY IF EXISTS "Anyone can read products" ON products;
CREATE POLICY "Anyone can read products"
ON products FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Only super_admin can manage products" ON products;
CREATE POLICY "Only super_admin can manage products"
ON products FOR ALL
USING (is_super_admin(auth.uid()));

-- 8.7 Политики для user_products
DROP POLICY IF EXISTS "Users can read their own products" ON user_products;
CREATE POLICY "Users can read their own products"
ON user_products FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own products" ON user_products;
CREATE POLICY "Users can create their own products"
ON user_products FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own products" ON user_products;
CREATE POLICY "Users can update their own products"
ON user_products FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own products" ON user_products;
CREATE POLICY "Users can delete their own products"
ON user_products FOR DELETE
USING (auth.uid() = user_id);

-- 8.8 Политики для product_usage_history
DROP POLICY IF EXISTS "Users can read their own usage history" ON product_usage_history;
CREATE POLICY "Users can read their own usage history"
ON product_usage_history FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own usage history" ON product_usage_history;
CREATE POLICY "Users can create their own usage history"
ON product_usage_history FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 8.9 Политики для favorite_products
DROP POLICY IF EXISTS "Users can read their own favorites" ON favorite_products;
CREATE POLICY "Users can read their own favorites"
ON favorite_products FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own favorites" ON favorite_products;
CREATE POLICY "Users can create their own favorites"
ON favorite_products FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own favorites" ON favorite_products;
CREATE POLICY "Users can delete their own favorites"
ON favorite_products FOR DELETE
USING (auth.uid() = user_id);

-- 8.10 Политики для invite_codes
DROP POLICY IF EXISTS "Coaches can read their own invite codes" ON invite_codes;
CREATE POLICY "Coaches can read their own invite codes"
ON invite_codes FOR SELECT
USING (auth.uid() = coach_id);

DROP POLICY IF EXISTS "Coaches can create their own invite codes" ON invite_codes;
CREATE POLICY "Coaches can create their own invite codes"
ON invite_codes FOR INSERT
WITH CHECK (auth.uid() = coach_id);

DROP POLICY IF EXISTS "Coaches can update their own invite codes" ON invite_codes;
CREATE POLICY "Coaches can update their own invite codes"
ON invite_codes FOR UPDATE
USING (auth.uid() = coach_id)
WITH CHECK (auth.uid() = coach_id);

DROP POLICY IF EXISTS "Coaches can delete their own invite codes" ON invite_codes;
CREATE POLICY "Coaches can delete their own invite codes"
ON invite_codes FOR DELETE
USING (auth.uid() = coach_id);

DROP POLICY IF EXISTS "Anyone can read active invite codes for validation" ON invite_codes;
CREATE POLICY "Anyone can read active invite codes for validation"
ON invite_codes FOR SELECT
USING (
  is_active = TRUE AND
  (expires_at IS NULL OR expires_at > NOW()) AND
  (max_uses IS NULL OR used_count < max_uses)
);

-- 8.11 Политики для invite_code_usage
DROP POLICY IF EXISTS "Coaches can read usage of their invite codes" ON invite_code_usage;
CREATE POLICY "Coaches can read usage of their invite codes"
ON invite_code_usage FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM invite_codes
    WHERE invite_codes.id = invite_code_usage.invite_code_id
    AND invite_codes.coach_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "System can create invite code usage" ON invite_code_usage;
CREATE POLICY "System can create invite code usage"
ON invite_code_usage FOR INSERT
WITH CHECK (true);

-- 8.12 Политики для ocr_scans
DROP POLICY IF EXISTS "Users can read their own OCR scans" ON ocr_scans;
CREATE POLICY "Users can read their own OCR scans"
ON ocr_scans FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own OCR scans" ON ocr_scans;
CREATE POLICY "Users can create their own OCR scans"
ON ocr_scans FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own OCR scans" ON ocr_scans;
CREATE POLICY "Users can update their own OCR scans"
ON ocr_scans FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 8.13 Политики для achievements
DROP POLICY IF EXISTS "Anyone can read active achievements" ON achievements;
CREATE POLICY "Anyone can read active achievements"
ON achievements FOR SELECT
USING (is_active = TRUE);

-- 8.14 Политики для user_achievements
DROP POLICY IF EXISTS "Users can read their own achievements" ON user_achievements;
CREATE POLICY "Users can read their own achievements"
ON user_achievements FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read their own achievement progress" ON user_achievements;
CREATE POLICY "Users can read their own achievement progress"
ON user_achievements FOR SELECT
USING (auth.uid() = user_id);

-- 8.15 Политики для notification_settings
DROP POLICY IF EXISTS "Users can view their own notification settings" ON notification_settings;
CREATE POLICY "Users can view their own notification settings"
  ON notification_settings FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notification settings" ON notification_settings;
CREATE POLICY "Users can update their own notification settings"
  ON notification_settings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own notification settings" ON notification_settings;
CREATE POLICY "Users can insert their own notification settings"
  ON notification_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 8.16 Политики для pending_notifications
DROP POLICY IF EXISTS "Users can view their own pending notifications" ON pending_notifications;
CREATE POLICY "Users can view their own pending notifications"
  ON pending_notifications FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- 9. ВСТАВКА НАЧАЛЬНЫХ ДАННЫХ
-- ============================================

-- 9.1 Начальные достижения
INSERT INTO achievements (code, name, description, category, icon_name, condition_type, condition_value) VALUES
-- Питание
('7_days_streak', 'Неделя подряд', 'Введите данные о питании 7 дней подряд', 'nutrition', 'flame', 'streak_days', 7),
('30_days_streak', 'Месяц подряд', 'Введите данные о питании 30 дней подряд', 'nutrition', 'flame', 'streak_days', 30),
('100_meals', '100 приемов пищи', 'Добавьте 100 приемов пищи', 'nutrition', 'utensils', 'total_meals', 100),
('500_meals', '500 приемов пищи', 'Добавьте 500 приемов пищи', 'nutrition', 'utensils', 'total_meals', 500),

-- Активность
('7_days_active', 'Неделя активности', 'Будьте активны 7 дней подряд', 'activity', 'calendar', 'days_active', 7),
('30_days_active', 'Месяц активности', 'Будьте активны 30 дней подряд', 'activity', 'calendar', 'days_active', 30),
('100_days_active', '100 дней активности', 'Будьте активны 100 дней', 'activity', 'calendar', 'days_active', 100),

-- Точность (OCR)
('ocr_first', 'Первое сканирование', 'Используйте OCR для сканирования этикетки', 'accuracy', 'scan', 'ocr_used', 1),
('ocr_10', '10 сканирований', 'Используйте OCR 10 раз', 'accuracy', 'scan', 'ocr_used', 10),
('ocr_50', '50 сканирований', 'Используйте OCR 50 раз', 'accuracy', 'scan', 'ocr_used', 50),

-- Вес
('weight_first', 'Первая запись веса', 'Запишите свой вес', 'weight', 'scale', 'weight_logged', 1),
('weight_10', '10 записей веса', 'Запишите вес 10 раз', 'weight', 'scale', 'weight_logged', 10),
('weight_30', '30 записей веса', 'Запишите вес 30 раз', 'weight', 'scale', 'weight_logged', 30)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 10. ВКЛЮЧЕНИЕ REALTIME (опционально)
-- ============================================

-- Включение Realtime для таблицы messages (если нужно)
-- Выполните вручную через Supabase Dashboard:
-- Database > Replication > Enable для таблицы messages
-- Или выполните команду (если у вас есть права):
-- ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================
-- ГОТОВО!
-- ============================================

-- База данных создана и готова к использованию.
-- Все таблицы, функции, триггеры и RLS политики настроены.

