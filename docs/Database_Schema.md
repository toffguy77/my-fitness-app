# Схема базы данных My Fitness App

**Версия документа:** 1.0  
**Дата создания:** Январь 2025  
**Статус:** Актуальная реализация v4.0+

---

## Обзор

База данных My Fitness App построена на **PostgreSQL** через **Supabase** и использует **Row Level Security (RLS)** для защиты данных на уровне БД. Схема поддерживает Freemium SaaS модель с ролями пользователей, подписками, работой с тренером, чатом, базой продуктов, OCR и системой достижений.

---

## Типы данных (ENUM)

### user_role
```sql
CREATE TYPE user_role AS ENUM ('client', 'curator', 'super_admin');
```

**Описание:** Роли пользователей в системе

**Значения:**
- `client` — клиент (Free или Premium)
- `curator` — куратор (специализируется на питании)
- `super_admin` — супер-администратор

---

## Основные таблицы

### 1. profiles

**Описание:** Профили пользователей системы

**Структура:**
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  role user_role DEFAULT 'client',
  curator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
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
```

**Ключевые поля:**
- `id` — UUID, ссылается на `auth.users.id`
- `role` — роль пользователя (client, curator, super_admin)
- `curator_id` — ID куратора (для Premium клиентов)
- `subscription_status` — статус подписки (free, active, cancelled, past_due, expired)
- `subscription_tier` — уровень подписки (basic, premium)
- `subscription_end_date` — дата окончания подписки

**Индексы:**
- `idx_profiles_role` — по роли
- `idx_profiles_curator_id` — по куратору
- `idx_profiles_public` — по публичным профилям (WHERE profile_visibility = 'public')

**RLS политики:**
- Пользователи могут читать и обновлять свой профиль
- Кураторы могут читать профили своих клиентов
- Super Admin имеет полный доступ
- Публичные профили доступны всем пользователям

---

### 2. nutrition_targets

**Описание:** Цели питания для пользователей (тренировочные дни и дни отдыха). Кураторы могут устанавливать и обновлять цели для своих клиентов.

**Структура:**
```sql
CREATE TABLE nutrition_targets (
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
```

**Ключевые поля:**
- `user_id` — ID пользователя
- `day_type` — тип дня (training, rest)
- `calories`, `protein`, `fats`, `carbs` — целевые значения КБЖУ
- `is_active` — активна ли цель

**Ограничения:**
- Калории: 1000-6000 ккал
- Белки: 20-500 г
- Жиры: 20-200 г
- Углеводы: 20-500 г

**Индексы:**
- `idx_nutrition_targets_user_id` — по пользователю
- `idx_nutrition_targets_active` — по активным целям

**RLS политики:**
- Пользователи могут управлять своими целями
- Тренеры могут читать и обновлять цели своих клиентов

---

### 3. daily_logs

**Описание:** Дневные логи питания пользователей

**Структура:**
```sql
CREATE TABLE daily_logs (
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
  meals JSONB, -- Массив объектов Meal
  
  -- Check-in
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
```

**Ключевые поля:**
- `user_id` — ID пользователя
- `date` — дата лога
- `actual_calories`, `actual_protein`, `actual_fats`, `actual_carbs` — фактические значения КБЖУ
- `meals` — массив приемов пищи в формате JSONB
- `is_completed` — завершен ли день (Check-in)
- `completed_at` — время завершения дня

**Структура meals (JSONB):**
```json
[
  {
    "id": "uuid",
    "title": "Завтрак",
    "weight": 100,
    "calories": 250,
    "protein": 20,
    "fats": 10,
    "carbs": 30,
    "mealDate": "2025-01-20",
    "createdAt": "2025-01-20T08:00:00Z"
  }
]
```

**Индексы:**
- `idx_daily_logs_user_date` — по пользователю и дате
- `idx_daily_logs_completed_at` — по завершенным дням

**RLS политики:**
- Пользователи могут управлять своими логами
- Кураторы могут читать логи своих клиентов

---

### 4. curator_notes

**Описание:** Заметки куратора для клиентов на конкретную дату

**Структура:**
```sql
CREATE TABLE curator_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, curator_id, date)
);
```

**Ключевые поля:**
- `client_id` — ID клиента
- `curator_id` — ID куратора
- `date` — дата заметки
- `content` — текст заметки

**Индексы:**
- `idx_curator_notes_client_date` — по клиенту и дате
- `idx_curator_notes_curator_date` — по куратору и дате

**RLS политики:**
- Кураторы могут читать и писать заметки для своих клиентов
- Клиенты могут читать заметки от своего куратора

---

### 5. messages

**Описание:** Сообщения чата между куратором и клиентом

**Структура:**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,
  CONSTRAINT check_sender_receiver CHECK (sender_id != receiver_id)
);
```

