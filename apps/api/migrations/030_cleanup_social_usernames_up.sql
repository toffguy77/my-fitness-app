-- Strip leading @ and whitespace from social usernames
UPDATE user_settings
SET telegram_username = LTRIM(TRIM(telegram_username), '@')
WHERE telegram_username LIKE '@%' OR telegram_username LIKE ' %';

UPDATE user_settings
SET instagram_username = LTRIM(TRIM(instagram_username), '@')
WHERE instagram_username LIKE '@%' OR instagram_username LIKE ' %';
