-- ============================================
-- Fix Products RLS Policies
-- Description: Исправление RLS политик для products таблицы
-- Date: 2025-01-18
--
-- Problem: Клиенты получают 403/406 ошибки при попытке сохранить
-- продукты из внешних API (FatSecret, OpenFoodFacts) из-за
-- ограничительных RLS политик.
--
-- Solution: Разрешить всем аутентифицированным пользователям
-- создавать продукты (INSERT) и читать продукты (SELECT).
-- ============================================

BEGIN;

-- Удаляем старую ограничительную политику
-- Эта политика разрешала только super_admin управлять продуктами
DROP POLICY IF EXISTS "Only super_admin can manage products" ON products;

-- Создаем новую политику для INSERT - разрешаем всем authenticated пользователям
-- Это позволит клиентам сохранять продукты из внешних API
CREATE POLICY "Authenticated users can insert products"
ON products FOR INSERT
TO authenticated
WITH CHECK (true);

-- Создаем новую политику для SELECT - разрешаем всем authenticated пользователям
-- (старая политика "Anyone can read products" уже существует и разрешает SELECT всем,
-- но мы создаем более явную политику для authenticated пользователей)
DROP POLICY IF EXISTS "Anyone can read products" ON products;
CREATE POLICY "Authenticated users can read products"
ON products FOR SELECT
TO authenticated
USING (true);

-- Создаем политику для UPDATE - только super_admin может обновлять продукты
CREATE POLICY "Only super_admin can update products"
ON products FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Создаем политику для DELETE - только super_admin может удалять продукты
CREATE POLICY "Only super_admin can delete products"
ON products FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

COMMIT;

-- ============================================
-- Verification Queries
-- ============================================

-- Проверить, что политики созданы корректно:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'products'
-- ORDER BY policyname;

-- Ожидаемый результат:
-- 1. "Authenticated users can insert products" - FOR INSERT - WITH CHECK (true)
-- 2. "Authenticated users can read products" - FOR SELECT - USING (true)
-- 3. "Only super_admin can update products" - FOR UPDATE - USING (is_super_admin(auth.uid()))
-- 4. "Only super_admin can delete products" - FOR DELETE - USING (is_super_admin(auth.uid()))
