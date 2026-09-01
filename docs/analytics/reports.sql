-- Product reports.
--
-- Four answers to real questions, kept as queries rather than built into a
-- screen nobody would open. Run them against the application database.
--
-- Every one of them joins on `visitor_id` for the anonymous part of the funnel
-- and on `user_id` afterwards; `analytics_identities` is what makes the two
-- halves the same person.

-- ---------------------------------------------------------------------------
-- 1. Registration funnel: landing page → registration, by week.
--
-- Reads as a conversion, not a set of totals: the point is where people stop.
-- ---------------------------------------------------------------------------
SELECT
    date_trunc('week', occurred_at)                                    AS week,
    COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'landing_viewed')      AS saw_landing,
    COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'onboarding_started')  AS started_onboarding,
    COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'onboarding_result_shown') AS saw_result,
    COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'lead_saved')          AS left_contact,
    COUNT(DISTINCT visitor_id) FILTER (WHERE name = 'registered')          AS registered
FROM analytics_events
WHERE occurred_at >= NOW() - INTERVAL '90 days'
GROUP BY week
ORDER BY week DESC;

-- ---------------------------------------------------------------------------
-- 2. Onboarding funnel: which step loses people.
-- ---------------------------------------------------------------------------
SELECT
    properties ->> 'step'            AS step,
    COUNT(DISTINCT visitor_id)       AS reached
FROM analytics_events
WHERE name = 'onboarding_step_completed'
  AND occurred_at >= NOW() - INTERVAL '30 days'
GROUP BY step
ORDER BY reached DESC;

-- ---------------------------------------------------------------------------
-- 3. Activation: registered accounts that made a food entry within 24 hours.
--
-- The one number that says whether registration meant anything.
-- ---------------------------------------------------------------------------
WITH registrations AS (
    SELECT user_id, MIN(occurred_at) AS registered_at
    FROM analytics_events
    WHERE name = 'registered' AND user_id IS NOT NULL
    GROUP BY user_id
),
first_entries AS (
    SELECT user_id, MIN(occurred_at) AS first_entry_at
    FROM analytics_events
    WHERE name IN ('first_food_entry', 'food_entry_created') AND user_id IS NOT NULL
    GROUP BY user_id
)
SELECT
    date_trunc('week', r.registered_at)                          AS cohort_week,
    COUNT(*)                                                     AS registered,
    COUNT(*) FILTER (
        WHERE f.first_entry_at IS NOT NULL
          AND f.first_entry_at <= r.registered_at + INTERVAL '24 hours'
    )                                                            AS activated,
    ROUND(
        100.0 * COUNT(*) FILTER (
            WHERE f.first_entry_at IS NOT NULL
              AND f.first_entry_at <= r.registered_at + INTERVAL '24 hours'
        ) / NULLIF(COUNT(*), 0),
        1
    )                                                            AS activation_percent
FROM registrations r
LEFT JOIN first_entries f USING (user_id)
GROUP BY cohort_week
ORDER BY cohort_week DESC;

-- ---------------------------------------------------------------------------
-- 4. Retention by weekly cohort: still doing something on days 1, 7 and 30.
-- ---------------------------------------------------------------------------
WITH cohorts AS (
    SELECT user_id,
           date_trunc('week', MIN(occurred_at)) AS cohort_week,
           MIN(occurred_at)                     AS joined_at
    FROM analytics_events
    WHERE user_id IS NOT NULL
    GROUP BY user_id
),
activity AS (
    SELECT DISTINCT user_id, date_trunc('day', occurred_at) AS active_day
    FROM analytics_events
    WHERE user_id IS NOT NULL
)
SELECT
    c.cohort_week,
    COUNT(DISTINCT c.user_id)                                                   AS cohort_size,
    COUNT(DISTINCT c.user_id) FILTER (
        WHERE a.active_day = date_trunc('day', c.joined_at) + INTERVAL '1 day'
    )                                                                           AS day_1,
    COUNT(DISTINCT c.user_id) FILTER (
        WHERE a.active_day = date_trunc('day', c.joined_at) + INTERVAL '7 days'
    )                                                                           AS day_7,
    COUNT(DISTINCT c.user_id) FILTER (
        WHERE a.active_day = date_trunc('day', c.joined_at) + INTERVAL '30 days'
    )                                                                           AS day_30
FROM cohorts c
LEFT JOIN activity a USING (user_id)
GROUP BY c.cohort_week
ORDER BY c.cohort_week DESC;
