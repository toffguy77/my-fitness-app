# Миграции базы данных

Все SQL-скрипты для миграций базы данных проекта My Fitness App.

---

## 📋 Правила миграций

Согласно [Правилам разработки](../../.cursor/rules.md), все миграции должны:

- ✅ Быть версионированы в формате `v{Major}.{Minor}_{description}.sql`
- ✅ Быть идемпотентными (можно запускать несколько раз без ошибок)
- ✅ Содержать комментарии о назначении и зависимостях
- ✅ Выполняться последовательно в порядке версий

---

## 🔄 Порядок выполнения миграций

Миграции должны выполняться **строго последовательно** в Supabase SQL Editor:

### Phase 2.5: Freemium SaaS

1. **v2.5.1_add_super_admin_role.sql** — добавление роли `super_admin` в enum
   - ⚠️ **ВАЖНО:** Эта миграция должна быть выполнена первой в Phase 2.5
   - PostgreSQL требует коммита после добавления нового значения enum

2. **v2.5.2_add_subscription_fields.sql** — добавление полей подписки в `profiles`
   - Зависит от: v2.5.1

3. **v2.5.3_add_super_admin_rls.sql** — добавление RLS политик для `super_admin`
   - Зависит от: v2.5.2
   - ⚠️ **Примечание:** Политики с рекурсией будут исправлены в v2.6.1

### Phase 2.6: Исправления и улучшения

4. **v2.6.1_fix_rls_recursion.sql** — исправление рекурсии в RLS политиках
   - Зависит от: v2.5.3
   - Использует security definer функции для обхода рекурсии

5. **v2.6.2_add_phone_to_profiles.sql** — добавление поля `phone` в `profiles`
   - Зависит от: v2.6.1

6. **v2.6.3_add_meals_to_daily_logs.sql** — добавление поля `meals` (JSONB) в `daily_logs`
   - Зависит от: v2.6.2

7. **v2.6.4_add_weight_tracking.sql** — добавление поля `weight` в `daily_logs`
   - Зависит от: v2.6.3

### Phase 3.1: Onboarding

8. **v3.1_add_onboarding_fields.sql** — добавление полей для онбординга
   - Зависит от: v2.6.4
   - Добавляет: `gender`, `birth_date`, `height`, `activity_level` в `profiles`
   - Добавляет: `is_completed` в `daily_logs`

### Phase 3.2: Feedback Loop

9. **v3.2_add_feedback_loop.sql** — добавление Feedback Loop функционала
   - Зависит от: v3.1
   - Добавляет: `completed_at` в `daily_logs`
   - Создает: таблицу `coach_notes` с RLS политиками

---

## 🚀 Быстрый старт

### Для новой базы данных

Если вы создаете базу данных с нуля, используйте:
- **[setup_database_from_scratch.sql](./setup_database_from_scratch.sql)** — полный сетап базы

### Для существующей базы данных

Выполняйте миграции последовательно в Supabase SQL Editor:

```sql
-- 1. Phase 2.5
\i v2.5.1_add_super_admin_role.sql
\i v2.5.2_add_subscription_fields.sql
\i v2.5.3_add_super_admin_rls.sql

-- 2. Phase 2.6
\i v2.6.1_fix_rls_recursion.sql
\i v2.6.2_add_phone_to_profiles.sql
\i v2.6.3_add_meals_to_daily_logs.sql
\i v2.6.4_add_weight_tracking.sql

-- 3. Phase 3.1
\i v3.1_add_onboarding_fields.sql

-- 4. Phase 3.2
\i v3.2_add_feedback_loop.sql
```

> ⚠️ **Примечание:** В Supabase SQL Editor выполняйте миграции по одной, не все сразу.

---

## 📁 Дополнительные скрипты

### Утилиты

- **create_default_nutrition_plan.sql** — создание плана питания по умолчанию для premium пользователей
- **create_test_users_v3.sql** — создание тестовых пользователей (v3)
- **create_test_users_v3_manual.md** — инструкция по созданию тестовых пользователей вручную

### Архивные файлы

Следующие файлы являются архивными и не должны использоваться:
- `phase2.5_step1_add_enum.sql` → заменен на `v2.5.1_add_super_admin_role.sql`
- `phase2.5_step2_add_columns.sql` → заменен на `v2.5.2_add_subscription_fields.sql`
- `phase2.5_step3_rls_policies.sql` → заменен на `v2.5.3_add_super_admin_rls.sql`
- `phase2.5_schema_update.sql` → объединенная версия, заменена на отдельные миграции
- `fix_rls_recursion.sql` → заменен на `v2.6.1_fix_rls_recursion.sql`
- `add_phone_to_profiles.sql` → заменен на `v2.6.2_add_phone_to_profiles.sql`
- `add_meals_to_daily_logs.sql` → заменен на `v2.6.3_add_meals_to_daily_logs.sql`
- `add_weight_tracking.sql` → заменен на `v2.6.4_add_weight_tracking.sql`

---

## 🔍 Проверка состояния миграций

Для проверки, какие миграции уже выполнены, можно использовать следующий запрос:

```sql
-- Проверка наличия полей из миграций
SELECT 
    CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role' AND 'super_admin' = ANY(enum_range(NULL::user_role)::text[])) 
         THEN 'v2.5.1 ✓' ELSE 'v2.5.1 ✗' END as v2_5_1,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_status') 
         THEN 'v2.5.2 ✓' ELSE 'v2.5.2 ✗' END as v2_5_2,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'phone') 
         THEN 'v2.6.2 ✓' ELSE 'v2.6.2 ✗' END as v2_6_2,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_logs' AND column_name = 'meals') 
         THEN 'v2.6.3 ✓' ELSE 'v2.6.3 ✗' END as v2_6_3,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_logs' AND column_name = 'weight') 
         THEN 'v2.6.4 ✓' ELSE 'v2.6.4 ✗' END as v2_6_4,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gender') 
         THEN 'v3.1 ✓' ELSE 'v3.1 ✗' END as v3_1,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coach_notes') 
         THEN 'v3.2 ✓' ELSE 'v3.2 ✗' END as v3_2;
```

---

## 📝 Создание новой миграции

При создании новой миграции следуйте формату:

```sql
-- Migration: v{Major}.{Minor}_{description}
-- Description: Краткое описание изменений
-- Dependencies: v{Previous}.sql
-- Date: YYYY-MM-DD

-- Ваш SQL код здесь
-- Используйте IF NOT EXISTS для идемпотентности
```

Пример:
```sql
-- Migration: v3.3_add_new_feature
-- Description: Добавление новой функциональности
-- Dependencies: v3.2_add_feedback_loop.sql
-- Date: 2025-01-15

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS new_field TEXT;

COMMENT ON COLUMN profiles.new_field IS 'Описание нового поля';
```

---

**Последнее обновление:** 2025-01-XX

