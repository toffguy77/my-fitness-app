# Запросы к своей базе

Выполнять через `scripts/db.sh`. По умолчанию он ходит в **dev** — это годится,
чтобы проверить сам запрос. Для настоящих чисел нужен прод:
`BURCEV_DB_ENV=prod`.

Четыре отчёта ниже живут ещё и в `docs/analytics/reports.sql` — там их
канонический вид. Здесь они с пояснением, когда какой уместен.

Везде считаются **люди**, а не события: один человек, открывший посадочную
десять раз, — это один, а не десять. Отсюда `DISTINCT` почти в каждой строке.

## Воронка входа

Главный отчёт. Читается не как набор итогов, а как места, где люди
останавливаются.

```sql
SELECT date_trunc('week', occurred_at)::date AS неделя,
       COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'landing_viewed')          AS посадочная,
       COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'onboarding_started')      AS мастер,
       COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'onboarding_result_shown') AS результат,
       COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'lead_saved')              AS контакт,
       COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'registered')              AS регистрация
FROM analytics_events
WHERE occurred_at >= NOW() - INTERVAL '90 days'
GROUP BY 1 ORDER BY 1 DESC;
```

Называя долю перехода между двумя шагами, обязательно приводи оба абсолютных
числа. «Из мастера до результата доходит половина» на четырёх людях — это
двое, и решение на этом строить нельзя.

## Где отваливаются в мастере

```sql
SELECT properties ->> 'step' AS шаг,
       COUNT(DISTINCT visitor_id) AS дошло
FROM analytics_events
WHERE name = 'onboarding_step_completed'
  AND occurred_at >= NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 2 DESC;
```

Шаг с резким провалом относительно предыдущего — кандидат на переделку. Но
сначала проверь, не единичные ли это числа.

## Активация: регистрация что-то значила?

Доля зарегистрировавшихся, сделавших первую запись о еде за сутки. Одно число,
которое отвечает, была ли регистрация началом чего-то.

```sql
WITH reg AS (
    SELECT user_id, MIN(occurred_at) AS registered_at
    FROM analytics_events WHERE name = 'registered' AND user_id IS NOT NULL
    GROUP BY user_id
), first_entry AS (
    SELECT user_id, MIN(occurred_at) AS first_at
    FROM analytics_events
    WHERE name IN ('first_food_entry', 'food_entry_created') AND user_id IS NOT NULL
    GROUP BY user_id
)
SELECT date_trunc('week', r.registered_at)::date AS когорта,
       COUNT(*) AS зарегистрировалось,
       COUNT(*) FILTER (WHERE f.first_at <= r.registered_at + INTERVAL '24 hours') AS активировалось
FROM reg r LEFT JOIN first_entry f USING (user_id)
GROUP BY 1 ORDER BY 1 DESC;
```

Процент тут считай сам и только если в когорте есть хотя бы пара десятков
человек. Иначе называй два числа и всё.

## Удержание по когортам

```sql
WITH cohorts AS (
    SELECT user_id, date_trunc('week', MIN(occurred_at))::date AS когорта,
           MIN(occurred_at) AS joined_at
    FROM analytics_events WHERE user_id IS NOT NULL GROUP BY user_id
), activity AS (
    SELECT DISTINCT user_id, date_trunc('day', occurred_at) AS day
    FROM analytics_events WHERE user_id IS NOT NULL
)
SELECT c.когорта,
       COUNT(DISTINCT c.user_id) AS размер,
       COUNT(DISTINCT c.user_id) FILTER (WHERE a.day = date_trunc('day', c.joined_at) + INTERVAL '1 day')  AS день_1,
       COUNT(DISTINCT c.user_id) FILTER (WHERE a.day = date_trunc('day', c.joined_at) + INTERVAL '7 days') AS день_7
FROM cohorts c LEFT JOIN activity a USING (user_id)
GROUP BY 1 ORDER BY 1 DESC;
```

## Из какой кампании приходят те, кто доходит

Единственное место, где рекламный источник встречается с поведением.

```sql
SELECT COALESCE(NULLIF(utm_source, ''), '(прямой заход)') AS источник,
       COALESCE(NULLIF(utm_campaign, ''), '—')            AS кампания,
       COUNT(*)                                            AS заявок,
       COUNT(*) FILTER (WHERE last_step = 'contact')       AS дошли_до_контакта,
       COUNT(*) FILTER (WHERE contact_consent)             AS можно_писать
FROM leads
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

`contact_consent` важен не как метрика: без него писать человеку нельзя, и
заявка годится только для счёта.

## Где оставляют контакт

Появилось три места: шаг мастера, экран результата, разговор с ботом.

```sql
SELECT COALESCE(capture_source, 'contact_step') AS где,
       COUNT(*) AS заявок
FROM leads
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 2 DESC;
```

## Глубина прочтения посадочной

Замена карте скроллинга, которой больше нет.

```sql
SELECT (properties ->> 'depth')::int AS порог,
       COUNT(DISTINCT visitor_id)    AS дочитали
FROM analytics_events
WHERE name = 'landing_scroll_depth'
  AND occurred_at >= NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 1;
```

Числа убывают по порогам; интересен не каждый в отдельности, а где происходит
обрыв.

## Проверка эффекта выкатки

Один и тот же запрос на двух окнах равной длины, до и после даты. Перед тем
как сравнивать:

- Убедись, что окно **не пересекает 2026-09-24** — до этой даты данные
  засорены прогонами тестов.
- Возьми окна одинаковой длины и по возможности одинаковые по дням недели.
- Назови абсолютные числа обоих окон. Если хоть одно меньше пары десятков —
  ответ «рано судить», и это полноценный ответ.

```sql
SELECT CASE WHEN occurred_at < DATE '2026-10-01' THEN 'до' ELSE 'после' END AS окно,
       COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'onboarding_started') AS начали,
       COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'lead_saved')         AS оставили_контакт
FROM analytics_events
WHERE occurred_at >= DATE '2026-10-01' - INTERVAL '14 days'
  AND occurred_at <  DATE '2026-10-01' + INTERVAL '14 days'
GROUP BY 1;
```

Дату подставляй фактическую — здесь она для примера.

## Сколько вообще данных

С этого полезно начинать, когда вопрос про период: сразу видно, есть ли о чём
говорить.

```sql
SELECT MIN(occurred_at)::date AS с, MAX(occurred_at)::date AS по,
       COUNT(*) AS событий, COUNT(DISTINCT visitor_id) AS браузеров,
       COUNT(DISTINCT user_id) AS пользователей
FROM analytics_events;
```
