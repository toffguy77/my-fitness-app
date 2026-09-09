-- Типы тренировок перестают быть русскими словами.
--
-- Та же причина, что и у единиц измерения в миграции 061: колонка хранит
-- значения, а экран печатал их как есть.
--
-- Сложность здесь в том, что в этой же колонке лежит и произвольный текст.
-- Когда человек выбирает «Другое», форма подставляет то, что он написал сам,
-- и «Танцы» — такое же законное содержимое, как «Кардио». Поэтому заменяются
-- только точные совпадения с восемью известными названиями, а всё остальное
-- переносится как есть.
--
-- Формат строки: "тип:минуты" через запятую, минуты необязательны
-- ("Силовая:45,Кардио:30" или "Бег"). Разбирается по сегментам, чтобы не
-- задеть ни длительности, ни чужой текст.

WITH rebuilt AS (
    SELECT dm.id,
           string_agg(
               CASE btrim(split_part(seg, ':', 1))
                   WHEN 'Силовая'    THEN 'strength'
                   WHEN 'Кардио'     THEN 'cardio'
                   WHEN 'Йога'       THEN 'yoga'
                   WHEN 'HIIT'       THEN 'hiit'
                   WHEN 'Растяжка'   THEN 'stretching'
                   WHEN 'Плавание'   THEN 'swimming'
                   WHEN 'Бег'        THEN 'running'
                   WHEN 'Велосипед'  THEN 'cycling'
                   WHEN 'Другое'     THEN 'other'
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
