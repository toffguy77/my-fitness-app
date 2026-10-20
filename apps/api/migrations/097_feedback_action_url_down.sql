-- Обратно к прежнему (несуществующему) адресу — только у уведомлений об
-- отзыве: ?report= другим типам не принадлежит, но и трогать их незачем.
UPDATE notifications
SET action_url = regexp_replace(
        action_url,
        '^/dashboard\?report=([^&#]+)$',
        '/dashboard/weekly-reports/\1/feedback')
WHERE type = 'feedback_received'
  AND action_url ~ '^/dashboard\?report=[^&#]+$';
