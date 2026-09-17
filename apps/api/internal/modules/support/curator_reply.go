package support

import (
	"context"
	"fmt"
)

// CuratorReply — ответ, написанный куратором в теме форума.
type CuratorReply struct {
	// ThreadID — тема, то есть клиент.
	ThreadID int64
	// ReplyToMessageID непуст, когда куратор ответил на конкретное сообщение.
	// Это единственный точный способ сказать, в какой канал вернуть ответ.
	ReplyToMessageID int64
	// TelegramUserID — кто написал. Нужен, чтобы записать автора на платформе.
	TelegramUserID int64
	Text           string
	// FileID непуст, когда куратор отправил фотографию или файл.
	FileID   string
	FileName string
}

// Bridge — то, что мосту нужно уметь. Интерфейс узкий: поддержке незачем знать,
// как устроены темы.
type Bridge interface {
	TargetForReply(ctx context.Context, threadID, replyToMessageID int64) (clientID int64, toTelegram bool, ok bool, err error)
	// RelayFromTelegram переносит вопрос клиента, заданный боту, в тему куратора.
	RelayFromTelegram(ctx context.Context, clientID int64, displayName, text string) error
}

// Delivery доставляет ответ куратора туда, где человек его ждёт.
type Delivery interface {
	// ToPlatform кладёт ответ в переписку платформы от имени куратора.
	ToPlatform(ctx context.Context, clientID, curatorID int64, text string) error
}

// WithBridge подключает мост. Без него ответы из группы никуда не идут.
func (s *Service) WithBridge(bridge Bridge, delivery Delivery, curators CuratorResolver) *Service {
	s.bridge = bridge
	s.delivery = delivery
	s.curators = curators
	return s
}

// CuratorResolver превращает Telegram-идентификатор в учётную запись.
type CuratorResolver interface {
	ByTelegramChat(ctx context.Context, telegramUserID int64) (int64, bool, error)
}

// HandleCuratorReply возвращает ответ куратора клиенту — в тот канал, где он
// его ждёт.
//
// Ответ не дублируется в оба канала: один ответ дважды — это переписка, в
// которой человек перестаёт понимать, где он находится.
func (s *Service) HandleCuratorReply(ctx context.Context, reply CuratorReply) error {
	if s.bridge == nil {
		return nil
	}

	clientID, toTelegram, ok, err := s.bridge.TargetForReply(ctx, reply.ThreadID, reply.ReplyToMessageID)
	if err != nil {
		return fmt.Errorf("resolve reply target: %w", err)
	}
	if !ok {
		// Сообщение в теме, за которой никого нет: служебная переписка
		// кураторов между собой. Молчим, а не гадаем.
		return nil
	}

	// Вложение от куратора: сохраняем у себя и отдаём клиенту ссылкой.
	// Пересылать чужой file_id нельзя — он привязан к боту и чату.
	if reply.FileID != "" && s.media != nil {
		key, kind, err := s.media.SaveIncoming(ctx, clientID, reply.FileID, reply.FileName)
		if err != nil {
			return fmt.Errorf("сохранить вложение куратора: %w", err)
		}
		if err := s.media.StoreOnPlatform(ctx, clientID, key, kind, reply.Text); err != nil {
			s.log.Error("Не удалось положить вложение куратора в переписку",
				"error", err, "client_id", clientID)
		}
		if !toTelegram {
			return nil
		}
	}

	var curatorID int64
	if s.curators != nil {
		if id, found, err := s.curators.ByTelegramChat(ctx, reply.TelegramUserID); err == nil && found {
			curatorID = id
		}
	}

	if toTelegram {
		return s.answerClientInTelegram(ctx, clientID, curatorID, reply.Text)
	}
	if s.delivery == nil {
		return fmt.Errorf("ответ некуда доставить: чат платформы не подключён")
	}
	return s.delivery.ToPlatform(ctx, clientID, curatorID, reply.Text)
}

// answerClientInTelegram отправляет ответ в обращение клиента.
func (s *Service) answerClientInTelegram(ctx context.Context, clientID, curatorID int64, text string) error {
	var conversationID string
	err := s.db.QueryRowContext(ctx,
		`SELECT id FROM support_conversations WHERE user_id = $1
		  ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, clientID).Scan(&conversationID)
	if err != nil {
		return fmt.Errorf("find the client's conversation: %w", err)
	}
	// Автор может быть неизвестен: куратор отвечает из группы, а свой аккаунт к
	// боту мог не привязывать. Ноль вместо идентификатора внешний ключ не
	// примет — ответ просто не запишется, и человек его не получит.
	if curatorID == 0 {
		return s.answerAsUnknown(ctx, conversationID, text)
	}
	return s.AnswerAsOperator(ctx, conversationID, curatorID, text)
}

// GroupMembership — то, что поддержке нужно от состава группы.
type GroupMembership interface {
	OnJoinRequest(ctx context.Context, telegramUserID int64, username string) error
}

// WithMembership подключает решение по заявкам на вступление.
func (s *Service) WithMembership(members GroupMembership) *Service {
	s.membership = members
	return s
}

// HandleJoinRequest решает судьбу заявки в группу кураторов.
//
// Чужая группа игнорируется: бот может состоять в нескольких, и решать за них
// он не вправе.
func (s *Service) HandleJoinRequest(ctx context.Context, chatID, telegramUserID int64, username string) error {
	if s.membership == nil {
		return nil
	}
	if s.groupID != 0 && chatID != s.groupID {
		s.log.Info("Заявка в постороннюю группу оставлена без решения", "chat_id", chatID)
		return nil
	}
	return s.membership.OnJoinRequest(ctx, telegramUserID, username)
}

// WithGroup задаёт группу кураторов, заявки которой нас касаются.
func (s *Service) WithGroup(groupID int64) *Service {
	s.groupID = groupID
	return s
}
