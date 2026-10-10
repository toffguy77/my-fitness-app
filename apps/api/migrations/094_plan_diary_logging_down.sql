-- Откат 094.
--
-- Продукт рецепта, на который есть записи дневника, удалить нельзя
-- (food_entries.food_id — ON DELETE RESTRICT), а удалять записи людей ради
-- отката нельзя тем более. Поэтому удаляются только продукты без записей, и
-- прежнее ограничение источника возвращается, только если продуктов рецептов
-- не осталось; иначе остаётся расширенное.

DROP INDEX IF EXISTS idx_meal_plan_items_food_entry;
ALTER TABLE meal_plan_items DROP COLUMN IF EXISTS food_entry_id;

DELETE FROM food_items fi
WHERE fi.source = 'recipe'
  AND NOT EXISTS (SELECT 1 FROM food_entries e WHERE e.food_id = fi.id)
  AND NOT EXISTS (SELECT 1 FROM user_favorite_foods f WHERE f.food_id = fi.id)
  AND NOT EXISTS (SELECT 1 FROM recipe_ingredients i WHERE i.food_id = fi.id)
  AND NOT EXISTS (SELECT 1 FROM user_excluded_foods x WHERE x.food_id = fi.id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM food_items WHERE source = 'recipe') THEN
        ALTER TABLE food_items DROP CONSTRAINT IF EXISTS food_items_source_check;
        ALTER TABLE food_items ADD CONSTRAINT food_items_source_check
            CHECK (source IN ('database', 'usda', 'openfoodfacts', 'user'));
    END IF;
END $$;

DROP FUNCTION IF EXISTS recipe_product_id(UUID);
