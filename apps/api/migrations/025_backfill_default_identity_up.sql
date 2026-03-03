-- Backfill default name and avatar for existing users without a name.
-- Replicates the Go generateDefaultIdentity logic:
--   color = defaultColors[id % 10]
--   animal = defaultAnimals[(id / 10) % 12]
--   name = color || ' ' || animal
--   avatar_url = '/avatars/default/' || animalFile || '.svg'

WITH colors AS (
    SELECT unnest(ARRAY[
        'Синий', 'Зелёный', 'Красный', 'Оранжевый', 'Фиолетовый',
        'Золотой', 'Серебряный', 'Бирюзовый', 'Розовый', 'Белый'
    ]) AS name, generate_series(0, 9) AS idx
),
animals AS (
    SELECT unnest(ARRAY[
        'Кот', 'Ёж', 'Лис', 'Медведь', 'Волк', 'Тигр',
        'Сокол', 'Дельфин', 'Панда', 'Кролик', 'Лев', 'Олень'
    ]) AS name, unnest(ARRAY[
        'cat', 'hedgehog', 'fox', 'bear', 'wolf', 'tiger',
        'falcon', 'dolphin', 'panda', 'rabbit', 'lion', 'deer'
    ]) AS file, generate_series(0, 11) AS idx
),
identity AS (
    SELECT
        u.id,
        c.name || ' ' || a.name AS default_name,
        '/avatars/default/' || a.file || '.svg' AS default_avatar
    FROM users u
    JOIN colors c ON c.idx = u.id % 10
    JOIN animals a ON a.idx = (u.id / 10) % 12
    WHERE COALESCE(TRIM(u.name), '') = ''
)
UPDATE users
SET
    name = identity.default_name,
    avatar_url = COALESCE(users.avatar_url, identity.default_avatar),
    updated_at = NOW()
FROM identity
WHERE users.id = identity.id;
