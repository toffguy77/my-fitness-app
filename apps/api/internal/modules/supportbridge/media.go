package supportbridge

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/burcev/api/internal/shared/upload"
)

// Медиа в обе стороны.
//
// Сегодня бот фотографии игнорирует: в обработчике написано «nothing to
// answer». Клиент отправляет фото еды и получает тишину — не отказ, не «не
// умею», ничего. Отсюда правило: молчание в ответ на отправленный файл
// недопустимо, даже когда хранилище выключено.

// FileStore — хранилище вложений. Узко намеренно.
type FileStore interface {
	UploadFile(ctx context.Context, key string, data io.Reader, contentType string, size int64) (string, error)
	GetSignedURL(ctx context.Context, key string, expiration time.Duration) (string, error)
}

// Downloader забирает присланный файл у Telegram.
type Downloader interface {
	DownloadFile(ctx context.Context, fileID string) ([]byte, error)
}

// ErrStorageOff возвращается, когда хранилище не настроено.
//
// Отдельная ошибка, а не общая: человеку надо сказать, что случилось, а не
// промолчать и не свалить в «что-то пошло не так».
var ErrStorageOff = errors.New("хранилище вложений не настроено")

// WithMedia подключает приём и отправку файлов.
func (s *Service) WithMedia(store FileStore, downloader Downloader) *Service {
	s.store = store
	s.downloader = downloader
	return s
}

// SaveIncoming принимает файл от клиента и возвращает ключ и тип.
//
// Тип определяется по байтам, а не по имени и не по заявленному Telegram:
// заявленное задаёт отправитель, и он может ошибиться или солгать.
func (s *Service) SaveIncoming(ctx context.Context, clientID int64, fileID, fileName string) (key string, kind upload.Kind, err error) {
	if s.store == nil || s.downloader == nil {
		return "", "", ErrStorageOff
	}

	data, err := s.downloader.DownloadFile(ctx, fileID)
	if err != nil {
		return "", "", fmt.Errorf("забрать файл у Telegram: %w", err)
	}

	kind, err = upload.Detect(data)
	if err != nil {
		// Сюда попадает и снимок с iPhone: upload.ErrHEIC объясняет, что делать,
		// вместо «неподдерживаемый тип файла».
		return "", "", err
	}

	if fileName == "" {
		fileName = "file"
	}
	key = fmt.Sprintf("support/%d/%d-%s", clientID, time.Now().UnixNano(), fileName)
	if _, err := s.store.UploadFile(ctx, key, bytes.NewReader(data), string(kind), int64(len(data))); err != nil {
		return "", "", fmt.Errorf("сохранить вложение: %w", err)
	}
	return key, kind, nil
}

// RelayFile переносит вложение клиента в тему куратора.
func (s *Service) RelayFile(ctx context.Context, clientID int64, displayName string, source Source, key string, kind upload.Kind, caption string) error {
	if !s.Enabled() || s.store == nil {
		return nil
	}

	threadID, err := s.topicFor(ctx, clientID, displayName)
	if err != nil {
		return err
	}

	url, err := s.store.GetSignedURL(ctx, key, time.Hour)
	if err != nil {
		return fmt.Errorf("ссылка на вложение: %w", err)
	}

	text := fmt.Sprintf("[%s] %s\n%s\n\n%s/curator/clients/%d",
		source, caption, url, s.appURL, clientID)
	messageID, err := s.sender.SendToTopic(ctx, s.groupID, threadID, text)
	if err != nil {
		return fmt.Errorf("relay file to topic: %w", err)
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO support_relays (group_message_id, client_id, source)
		VALUES ($1, $2, $3) ON CONFLICT (group_message_id) DO NOTHING`,
		messageID, clientID, source.code()); err != nil {
		s.log.Errorw("Не удалось запомнить зеркалированное вложение",
			"error", err, "client_id", clientID)
	}
	return nil
}

// RelayFileFromTelegram — форма RelayFile для поддержки.
func (s *Service) RelayFileFromTelegram(ctx context.Context, clientID int64, displayName, key string, kind upload.Kind, caption string) error {
	return s.RelayFile(ctx, clientID, displayName, SourceTelegram, key, kind, caption)
}

// StoreOnPlatform кладёт вложение в переписку платформы.
//
// Без этого фотография, отправленная боту, в приложении не появилась бы —
// и переписка у клиента снова распалась бы надвое.
func (s *Service) StoreOnPlatform(ctx context.Context, clientID int64, key string, kind upload.Kind, caption string) error {
	if s.platform == nil {
		return nil
	}
	messageType := "file"
	if kind != upload.KindPDF {
		messageType = "image"
	}
	return s.platform.Attach(ctx, clientID, messageType, key, caption)
}

// PlatformAttacher кладёт вложение в переписку платформы.
type PlatformAttacher interface {
	Attach(ctx context.Context, clientID int64, messageType, key, caption string) error
}

// WithPlatform подключает запись вложений в переписку платформы.
func (s *Service) WithPlatform(platform PlatformAttacher) *Service {
	s.platform = platform
	return s
}
