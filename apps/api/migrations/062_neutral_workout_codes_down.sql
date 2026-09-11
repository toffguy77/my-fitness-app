-- Обратно в русские названия. Произвольный текст так же не трогается.

WITH rebuilt AS (
    SELECT dm.id,
           string_agg(
               CASE btrim(split_part(seg, ':', 1))
                   WHEN 'strength'   THEN 'Силовая'
                   WHEN 'cardio'     THEN 'Кардио'
                   WHEN 'yoga'       THEN 'Йога'
                   WHEN 'hiit'       THEN 'HIIT'
                   WHEN 'stretching' THEN 'Растяжка'
                   WHEN 'swimming'   THEN 'Плавание'
                   WHEN 'running'    THEN 'Бег'
                   WHEN 'cycling'    THEN 'Велосипед'
                   WHEN 'other'      THEN 'Другое'
                   ELSE btrim(split_part(seg, ':', 1))
               END
               || CASE WHEN strpos(seg, ':') > 0
                       THEN ':' || btrim(split_part(seg, ':', 2))
                       ELSE '' END,
               ',' ORDER BY ord
           ) AS value
    FROM daily_metrics dm,
         LATERAL unnest(string_to_array(dm.workout_type, ',')) WITH ORDINALITY AS t(seg, ord)
    WHERE dm.workout_type IS NOT NULL AND btrim(dm.workout_type) <> ''
    GROUP BY dm.id
)
UPDATE daily_metrics dm
SET workout_type = rebuilt.value
FROM rebuilt
WHERE dm.id = rebuilt.id
  AND dm.workout_type IS DISTINCT FROM rebuilt.value;
