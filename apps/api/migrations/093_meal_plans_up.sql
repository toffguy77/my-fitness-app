-- ============================================================================
-- Миграция 093: план питания на день
-- ============================================================================
--
-- План — по одному блюду на выбранный приём пищи с подобранным весом. Хранится
-- строками, а не JSONB: следующие изменения (запись плана в дневник, список
-- покупок) ссылаются на отдельные блюда.
--
-- Блюдо хранит версию рецепта, а не только рецепт: план на прошлую дату не
-- меняется от одобрения новой версии. Пересборка и замена берут текущую
-- одобренную.
--
-- План хранит цель, под которую собран: если цель на дату потом изменится,
-- план не перестраивается сам, а ответ помечает это (target_changed).
--
-- Все операторы повторяемы: IF NOT EXISTS у таблиц и индексов.

-- Какие приёмы пищи клиент планирует. Нет строки — все четыре.
CREATE TABLE IF NOT EXISTS meal_plan_settings (
    user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    meal_types  TEXT[] NOT NULL
                CHECK (cardinality(meal_types) > 0
                       AND meal_types <@ ARRAY['breakfast','lunch','dinner','snack']::TEXT[]),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meal_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date            DATE   NOT NULL,
    -- Зерно подбора: повторное открытие читает сохранённый план, а
    -- «пересобрать» записывает новое.
    seed            BIGINT NOT NULL,
    -- Приёмы пищи на момент сборки: настройки могли измениться после.
    meal_types      TEXT[] NOT NULL
                    CHECK (meal_types <@ ARRAY['breakfast','lunch','dinner','snack']::TEXT[]),
    -- Цель, под которую собран план, целыми числами — так же она и
    -- сравнивается с текущей.
    target_kcal     INT NOT NULL,
    target_protein  INT NOT NULL,
    target_fat      INT NOT NULL,
    target_carbs    INT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Закрывает и гонку двух первых открытий: проигравший перечитывает.
    UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS meal_plan_items (
    plan_id            UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    meal_type          TEXT NOT NULL
                       CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
    -- Рецепты не удаляются (каталог общий, стратегия keep), поэтому ссылка без
    -- каскада: если когда-нибудь появится удаление, оно не сотрёт планы молча.
    recipe_id          UUID NOT NULL REFERENCES recipes(id),
    recipe_version_id  UUID NOT NULL REFERENCES recipe_versions(id),
    grams              INT  NOT NULL CHECK (grams > 0 AND grams <= 2000),
    -- Закреплённое блюдо переживает пересборку; вес у него подбирается.
    locked             BOOLEAN NOT NULL DEFAULT false,
    -- Вес задан клиентом и не подбирается до сброса.
    manual_grams       BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (plan_id, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_items_recipe
    ON meal_plan_items (recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_recipe_version
    ON meal_plan_items (recipe_version_id);
