package support

import (
	"context"
	"strings"
)

// LinkRedeemer гасит билет привязки Telegram.
//
// Узкий интерфейс: поддержке незачем знать, как привязка устроена.
type LinkRedeemer interface {
	Redeem(ctx context.Context, ticket string, chatID int64, username string) (int64, error)
}

// WithLinks подключает привязку. Без неё `/start` работает как раньше.
func (s *Service) WithLinks(links LinkRedeemer) *Service {
	s.links = links
	return s
}

// startPayload достаёт параметр из `/start <что-то>`.
func startPayload(text string) (string, bool) {
	trimmed := strings.TrimSpace(text)
	if !strings.HasPrefix(trimmed, "/start") {
		return "", false
	}
	payload := strings.TrimSpace(strings.TrimPrefix(trimmed, "/start"))
	if payload == "" {
		return "", false
	}
	return payload, true
}

// redeemLink пытается погасить билет привязки.
//
// Второе возвращаемое значение говорит, обработано ли сообщение: билет лида
// выглядит так же, и если это не наш билет, обработка идёт дальше обычным путём.
func (s *Service) redeemLink(ctx context.Context, in IncomingMessage, payload string) (bool, error) {
	if _, err := s.links.Redeem(ctx, payload, in.ChatID, in.Username); err != nil {
		// Не наш билет — молча отдаём дальше: это может быть ссылка
		// «продолжить регистрацию», и отказывать в ней нельзя.
		return false, nil
	}

	s.log.Info("Telegram привязан к учётной записи", "chat_id", in.ChatID)
	// Ответ идёт мимо переписки поддержки: обращения тут нет и быть не должно.
	return true, s.sender.SendMessage(ctx, in.ChatID, linkedReply)
}

// linkedReply — что человек видит после привязки.
const linkedReply = "Telegram подключён. Теперь уведомления будут приходить и сюда.\n\n" +
	"Отключить можно в профиле: Настройки → Уведомления."