**Ключевые поля:**
- `sender_id` — ID отправителя
- `receiver_id` — ID получателя
- `content` — текст сообщения (макс 1000 символов)
- `read_at` — время прочтения
- `is_deleted` — флаг мягкого удаления

**Индексы:**
- `idx_messages_sender_receiver` — по отправителю и получателю
- `idx_messages_receiver_unread` — по непрочитанным сообщениям

**RLS политики:**
- Пользователи могут читать только свои сообщения (отправленные или полученные)
- Пользователи могут отправлять сообщения только от своего имени

**Realtime:**
- Таблица включена в Supabase Realtime для real-time обновлений

---

### 6. products

**Описание:** Кэш популярных продуктов из внешних API (Open Food Facts, USDA)

**Структура:**
```sql
CREATE TABLE products (
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
  usage_count INTEGER DEFAULT 0 CHECK (usage_count >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Ключевые поля:**
- `name` — название продукта
- `barcode` — штрих-код (уникальный)
- `calories_per_100g`, `protein_per_100g`, `fats_per_100g`, `carbs_per_100g` — КБЖУ на 100г
- `source` — источник данных (openfoodfacts, usda, user)
- `usage_count` — счетчик использования для сортировки популярных

**Индексы:**
- `idx_products_name` — по названию
- `idx_products_barcode` — по штрих-коду
- `idx_products_popular` — по популярности

**RLS политики:**
- Все могут читать продукты (публичная база)
- Только super_admin может управлять продуктами

---

### 7. user_products

**Описание:** Пользовательские продукты, добавленные вручную

**Структура:**
```sql
CREATE TABLE user_products (
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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Ключевые поля:**
- `user_id` — ID пользователя
- `name` — название продукта
- КБЖУ на 100г

**RLS политики:**
- Пользователи могут управлять только своими продуктами

---

### 8. product_usage_history

**Описание:** История использования продуктов пользователями

**Структура:**
```sql
CREATE TABLE product_usage_history (
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
```

**Ключевые поля:**
- `user_id` — ID пользователя
- `product_id` — ID продукта из глобальной базы (или NULL)
- `user_product_id` — ID пользовательского продукта (или NULL)

**Триггеры:**
- `trigger_update_product_usage_count` — обновляет `usage_count` в таблице `products`

---

### 9. favorite_products

**Описание:** Избранные продукты пользователей

**Структура:**
```sql
CREATE TABLE favorite_products (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  user_product_id UUID REFERENCES user_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_favorite_reference CHECK (
    (product_id IS NOT NULL AND user_product_id IS NULL) OR
    (product_id IS NULL AND user_product_id IS NOT NULL)
  )
);
```

**RLS политики:**
- Пользователи могут управлять только своими избранными

---

### 10. invite_codes

**Описание:** Инвайт-коды для регистрации клиентов тренерами

**Структура:**
```sql
CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  curator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
```

**Ключевые поля:**
- `code` — уникальный 8-символьный код
- `curator_id` — ID куратора
- `max_uses` — максимальное количество использований (NULL = безлимит)
- `used_count` — текущее количество использований
- `expires_at` — срок действия (NULL = без срока)

**RLS политики:**
- Тренеры могут управлять своими инвайт-кодами
- Все могут читать активные коды для валидации

---

### 11. invite_code_usage

**Описание:** История использования инвайт-кодов

**Структура:**
```sql
CREATE TABLE invite_code_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code_id UUID NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(invite_code_id, user_id)
);
```

---

### 12. ocr_scans

**Описание:** История OCR сканирований для аналитики

**Структура:**
```sql
CREATE TABLE ocr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  image_hash TEXT,
  ocr_provider TEXT NOT NULL CHECK (
    ocr_provider IN (
      'tesseract', 'google_vision', 'aws_textract',
      'lighton_ocr_1b', 'deepseek_ocr', 'paddleocr_vl',
      'qwen3_omni', 'qwen3_vl_30b', 'gemma_27b_vision',
      'openrouter_lighton', 'openrouter_deepseek', 'openrouter_paddleocr',
      'openrouter_qwen3_omni', 'openrouter_qwen3_vl', 'openrouter_gemma',
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
```

**Ключевые поля:**
- `user_id` — ID пользователя
- `ocr_provider` — провайдер OCR
- `confidence` — уверенность распознавания (0-100)
- `success` — был ли успешно использован результат
- `extracted_data` — извлеченные данные в формате JSON
- `cost_usd` — стоимость обработки (для платных API)

**RLS политики:**
- Пользователи могут управлять только своими OCR сканированиями

---

### 13. achievements

**Описание:** Справочник достижений

**Структура:**
```sql
CREATE TABLE achievements (
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
```

**Ключевые поля:**
- `code` — уникальный код достижения
- `category` — категория (nutrition, weight, activity, accuracy)
- `condition_type` — тип условия (streak_days, total_meals, weight_loss, ocr_used, etc.)
- `condition_value` — значение условия для получения достижения

**RLS политики:**
- Все могут читать активные достижения

---

### 14. user_achievements

**Описание:** История получения достижений пользователями

**Структура:**
```sql
CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  progress INTEGER DEFAULT 100 CHECK (progress >= 0 AND progress <= 100),
  UNIQUE(user_id, achievement_id)
);
```

**Ключевые поля:**
- `user_id` — ID пользователя
- `achievement_id` — ID достижения
- `progress` — процент выполнения (100 = получено)

**RLS политики:**
- Пользователи могут читать только свои достижения

---

### 15. notification_settings

**Описание:** Настройки уведомлений пользователя

**Структура:**
```sql
CREATE TABLE notification_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_daily_digest BOOLEAN DEFAULT true,
  email_realtime_alerts BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Ключевые поля:**
- `email_daily_digest` — ежедневная сводка по email (default: true)
- `email_realtime_alerts` — мгновенные уведомления по email (default: false)

**RLS политики:**
- Пользователи могут управлять только своими настройками

---

### 16. pending_notifications

**Описание:** Очередь уведомлений для отправки (дайджесты и отложенные)

**Структура:**
```sql
CREATE TABLE pending_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('coach_note', 'check_in_reminder', 'weekly_digest')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0
);
```

**Ключевые поля:**
- `notification_type` — тип уведомления
- `content` — JSONB с данными уведомления
- `sent_at` — время отправки (NULL если еще не отправлено)

**RLS политики:**
- Пользователи могут читать только свои уведомления
- Запись через сервер (Edge Functions)

---

## Связи между таблицами

### Основные связи

1. **profiles → profiles** (self-reference)
   - `curator_id` → `profiles.id` (куратор клиента)

2. **profiles → nutrition_targets**
   - `nutrition_targets.user_id` → `profiles.id`

3. **profiles → daily_logs**
   - `daily_logs.user_id` → `profiles.id`

4. **profiles → curator_notes**
   - `curator_notes.client_id` → `profiles.id`
   - `curator_notes.curator_id` → `profiles.id`

5. **profiles → messages**
   - `messages.sender_id` → `profiles.id`
   - `messages.receiver_id` → `profiles.id`

6. **profiles → user_products**
   - `user_products.user_id` → `profiles.id`

7. **products → product_usage_history**
   - `product_usage_history.product_id` → `products.id`

8. **user_products → product_usage_history**
   - `product_usage_history.user_product_id` → `user_products.id`

9. **profiles → invite_codes**
   - `invite_codes.curator_id` → `profiles.id`

10. **profiles → achievements**
    - `user_achievements.user_id` → `profiles.id`
    - `user_achievements.achievement_id` → `achievements.id`

---

## Индексы

### Производительность

Все таблицы имеют индексы для оптимизации запросов:

- **По пользователям:** `user_id`, `curator_id`, `client_id`
- **По датам:** `date`, `created_at`, `updated_at`
- **По статусам:** `is_active`, `is_completed`, `subscription_status`
- **По популярности:** `usage_count`, `used_count`

### Составные индексы

- `(user_id, date)` — для daily_logs
- `(client_id, coach_id, date)` — для coach_notes
- `(sender_id, receiver_id, created_at)` — для messages
- `(user_id, achievement_id)` — для user_achievements

---

## Row Level Security (RLS)

### Принципы RLS

1. **Пользователи видят только свои данные**
2. **Тренеры видят данные своих клиентов**
3. **Super Admin видит все данные**
4. **Публичные данные (products, achievements) доступны всем**

### Примеры политик

#### Пользователь видит свой профиль
```sql
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);
```

#### Тренер видит своих клиентов
```sql
CREATE POLICY "Coaches can view their clients"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id OR
    (curator_id = auth.uid() AND role = 'client')
  );
