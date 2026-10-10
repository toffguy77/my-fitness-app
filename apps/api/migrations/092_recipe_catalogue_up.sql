-- ============================================================================
-- Миграция 092: каталог рецептов и пищевые ограничения клиента
-- ============================================================================
--
-- Рецепт живёт версиями: клиент видит только одобренную куратором, а правка
-- одобренного рецепта создаёт новую версию, чтобы до её одобрения клиенты
-- видели прежнюю (и чтобы записи дневника из будущего plan-diary-logging
-- ссылались на неизменное).
--
-- Ингредиент ссылается на food_items (UUID) — тот же путь, что у записей
-- дневника. food_id пуст только у черновика из импорта, пока человек не
-- подтвердил продукт; отправка на проверку этого не пропускает.
--
-- КБЖУ в версии — кэш вычисления по каталогу, пересчитываемый при каждом
-- сохранении черновика. Одобренная версия неизменна, кэш не устаревает.
--
-- Ограничения клиента — четыре таблицы, по которым правило доступности
-- (internal/shared/recipeaccess) отсекает рецепты.
--
-- Все операторы повторяемы: IF NOT EXISTS у таблиц и индексов.

CREATE TABLE IF NOT EXISTS recipes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status      TEXT NOT NULL DEFAULT 'published'
                CHECK (status IN ('published', 'unpublished')),
    source      TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual', 'vkusvill')),
    -- Идентификатор рецепта у источника; уникальность делает импорт
    -- идемпотентным.
    source_ref  TEXT UNIQUE,
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipes_created_by
    ON recipes (created_by) WHERE created_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS recipe_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    version         INT  NOT NULL CHECK (version >= 1),
    state           TEXT NOT NULL DEFAULT 'draft'
                    CHECK (state IN ('draft', 'review', 'approved', 'superseded')),

    name            TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    photo_key       TEXT,
    cook_minutes    INT  NOT NULL DEFAULT 0 CHECK (cook_minutes >= 0),
    complexity      TEXT NOT NULL DEFAULT 'easy'
                    CHECK (complexity IN ('easy', 'medium', 'hard')),
    servings        INT  NOT NULL DEFAULT 1 CHECK (servings >= 1),
    yield_grams     NUMERIC(10,2) CHECK (yield_grams IS NULL OR yield_grams > 0),
    meal_types      TEXT[] NOT NULL DEFAULT '{}'
                    CHECK (meal_types <@ ARRAY['breakfast','lunch','dinner','snack']::TEXT[]),
    tags            TEXT[] NOT NULL DEFAULT '{}',
    allergens       TEXT[] NOT NULL DEFAULT '{}'
                    CHECK (allergens <@ ARRAY['nuts','peanuts','gluten','lactose','eggs','fish',
                                              'seafood','soy','sesame','mustard','celery']::TEXT[]),

    -- Кэш вычисления (recipes/nutrition.go), не ввод.
    kcal_100        NUMERIC(10,2) NOT NULL DEFAULT 0,
    protein_100     NUMERIC(10,2) NOT NULL DEFAULT 0,
    fat_100         NUMERIC(10,2) NOT NULL DEFAULT 0,
    carbs_100       NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_grams     NUMERIC(10,2) NOT NULL DEFAULT 0,
    portion_grams   NUMERIC(10,2) NOT NULL DEFAULT 0,
    approximate     BOOLEAN NOT NULL DEFAULT true,

    review_comment  TEXT,
    edited_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    approved_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (recipe_id, version)
);

-- Не больше одной версии в работе и не больше одной одобренной на рецепт.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_versions_working
    ON recipe_versions (recipe_id) WHERE state IN ('draft', 'review');
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_versions_approved
    ON recipe_versions (recipe_id) WHERE state = 'approved';

CREATE INDEX IF NOT EXISTS idx_recipe_versions_edited_by
    ON recipe_versions (edited_by) WHERE edited_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipe_versions_approved_by
    ON recipe_versions (approved_by) WHERE approved_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS recipe_steps (
    version_id  UUID NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
    position    INT  NOT NULL CHECK (position >= 1),
    text        TEXT NOT NULL,
    photo_key   TEXT,
    PRIMARY KEY (version_id, position)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    version_id        UUID NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
    position          INT  NOT NULL CHECK (position >= 1),
    food_id           UUID REFERENCES food_items(id),
    -- Исходное название из импорта; подсказка, пока продукт не подтверждён.
    source_name       TEXT,
    grams             NUMERIC(10,2) CHECK (grams IS NULL OR grams > 0),
    display_quantity  TEXT,
    to_taste          BOOLEAN NOT NULL DEFAULT false,
    -- Кандидаты из каталога, найденные при импорте: [{food_id, name, default_weight}].
    candidates        JSONB,
    PRIMARY KEY (version_id, position),
    -- «По вкусу» веса не имеет и в расчёт не входит.
    CHECK (NOT to_taste OR grams IS NULL),
    -- Ингредиент без продукта допустим только с исходным названием.
    CHECK (food_id IS NOT NULL OR source_name IS NOT NULL)
);

-- Правило доступности ищет рецепты по исключённым продуктам.
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_food
    ON recipe_ingredients (food_id) WHERE food_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Ограничения клиента
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_food_restrictions (
    user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    allergens   TEXT[] NOT NULL DEFAULT '{}'
                CHECK (allergens <@ ARRAY['nuts','peanuts','gluten','lactose','eggs','fish',
                                          'seafood','soy','sesame','mustard','celery']::TEXT[]),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_excluded_foods (
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    food_id     UUID   NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, food_id)
);

CREATE INDEX IF NOT EXISTS idx_user_excluded_foods_food
    ON user_excluded_foods (food_id);

CREATE TABLE IF NOT EXISTS user_rejected_recipes (
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id   UUID   NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_user_rejected_recipes_recipe
    ON user_rejected_recipes (recipe_id);

CREATE TABLE IF NOT EXISTS client_hidden_recipes (
    client_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id   UUID   NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    hidden_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (client_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_client_hidden_recipes_recipe
    ON client_hidden_recipes (recipe_id);
CREATE INDEX IF NOT EXISTS idx_client_hidden_recipes_hidden_by
    ON client_hidden_recipes (hidden_by) WHERE hidden_by IS NOT NULL;
