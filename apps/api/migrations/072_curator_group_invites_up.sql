-- Приглашения в группу кураторов.
--
-- Ссылка хранится по двум причинам. Первая: куратору без привязки Telegram
-- написать нельзя — бот не пишет первым, — и ссылку надо показать в профиле.
-- Вторая: без хранения на каждый заход выпускалась бы новая, и в группе копился
-- бы хвост действующих приглашений, каждое из которых — вход в переписку с
-- клиентами.
--
-- joined_at отвечает на вопрос, который иначе не отличить: приглашение не дошло
-- или человек его не открыл.
CREATE TABLE IF NOT EXISTS curator_group_invites (
  user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  invite_link TEXT NOT NULL,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at   TIMESTAMPTZ
);

COMMENT ON TABLE curator_group_invites IS 'Персональные приглашения в группу кураторов';
COMMENT ON COLUMN curator_group_invites.joined_at IS 'Когда вступил; пусто — приглашение не открыто';
