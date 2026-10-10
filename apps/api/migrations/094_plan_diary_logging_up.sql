-- ============================================================================
-- Миграция 094: блюдо плана — запись дневника
-- ============================================================================
--
-- Каждая одобренная версия рецепта становится продуктом каталога food_items с
-- источником 'recipe': запись дневника о блюде — обычная запись в граммах,
-- ссылающаяся на продукт своей версии. Новая версия — новый продукт, поэтому
-- запись, «повтор» и избранное сохраняют КБЖУ той версии, которую человек ел.
--
-- Идентификатор продукта выводится из идентификатора версии функцией
-- recipe_product_id — единственным местом, где он вычисляется: её зовут
-- одобрение (recipes), запись из плана (mealplan) и поиск (food-tracker).
-- Хэш — встроенный md5, а не uuid_generate_v5: uuid-ossp — расширение, а
-- расширение из миграции ставится в одну схему на всю базу (см. testsupport),
-- и есть ли оно в управляемом кластере, миграция знать не может. md5 есть
-- везде. Биты версии и варианта выставлены как у UUID v3 (RFC 4122).
--
-- Все операторы повторяемы.

CREATE OR REPLACE FUNCTION recipe_product_id(version_id UUID) RETURNS UUID
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT encode(
               set_byte(set_byte(h, 6, (get_byte(h, 6) & 15) | 48),
                        8, (get_byte(h, 8) & 63) | 128),
               'hex')::uuid
    FROM (SELECT decode(md5('recipe-product:' || version_id::text), 'hex') AS h) s
$$;

-- ---------------------------------------------------------------------------
-- Источник 'recipe'
--
-- Ограничение объявлено в 005 прямо у колонки, и его имя — то, что выдал
-- Postgres. Ищется по определению, а не по имени: так снимается и
-- автоматическое, и уже заменённое этой миграцией.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'food_items'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%source%'
    LOOP
        EXECUTE format('ALTER TABLE food_items DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

ALTER TABLE food_items ADD CONSTRAINT food_items_source_check
    CHECK (source IN ('database', 'usda', 'openfoodfacts', 'user', 'recipe'));

-- ---------------------------------------------------------------------------
-- Продукты версий, одобренных до этой миграции
--
-- И заменённых тоже: блюдо сохранённого плана ссылается на версию, которая
-- могла устареть до развёртывания, и записать его без продукта нельзя.
-- Вес порции по умолчанию — вес порции рецепта; serving_unit — код 'g'
-- (миграция 061).
-- ---------------------------------------------------------------------------
INSERT INTO food_items (id, name, category, serving_size, serving_unit,
                        calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
                        source, verified, default_weight, created_at, updated_at)
SELECT recipe_product_id(v.id), v.name, 'Блюда',
       COALESCE(NULLIF(v.portion_grams, 0), 100), 'g',
       v.kcal_100, v.protein_100, v.fat_100, v.carbs_100,
       'recipe', true, NULLIF(v.portion_grams, 0), NOW(), NOW()
FROM recipe_versions v
WHERE v.state IN ('approved', 'superseded')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Связь блюда плана с записью дневника
--
-- SET NULL: удаление записи в дневнике само возвращает блюдо в несъеденные,
-- без кода в food-tracker. Съеденный вес читается из записи соединением,
-- поэтому правка веса в дневнике видна плану без синхронизации.
-- ---------------------------------------------------------------------------
ALTER TABLE meal_plan_items
    ADD COLUMN IF NOT EXISTS food_entry_id UUID REFERENCES food_entries(id) ON DELETE SET NULL;

-- Удаление записи дневника ищет ссылающиеся блюда.
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_food_entry
    ON meal_plan_items (food_entry_id) WHERE food_entry_id IS NOT NULL;
