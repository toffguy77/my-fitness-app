-- Rollback: clear default names and avatars for users who have default SVG avatars.
-- Only clears users whose avatar_url matches the default pattern.
UPDATE users
SET
    name = NULL,
    avatar_url = NULL,
    updated_at = NOW()
WHERE avatar_url LIKE '/avatars/default/%.svg';
