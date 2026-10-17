-- Уведомление об отзыве куратора вело на /dashboard/weekly-reports/<id>/feedback,
-- а страницы по этому адресу нет и не было: каждое такое уведомление открывало
-- 404. Отзыв показывает дашборд по параметру ?report=<id>, и новые уведомления
-- ведут туда (curator.FeedbackActionURL). Здесь переписываются уже выданные.
--
-- Только данные: схема не меняется. Повторный прогон ничего не находит.
UPDATE notifications
SET action_url = regexp_replace(
        action_url,
        '^/dashboard/weekly-reports/([^/?#]+)/feedback$',
        '/dashboard?report=\1')
WHERE action_url ~ '^/dashboard/weekly-reports/[^/?#]+/feedback$';
