package curator

import (
	"context"
	"fmt"
	"time"

	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/curatoraccess"
)

// warnBefore — за сколько суток предупреждать об окончании права.
//
// Трое суток: достаточно, чтобы успеть заплатить, и не настолько заранее, чтобы
// предупреждение забылось.
const warnBefore = 3

// AccessEventRecorder записывает прекращение права.
//
// Объявлен здесь как самое узкое, что нужно этому модулю. Прекращение —
// свершившийся факт, и происходит он без участия браузера вовсе: чаще всего
// ночью, задачей.
type AccessEventRecorder interface {
	RecordServerEvent(ctx context.Context, name string, userID int64, properties map[string]any)
}

// WithAccessEvents подключает запись событий. Без неё прекращение работает
// по-прежнему.
func (s *Service) WithAccessEvents(recorder AccessEventRecorder) *Service {
	s.accessEvents = recorder
	return s
}

// ExpireCuratorAccess снимает права, чей последний оплаченный день прошёл, и
// сообщает об этом обеим сторонам.
//
// День берётся по московскому времени: пояс объявлен в публичной оферте, и
// последний день действует целиком.
//
// Уведомление — не любезность. Молча исчезнувший куратор читается как поломка
// сервиса, и человек идёт в поддержку вместо того, чтобы продлить; куратор же,
// не знающий о прекращении, продолжает работу, за которую больше не платят.
//
// Неудача уведомления не отменяет прекращения: право уже снято, и возвращать
// его из-за недоставленного сообщения означало бы отдать платную услугу
// бесплатно. Такие неудачи записываются в журнал и считаются отдельно.
func (s *Service) ExpireCuratorAccess(ctx context.Context) (int, error) {
	expired, err := curatoraccess.Expire(ctx, s.db.DB, curatoraccess.Today())
	if err != nil {
		return 0, err
	}

	for _, e := range expired {
		s.log.Infow("Curator access expired",
			"client_id", e.ClientID, "curator_id", e.CuratorID,
			"expired_on", e.ExpiredOn.Format(time.DateOnly))

		if s.accessEvents != nil {
			s.accessEvents.RecordServerEvent(ctx, "curator_access_ended", e.ClientID,
				map[string]any{"reason": "expired"})
		}

		s.notifyAccessEnded(ctx, e)
	}

	return len(expired), nil
}

// WarnExpiringCuratorAccess предупреждает клиентов, чьё право кончается ровно
// через warnBefore суток.
//
// Ровно через, а не «не позже чем через»: иначе предупреждение уходило бы каждый
// день до самого конца срока и перестало бы читаться.
func (s *Service) WarnExpiringCuratorAccess(ctx context.Context) (int, error) {
	soon, err := curatoraccess.Expiring(ctx, s.db.DB, curatoraccess.Today(), warnBefore)
	if err != nil {
		return 0, err
	}

	warned := 0
	for _, e := range soon {
		if s.notificationsSvc == nil {
			break
		}
		if err := s.notificationsSvc.Notify(ctx, e.ClientID,
			string(notifications.TypeCuratorAccessEnding),
			"Доступ к куратору скоро закончится",
			fmt.Sprintf("Работа с куратором оплачена до %s включительно. Продлите, чтобы продолжить переписку.",
				e.ExpiredOn.Format("02.01.2006")),
			"/pricing"); err != nil {
			s.log.Errorw("Failed to warn about expiring curator access",
				"error", err, "client_id", e.ClientID)
			continue
		}
		warned++
	}

	return warned, nil
}

// notifyAccessEnded сообщает о прекращении клиенту и куратору.
func (s *Service) notifyAccessEnded(ctx context.Context, e curatoraccess.Expiration) {
	if s.notificationsSvc == nil {
		return
	}

	if err := s.notificationsSvc.Notify(ctx, e.ClientID,
		string(notifications.TypeCuratorAccessEnded),
		"Доступ к куратору закончился",
		"Переписка с куратором осталась доступной для чтения. Продлите доступ, чтобы снова писать.",
		"/pricing"); err != nil {
		s.log.Errorw("Failed to notify client about ended curator access",
			"error", err, "client_id", e.ClientID)
	}

	if err := s.notificationsSvc.Notify(ctx, e.CuratorID,
		string(notifications.TypeCuratorAccessEnded),
		"У клиента закончился доступ",
		"Клиент больше не может писать вам, пока не продлит доступ.",
		"/curator/chat"); err != nil {
		s.log.Errorw("Failed to notify curator about ended curator access",
			"error", err, "curator_id", e.CuratorID, "client_id", e.ClientID)
	}
}
