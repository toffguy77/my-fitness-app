package telegramlink

import (
	"context"
	"fmt"
)

// Delivery отправляет уведомления в привязанный Telegram.
//
// Живёт здесь, а не в notifications: привязка — предмет этого пакета, а
// уведомлениям незачем знать, как она устроена.
type Delivery struct {
	service *Service
	sender  Sender
}

// Sender — то, что умеет отправить сообщение. Узко намеренно.
type Sender interface {
	SendMessage(ctx context.Context, chatID int64, text string) error
}

func NewDelivery(service *Service, sender Sender) *Delivery {
	return &Delivery{service: service, sender: sender}
}

// ChatID возвращает чат человека и признак привязки.
func (d *Delivery) ChatID(ctx context.Context, userID int64) (int64, bool, error) {
	return d.service.ChatID(ctx, userID)
}

// Send отправляет сообщение.
func (d *Delivery) Send(ctx context.Context, chatID int64, text string) error {
	if d.sender == nil {
		return fmt.Errorf("бот не настроен")
	}
	return d.sender.SendMessage(ctx, chatID, text)
}
