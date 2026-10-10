-- ============================================================================
-- Откат миграции 092: каталог рецептов и пищевые ограничения клиента
-- ============================================================================
--
-- Порядок обратный зависимостям. Фото рецептов в хранилище откат не трогает:
-- они публичные и не персональные, удалить их можно префиксом recipes/.

DROP TABLE IF EXISTS client_hidden_recipes;
DROP TABLE IF EXISTS user_rejected_recipes;
DROP TABLE IF EXISTS user_excluded_foods;
DROP TABLE IF EXISTS user_food_restrictions;
DROP TABLE IF EXISTS recipe_ingredients;
DROP TABLE IF EXISTS recipe_steps;
DROP TABLE IF EXISTS recipe_versions;
DROP TABLE IF EXISTS recipes;
