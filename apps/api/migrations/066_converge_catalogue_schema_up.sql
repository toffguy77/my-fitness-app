-- Свести описание схемы с тем, что на самом деле есть на живых средах.
--
-- Каталог еды залили в базу до того, как появились миграции. Миграция 005
-- создаёт products через CREATE TABLE IF NOT EXISTS — и на dev и на проде она
-- молча не сделала ничего, записавшись применённой. Так репозиторий и жил с
-- описанием, которого нигде нет: таблиц categories и nutrients в миграциях не
-- было вовсе, а полнотекстовый индекс поиска еды существовал только на живых
-- средах. Собранный по миграциям сервис работал, но искал перебором по сорока
-- трём тысячам продуктов, и любая будущая миграция против products рисковала
-- упасть на проде.
--
-- Направление сведения — к живой схеме: там настоящие данные и настоящие
-- инварианты, репозиторию о них просто не рассказали. Обратное направление
-- означало бы удалить с прода 340 тысяч строк нутриентов ради опрятности.
--
-- Всё идемпотентно: на пустой базе создаёт, на живой дополняет.

-- --------------------------------------------------------------------------
-- Категории каталога
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    type       TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'health-diet'
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_type_check') THEN
        ALTER TABLE categories ADD CONSTRAINT categories_type_check
            CHECK (type = ANY (ARRAY['food', 'meal', 'globus', 'av', 'vkusvill']));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_categories_source ON categories(source);

-- --------------------------------------------------------------------------
-- Продукты: столбцы импорта, которых не знали миграции
-- --------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_url          TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS water               NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_weight      NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_weight_unit TEXT DEFAULT 'г';
-- barcode, наоборот, был только в миграциях: индекс на него существует с 005.
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode             TEXT;

-- Источник записи обязателен: по нему поиск отличает выверенный каталог от
-- всего остального и ранжирует. NULL здесь — запись, которую негде поставить.
UPDATE products SET source = 'database' WHERE source IS NULL;
ALTER TABLE products ALTER COLUMN source SET DEFAULT 'database';
ALTER TABLE products ALTER COLUMN source SET NOT NULL;

-- --------------------------------------------------------------------------
-- Единый тип идентификаторов
--
-- На живых средах каталог пришёл с integer, миграции объявляли BIGSERIAL.
-- Сводим к bigint: это выбор миграции 005, и он правильный. Сорок три тысячи
-- продуктов и триста сорок тысяч нутриентов переписываются за секунды, а
-- миграции идут до того, как сервер начинает слушать.
-- --------------------------------------------------------------------------
ALTER TABLE categories ALTER COLUMN id TYPE BIGINT;
ALTER SEQUENCE IF EXISTS categories_id_seq AS BIGINT;

ALTER TABLE products ALTER COLUMN id TYPE BIGINT;
ALTER TABLE products ALTER COLUMN category_id TYPE BIGINT;
ALTER SEQUENCE IF EXISTS products_id_seq AS BIGINT;

-- --------------------------------------------------------------------------
-- Нутриенты: витамины и минералы по каждому продукту
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nutrients (
    id                 BIGSERIAL PRIMARY KEY,
    product_id         BIGINT NOT NULL REFERENCES products(id),
    nutrient_name      TEXT NOT NULL,
    nutrient_group     TEXT NOT NULL,
    amount             NUMERIC,
    unit               TEXT NOT NULL,
    daily_norm_percent NUMERIC
);

ALTER TABLE nutrients ALTER COLUMN id TYPE BIGINT;
ALTER TABLE nutrients ALTER COLUMN product_id TYPE BIGINT;
ALTER SEQUENCE IF EXISTS nutrients_id_seq AS BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nutrients_nutrient_group_check') THEN
        ALTER TABLE nutrients ADD CONSTRAINT nutrients_nutrient_group_check
            CHECK (nutrient_group = ANY (ARRAY['vitamin', 'mineral', 'amino_acid',
                                               'fatty_acid', 'carb_profile', 'sterol']));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nutrients_product_id_fkey') THEN
        ALTER TABLE nutrients ADD CONSTRAINT nutrients_product_id_fkey
            FOREIGN KEY (product_id) REFERENCES products(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nutrients_product ON nutrients(product_id);
CREATE INDEX IF NOT EXISTS idx_nutrients_group   ON nutrients(nutrient_group);

-- --------------------------------------------------------------------------
-- Связь продукта с категорией
--
-- На живых средах она есть и обязательна: у каждого продукта каталога есть
-- категория. Ослаблять её ради учебных записей в пустой базе — значит менять
-- прод под тест; сеятель вместо этого заводит себе категорию.
-- --------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_category_id_fkey') THEN
        ALTER TABLE products ADD CONSTRAINT products_category_id_fkey
            FOREIGN KEY (category_id) REFERENCES categories(id);
    END IF;
END $$;

-- Только когда нечему мешать: на живой среде NULL нет, на пустой нет строк.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM products WHERE category_id IS NULL) THEN
        ALTER TABLE products ALTER COLUMN category_id SET NOT NULL;
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- Индексы поиска
--
-- Полнотекстовый по названию — тот самый, которого не было в миграциях. Без
-- него поиск еды перебирает сорок три тысячи строк на каждый запрос.
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_name
    ON products USING gin (to_tsvector('russian', name));
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_source   ON products(source);

-- --------------------------------------------------------------------------
-- Прочее, разошедшееся тем же путём
-- --------------------------------------------------------------------------
ALTER TABLE food_items ADD COLUMN IF NOT EXISTS default_weight      NUMERIC;
ALTER TABLE food_items ADD COLUMN IF NOT EXISTS default_weight_unit TEXT DEFAULT 'г';

-- Удаление автора должно уносить его сообщения. На живых средах связь стоит
-- без ON DELETE CASCADE, и удаление пользователя там упёрлось бы в неё.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
