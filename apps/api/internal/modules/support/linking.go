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

// LinkedGreeter узнаёт о новой привязке и отвечает, куратор ли это.
//
// Ответ нужен здесь, чтобы не слать куратору руководство клиента: его рабочее
// место — кураторский раздел, и «как вести дневник питания» ему не про него.
// Своё сообщение, со ссылкой на кураторское руководство, он получает от того,
// кто ведёт состав рабочей группы.
type LinkedGreeter interface {
	OnTelegramLinked(ctx context.Context, userID int64) (bool, error)
}

// WithLinks подключает привязку. Без неё `/start` работает как раньше.
func (s *Service) WithLinks(links LinkRedeemer) *Service {
	s.links = links
	return s
}

// WithLinkedGreeter подключает приветствие после привязки.
func (s *Service) WithLinkedGreeter(greeter LinkedGreeter) *Service {
	s.linkedGreeter = greeter
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
	userID, err := s.links.Redeem(ctx, payload, in.ChatID, in.Username)
	if err != nil {
		// Не наш билет — молча отдаём дальше: это может быть ссылка
		// «продолжить регистрацию», и отказывать в ней нельзя.
		return false, nil
	}

	s.log.Info("Telegram привязан к учётной записи", "chat_id", in.ChatID)

	// Куратор получает своё приглашение от ведущего состав группы — со
	// ссылкой на кураторское руководство. Ему же руководство клиента не идёт.
	//
	// Отказ приветствия не отменяет привязку: она уже записана, и молчать в
	// ответ на удачный `/start` значит показать человеку сбой там, где его нет.
	curator := false
	if s.linkedGreeter != nil {
		var err error
		curator, err = s.linkedGreeter.OnTelegramLinked(ctx, userID)
		if err != nil {
			s.log.Error("Не удалось поприветствовать после привязки",
				"error", err, "user_id", userID)
		}
	}

	reply := linkedReply
	if !curator {
		reply += "\n\nС чего начать — здесь: " + UserGuideURL
	}

	// Ответ идёт мимо переписки поддержки: обращения тут нет и быть не должно.
	return true, s.sender.SendMessage(ctx, in.ChatID, reply)
}

// linkedReply — что человек видит после привязки.
const linkedReply = "Telegram подключён. Теперь уведомления будут приходить и сюда.\n\n" +
	"Отключить можно в профиле: Настройки → Уведомления."

// UserGuideURL — руководство пользователя в репозитории.
//
// Ссылкой, а не пересказом: пересказ в сообщении устареет молча, а по ссылке
// всегда то, что в `main`. Репозиторий открыт — учётная запись GitHub не нужна.
//
// Обратный порядок — «завёл аккаунт, когда бот уже запущен» — отдельным
// событием не является: привязка живёт в `telegram_links` с ключом по
// пользователю, то есть раньше учётной записи её не существует. Оба порядка
// приходят сюда, в погашение билета.
// Путь закодирован процентами: бот шлёт обычный текст, ссылку клиент
// выделяет сам, и где он оборвёт кириллический путь — зависит от клиента.
const UserGuideURL = "https://github.com/toffguy77/my-fitness-app/blob/main/docs/user-guide/01-%D0%BD%D0%B0%D1%87%D0%B0%D0%BB%D0%BE-%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%8B.md"
