-- Фото недели — в неделю с понедельника, как отчёт и весь дашборд.
--
-- До этой миграции загрузка записывала неделю с воскресенья, отсчитанную
-- от времени сервера (week_start — воскресенье), а отчёт искал фото по
-- неделе с понедельника. Проверка «фото недели загружено» не сходилась ни
-- для одного отчёта. Теперь неделя фото — неделя с понедельника,
-- содержащая дату загрузки в часовом поясе профиля, а идентификатор —
-- ISO-неделя этого понедельника («2026-W42»): клиенты считали его по-разному.
--
-- Если в одну неделю попало несколько фото, остаётся последнее загруженное —
-- так же повторная загрузка заменяет фото недели.

CREATE TEMP TABLE weekly_photos_canonical ON COMMIT DROP AS
SELECT p.id,
       w.monday,
       to_char(w.monday, 'IYYY-"W"IW') AS identifier,
       row_number() OVER (
           PARTITION BY p.user_id, w.monday
           ORDER BY p.uploaded_at DESC NULLS LAST, p.created_at DESC NULLS LAST, p.id
       ) AS rank
FROM weekly_photos p
LEFT JOIN user_settings s ON s.user_id = p.user_id
CROSS JOIN LATERAL (
    SELECT date_trunc('week', (COALESCE(p.uploaded_at, p.created_at, now()) AT TIME ZONE
        CASE WHEN s.timezone IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = s.timezone)
             THEN s.timezone ELSE 'Europe/Moscow' END))::date AS monday
) w;

DELETE FROM weekly_photos p
USING weekly_photos_canonical c
WHERE c.id = p.id AND c.rank > 1;

-- Идентификатор уникален в пределах пользователя: сначала временный, иначе
-- обмен идентификаторами двух недель упирается в уникальность посреди UPDATE.
UPDATE weekly_photos p
SET week_identifier = 'migrating-' || p.id::text
FROM weekly_photos_canonical c
WHERE c.id = p.id;

UPDATE weekly_photos p
SET week_start = c.monday,
    week_end = c.monday + 6,
    week_identifier = c.identifier
FROM weekly_photos_canonical c
WHERE c.id = p.id;
