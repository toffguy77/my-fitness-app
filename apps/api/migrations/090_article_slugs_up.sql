-- Migration: Readable article addresses
-- Version: 090
--
-- Articles were addressed by UUID: /content/f914ec19-c67f-... says nothing to
-- a reader or to search. A slug is assigned when an article is created (see
-- content.Slugify) and does not change once the article is published.
--
-- The articles that already exist get one here, from their titles. The
-- function below repeats content.Slugify; slug_migration_integration_test.go
-- runs both over the same titles. It lives in pg_temp and is gone when the
-- migration's session ends: after this, only the Go side assigns slugs.

ALTER TABLE articles ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE FUNCTION pg_temp.slugify_090(title TEXT) RETURNS TEXT AS $$
DECLARE
  s TEXT;
  cut TEXT;
BEGIN
  -- Explicit rather than lower(): lower() follows the database's locale, and
  -- under "C" it leaves Cyrillic alone.
  s := translate(title,
    'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя');
  s := lower(s);
  -- Signs join their neighbours: "подъезд" is one word.
  s := translate(s, 'ъь', '');
  s := replace(s, 'щ', 'shch');
  s := replace(s, 'ж', 'zh');
  s := replace(s, 'х', 'kh');
  s := replace(s, 'ц', 'ts');
  s := replace(s, 'ч', 'ch');
  s := replace(s, 'ш', 'sh');
  s := replace(s, 'ю', 'yu');
  s := replace(s, 'я', 'ya');
  s := translate(s, 'абвгдеёзийклмнопрстуфыэ', 'abvgdeeziyklmnoprstufye');
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');

  IF length(s) > 80 THEN
    cut := left(s, 80);
    IF substr(s, 81, 1) <> '-' AND position('-' IN cut) > 0 THEN
      cut := regexp_replace(cut, '-[^-]*$', '');
    END IF;
    s := regexp_replace(cut, '-+$', '');
  END IF;

  IF s = '' THEN
    s := 'statya';
  END IF;
  RETURN s;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Repeats get -2, -3 in order of publication, so the earliest article keeps
-- the plain address. The base is shortened to keep the whole within 80.
WITH based AS (
  SELECT id, pg_temp.slugify_090(title) AS base,
         ROW_NUMBER() OVER (
           PARTITION BY pg_temp.slugify_090(title)
           ORDER BY published_at NULLS LAST, created_at, id
         ) AS n
  FROM articles
  WHERE slug IS NULL
)
UPDATE articles a
SET slug = CASE
  WHEN b.n = 1 THEN b.base
  ELSE regexp_replace(left(b.base, 80 - length('-' || b.n)), '-+$', '') || '-' || b.n
END
FROM based b
WHERE a.id = b.id;

ALTER TABLE articles ALTER COLUMN slug SET NOT NULL;
ALTER TABLE articles ADD CONSTRAINT articles_slug_key UNIQUE (slug);
