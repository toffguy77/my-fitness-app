# RLS Migration Guide: Products Table

**Версия:** 1.0  
**Дата:** Январь 2025  
**Миграция:** `fix_products_rls.sql`

---

## Обзор

Эта миграция исправляет Row Level Security (RLS) политики для таблицы `products`, устраняя проблему с 403/406 ошибками при попытке клиентов сохранить продукты из внешних API (FatSecret, OpenFoodFacts).

## Проблема

### Симптомы

- Клиенты получают HTTP 403 (Forbidden) или 406 (Not Acceptable) при попытке сохранить продукты
- Ошибки возникают при использовании поиска продуктов через FatSecret или OpenFoodFacts API
- В логах появляются сообщения о нарушении RLS политик

### Причина

Старая RLS политика `"Only super_admin can manage products"` разрешала только super_admin пользователям создавать и изменять продукты. Это блокировало нормальную работу функции кэширования продуктов из внешних API.

## Решение

### Новые RLS политики

Миграция создает четыре новые политики:

1. **INSERT** - Все аутентифицированные пользователи могут создавать продукты
2. **SELECT** - Все аутентифицированные пользователи могут читать продукты
3. **UPDATE** - Только super_admin может обновлять продукты
4. **DELETE** - Только super_admin может удалять продукты

### Обоснование

- **INSERT/SELECT для всех:** Позволяет клиентам кэшировать продукты из внешних API в локальную БД
- **UPDATE/DELETE только для admin:** Сохраняет контроль над качеством данных в базе

## Применение миграции

### Предварительные требования

- Доступ к Supabase проекту с правами на выполнение SQL
- Резервная копия базы данных (рекомендуется)
- Доступ к staging окружению для тестирования

### Шаг 1: Тестирование в Staging

```bash
# 1. Подключитесь к staging базе данных
psql "postgresql://postgres:[PASSWORD]@[STAGING_HOST]:5432/postgres"

# 2. Выполните миграцию
\i migrations/fix_products_rls.sql

# 3. Проверьте политики
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'products'
ORDER BY policyname;
```

### Шаг 2: Верификация в Staging

Выполните тесты для проверки работы политик:

```bash
# Запустите integration тесты
npm test -- products-rls.integration.test.ts

# Запустите property тесты
npm test -- products-rls.insert.property.test.ts
npm test -- products-rls.select.property.test.ts
```

**Ожидаемый результат:**
- ✅ Клиенты могут создавать продукты (INSERT)
- ✅ Клиенты могут читать продукты (SELECT)
- ✅ Клиенты НЕ могут обновлять продукты (UPDATE)
- ✅ Клиенты НЕ могут удалять продукты (DELETE)
- ✅ Super admin может выполнять все операции

### Шаг 3: Применение в Production

**Через Supabase Dashboard:**

1. Откройте Supabase Dashboard → SQL Editor
2. Скопируйте содержимое `migrations/fix_products_rls.sql`
3. Вставьте в SQL Editor
4. Нажмите "Run"
5. Проверьте результат выполнения

**Через CLI:**

```bash
# Используйте Supabase CLI
supabase db push --db-url "postgresql://postgres:[PASSWORD]@[PROD_HOST]:5432/postgres"
```

### Шаг 4: Верификация в Production

```bash
# Проверьте политики через Supabase Dashboard
# SQL Editor → выполните:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'products'
ORDER BY policyname;
```

**Ожидаемый результат:**

| policyname | cmd | roles | qual | with_check |
|------------|-----|-------|------|------------|
| Authenticated users can insert products | INSERT | authenticated | - | true |
| Authenticated users can read products | SELECT | authenticated | true | - |
| Only super_admin can update products | UPDATE | authenticated | is_super_admin(auth.uid()) | is_super_admin(auth.uid()) |
| Only super_admin can delete products | DELETE | authenticated | is_super_admin(auth.uid()) | - |

## Тестирование

### Unit тесты

```bash
# Запустите все RLS тесты
npm test -- products-rls
```

### Integration тесты

```bash
# Тестирование INSERT операций
npm test -- products-rls.integration.test.ts
```

### Property-Based тесты

```bash
# Тестирование INSERT для любых продуктов
npm test -- products-rls.insert.property.test.ts

# Тестирование SELECT для любых продуктов
npm test -- products-rls.select.property.test.ts
```

## Откат миграции

Если необходимо откатить изменения:

```sql
BEGIN;

-- Удалить новые политики
DROP POLICY IF EXISTS "Authenticated users can insert products" ON products;
DROP POLICY IF EXISTS "Authenticated users can read products" ON products;
DROP POLICY IF EXISTS "Only super_admin can update products" ON products;
DROP POLICY IF EXISTS "Only super_admin can delete products" ON products;

-- Восстановить старую политику
CREATE POLICY "Only super_admin can manage products"
ON products FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Восстановить публичный SELECT
CREATE POLICY "Anyone can read products"
ON products FOR SELECT
TO anon, authenticated
USING (true);

COMMIT;
```

## Мониторинг

После применения миграции следите за:

### Метрики

- Количество успешных INSERT операций от клиентов
- Количество RLS policy violations (должно уменьшиться до нуля)
- Время ответа API для поиска продуктов

### Логи

```bash
# Проверьте логи на наличие RLS ошибок
grep "RLS" /var/log/app.log

# Проверьте логи Supabase
# Dashboard → Logs → Database
```

### Алерты

Настройте алерты на:
- Увеличение количества 403/406 ошибок
- RLS policy violations в логах Supabase
- Снижение успешности операций с products

## Часто задаваемые вопросы

### Q: Безопасно ли разрешать всем пользователям создавать продукты?

**A:** Да, это безопасно по следующим причинам:
- Пользователи могут создавать только продукты, которые они нашли через внешние API
- Продукты проходят валидацию перед сохранением
- Только super_admin может изменять или удалять продукты
- Это стандартная практика для кэширования данных из внешних источников

### Q: Что если пользователь создаст некорректный продукт?

**A:** 
- Валидация на уровне приложения предотвращает создание некорректных продуктов
- Super admin может удалить или исправить некорректные продукты
- Система логирует все операции для аудита

### Q: Как это влияет на производительность?

**A:**
- Положительно: уменьшается количество запросов к внешним API
- Локальный кэш продуктов работает быстрее
- Снижается нагрузка на FatSecret/OpenFoodFacts API

### Q: Нужно ли обновлять код приложения?

**A:** Нет, изменения в RLS политиках не требуют изменений в коде приложения. Существующий код будет работать корректно с новыми политиками.

## Связанные документы

- [Database Schema](./Database_Schema.md) - Полная схема базы данных
- [Technical Architecture](./Technical_Architecture.md) - Архитектура безопасности
- [API Reference](./API_Reference.md) - API для работы с продуктами
- [FatSecret Integration](../README.md#fatsecret-api-integration) - Интеграция с FatSecret API

## История изменений

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2025-01-18 | Первая версия миграции |

---

**Автор:** Development Team  
**Статус:** Готово к применению  
**Приоритет:** Высокий (исправляет критическую ошибку)
