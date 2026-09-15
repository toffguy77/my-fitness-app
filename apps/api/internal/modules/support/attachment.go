package support

import (
	"context"
	"errors"
	"fmt"

	"github.com/burcev/api/internal/shared/upload"
)

// Attachment — файл, присланный клиентом боту.
type Attachment struct {
	ChatID   int64
	FileID   string
	FileName string
	Caption  string
}

// MediaBridge — то, что мосту поручается делать с файлами.
type MediaBridge interface {
	SaveIncoming(ctx context.Context, clientID int64, fileID, fileName string) (string, upload.Kind, error)
	RelayFileFromTelegram(ctx context.Context, clientID int64, displayName, key string, kind upload.Kind, caption string) error
	StoreOnPlatform(ctx context.Context, clientID int64, key string, kind upload.Kind, caption string) error
}

// WithMedia подключает работу с вложениями.
func (s *Service) WithMedia(media MediaBridge) *Service {
	s.media = media
	return s
}

// HandleAttachment принимает файл от клиента.
//
// Любой исход, кроме успеха, заканчивается словами человеку. Молчание в ответ
// на отправленную фотографию — то, что происходило раньше, и оно читается как
// поломка.
func (s *Service) HandleAttachment(ctx context.Context, in Attachment) error {
	conversation, err := s.conversationFor(ctx, IncomingMessage{ChatID: in.ChatID})
	if err != nil {
		return fmt.Errorf("resolve conversation: %w", err)
	}

	if s.media == nil {
		return nil
	}
	if conversation.UserID == nil {
		// До регистрации вложение некуда положить: у человека нет ни карточки,
		// ни переписки с куратором.
		return s.reply(ctx, conversation, attachmentsNeedAccountReply)
	}

	key, kind, err := s.media.SaveIncoming(ctx, *conversation.UserID, in.FileID, in.FileName)
	if err != nil {
		if errors.Is(err, upload.ErrHEIC) {
			return s.reply(ctx, conversation, err.Error())
		}
		s.log.Error("Не удалось принять вложение", "error", err, "conversation_id", conversation.ID)
		return s.reply(ctx, conversation, attachmentFailedReply)
	}

	if err := s.media.StoreOnPlatform(ctx, *conversation.UserID, key, kind, in.Caption); err != nil {
		s.log.Error("Не удалось положить вложение в переписку платформы",
			"error", err, "conversation_id", conversation.ID)
	}
	if err := s.media.RelayFileFromTelegram(ctx, *conversation.UserID, "", key, kind, in.Caption); err != nil {
		s.log.Error("Не удалось перенести вложение в тему",
			"error", err, "conversation_id", conversation.ID)
	}

	return s.reply(ctx, conversation, attachmentAcceptedReply)
}

// Что бот отвечает на вложение.
//
// Каждый исход назван: человек, отправивший фотографию, должен понять, что с
// ней стало.
const (
	attachmentAcceptedReply = "Фото получил, передал куратору."
	attachmentsOffReply     = "Пока не могу принимать вложения: хранилище не настроено. " +
		"Опишите, пожалуйста, словами — я передам."
	attachmentsNeedAccountReply = "Чтобы отправить фото, нужен аккаунт: без него его некуда положить. " +
		"Напишите вопрос словами, и я передам его человеку."
	attachmentFailedReply = "Не смог сохранить файл. Попробуйте ещё раз или опишите словами."
)