```

#### Super Admin видит все
```sql
CREATE POLICY "Super admin can view all"
  ON profiles FOR SELECT
  USING (is_super_admin(auth.uid()));
```

---

## Функции и триггеры

### Функции

1. **create_user_profile(user_id, user_email, user_full_name, user_role, user_curator_id)**
   - Безопасно создает профиль пользователя при регистрации
   - Обходит RLS используя SECURITY DEFINER
   - Проверяет, что профиль еще не существует

2. **check_achievements(user_id, trigger_type, trigger_data)**
   - Проверяет и присваивает достижения пользователю

3. **use_invite_code(code, user_id)**
   - Использует инвайт-код и возвращает ID тренера

4. **update_product_usage_count()**
   - Обновляет счетчик использования продукта

5. **check_and_update_subscription_status()**
   - Автоматически обновляет статус подписки при истечении

6. **validate_calories_match_macros(calories, protein, fats, carbs)**
   - Валидирует соответствие калорий макронутриентам

7. **validate_nutrition_limits(calories, protein, fats, carbs)**
   - Валидирует лимиты КБЖУ

8. **get_expired_subscriptions()**
   - Возвращает список истекших подписок

9. **get_expiring_subscriptions(days_ahead)**
   - Возвращает список подписок, истекающих через N дней

10. **deactivate_expired_subscriptions()**
    - Деактивирует истекшие подписки

### Триггеры

1. **update_subscription_status_on_expiry**
   - Автоматически обновляет статус подписки при истечении

2. **trigger_update_product_usage_count**
   - Обновляет счетчик использования продукта

3. **check_nutrition_validation**
   - Валидирует данные о питании при сохранении

---

## Миграции

Все изменения схемы БД выполняются через версионированные миграции:

- `v2.5.1_add_super_admin_role.sql`
- `v2.5.2_add_subscription_fields.sql`
- `v2.6.1_fix_rls_recursion.sql`
- `v2.6.2_add_phone_to_profiles.sql`
- `v2.6.3_add_meals_to_daily_logs.sql`
- `v2.6.4_add_weight_tracking.sql`
- `v3.1_add_onboarding_fields.sql`
- `v3.2_add_feedback_loop.sql`
- `v3.3_add_validation_and_notifications.sql`
- `v3.4_add_reliability_features.sql`
- `v5.1_add_messages_table.sql`
- `v5.2_add_products_tables.sql`
- `v6.2_add_invite_codes_table.sql`
- `v7.1_add_ocr_scans_table.sql`
- `v7.2_add_achievements_tables.sql`
- `v8.1_add_public_profiles.sql`
- `v8.2_fix_profile_creation.sql`

Подробнее см. [migrations/README.md](../migrations/README.md)

---

## ER-диаграмма

См. [Diagrams_Database_ER.md](./Diagrams_Database_ER.md) для полной ER-диаграммы базы данных.

---

## Связанные документы

- [Technical_Architecture.md](./Technical_Architecture.md) - Техническая архитектура
- [API_Reference.md](./API_Reference.md) - Справочник API
- [Implementation_Guide.md](./Implementation_Guide.md) - Руководство по реализации

---

**Последнее обновление:** Январь 2025  
**Версия документа:** 1.0
