package leads

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/burcev/api/internal/modules/notifications"
)

// Оповещение о заявке на куратора.
//
// Заявка лежала в очереди и ждала, пока кто-нибудь туда заглянет. Никто не
// заглядывал: единственная настоящая заявка за две недели пролежала неделю без
// ответа, и об этом узнали из аналитики. Очередь осталась одним местом, где
// заявку берут в работу, — оповещение лишь зовёт туда людей.
//
// Зовёт двумя путями, потому что ни один не надёжен в одиночку:
//
//   - в общую ленту группы кураторов — её видят все, кто может ответить, и
//     ничего не нужно настраивать каждому;
//   - уведомлением суперадминам — назначает куратора именно суперадмин, а
//     уведомление доходит до него письмом или push, даже если Telegram у него
//     не привязан.

// OperatorNotifier создаёт уведомление. Узко намеренно: заявкам нужно поднять
// уведомление, а не знать, как уведомления устроены.
type OperatorNotifier interface {
	CreateNotification(ctx context.Context, notification *notifications.Notification) error
	LanguageOf(ctx context.Context, userID int64) string
}

// GroupAnnouncer пишет в общую ленту группы кураторов.
type GroupAnnouncer interface {
	Announce(ctx context.Context, text string) error
}

// CuratorRequestRaiseAfter — сколько заявка может пролежать необработанной,
// прежде чем о ней напомнят ещё раз.
//
// Четыре часа: человек, нажавший «хочу куратора», ждёт ответа в тот же день.
// Значение по умолчанию, а не закон — пересматривать по первым живым заявкам.
const CuratorRequestRaiseAfter = 4 * time.Hour

// curatorRequestSteps — шаги, на которых строка очереди является заявкой на
// куратора: просьба вошедшего человека и форма гостя на странице тарифов.
var curatorRequestSteps = []string{"curator_request", "pricing"}

func isCuratorRequestStep(step string) bool {
	for _, s := range curatorRequestSteps {
		if s == step {
			return true
		}
	}
	return false
}

// WithOperatorAlerts подключает оповещение. Любой из двух путей может быть nil —
// тогда работает оставшийся; без обоих заявка по-прежнему попадает в очередь.
func (s *Service) WithOperatorAlerts(notifier OperatorNotifier, group GroupAnnouncer, appURL string) *Service {
	s.notifier = notifier
	s.group = group
	s.appURL = appURL
	return s
}

// curatorRequest — то, что нужно сказать о заявке.
type curatorRequest struct {
	LeadID        string
	Email         string
	Name          string
	CaptureSource string
	// UserID непуст, когда просит уже зарегистрированный человек.
	UserID *int64
}

// who — как назвать человека в оповещении.
func (r curatorRequest) who() string {
	name := strings.TrimSpace(r.Name)
	var b strings.Builder
	if name != "" {
		b.WriteString(name)
		b.WriteString(" ")
	}
	b.WriteString("<" + r.Email + ">")
	if r.UserID != nil {
		fmt.Fprintf(&b, ", клиент №%d", *r.UserID)
	} else {
		b.WriteString(", ещё не зарегистрирован")
	}
	return b.String()
}

func sourceLabel(captureSource string) string {
	switch captureSource {
	case CaptureCuratorOfferChat:
		return "предложение куратора в чате"
	case CaptureCuratorOfferDashboard:
		return "предложение куратора на главной"
	case CapturePricingPage:
		return "страница тарифов"
	}
	return captureSource
}

// announce зовёт людей к заявке.
//
// Ошибки пишутся в журнал, а не возвращаются: заявка уже сохранена, и отказывать
// человеку из-за того, что Telegram не ответил, — неверный размен.
func (s *Service) announce(ctx context.Context, req curatorRequest, waiting time.Duration) {
	if s.notifier == nil && s.group == nil {
		return
	}

	queue := s.appURL + "/curator/leads"
	var groupText string
	if waiting == 0 {
		groupText = fmt.Sprintf("Заявка на куратора\n%s\nОткуда: %s\nВзять в работу: %s",
			req.who(), sourceLabel(req.CaptureSource), queue)
	} else {
		groupText = fmt.Sprintf("Заявку на куратора никто не взял за %s\n%s\nОткуда: %s\nВзять в работу: %s",
			waitingLabel(waiting), req.who(), sourceLabel(req.CaptureSource), queue)
	}

	if s.group != nil {
		if err := s.group.Announce(ctx, groupText); err != nil {
			s.log.Errorw("Не удалось сообщить группе кураторов о заявке",
				"lead_id", req.LeadID, "error", fmt.Sprint(err))
		}
	}

	if s.notifier == nil {
		return
	}
	admins, err := s.superAdmins(ctx)
	if err != nil {
		s.log.Errorw("Не удалось перечислить суперадминов для заявки",
			"lead_id", req.LeadID, "error", fmt.Sprint(err))
		return
	}
	if len(admins) == 0 && s.group == nil {
		// Заявка, о которой некому сказать, — заявка, на которую не ответят.
		s.log.Warnw("Заявка на куратора, и сообщить о ней некому", "lead_id", req.LeadID)
		return
	}

	code := notifications.TextCuratorRequested
	if waiting != 0 {
		code = notifications.TextCuratorWaiting
	}
	actionURL := "/curator/leads"
	for _, adminID := range admins {
		title, content := notifications.Text(s.notifier.LanguageOf(ctx, adminID), code,
			map[string]string{"who": req.who()})
		if err := s.notifier.CreateNotification(ctx, &notifications.Notification{
			UserID:    adminID,
			Category:  notifications.CategoryMain,
			Type:      notifications.TypeCuratorRequested,
			Title:     title,
			Content:   content,
			ActionURL: &actionURL,
		}); err != nil {
			s.log.Errorw("Не удалось уведомить суперадмина о заявке",
				"lead_id", req.LeadID, "admin_id", adminID, "error", fmt.Sprint(err))
		}
	}
}

func waitingLabel(d time.Duration) string {
	if hours := int(d.Hours()); hours >= 1 {
		return fmt.Sprintf("%d ч", hours)
	}
	return fmt.Sprintf("%d мин", int(d.Minutes()))
}

func (s *Service) superAdmins(ctx context.Context) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id FROM users
		  WHERE role = 'super_admin' AND deleted_at IS NULL AND deletion_requested_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// RaiseUnhandledCuratorRequests напоминает о заявках, которые никто не взял.
//
// Взятой считается отмеченная в очереди (`handled_at`): заявка, на которую
// «посмотрели», для человека неотличима от забытой.
//
// Напоминает один раз на заявку — отсюда `curator_request_raised_at`.
func (s *Service) RaiseUnhandledCuratorRequests(ctx context.Context, after time.Duration) (int, error) {
	if s.notifier == nil && s.group == nil {
		return 0, nil
	}

	rows, err := s.db.QueryContext(ctx, `
		UPDATE leads l
		   SET curator_request_raised_at = NOW()
		 WHERE l.handled_at IS NULL
		   AND l.curator_request_raised_at IS NULL
		   AND l.curator_requested_at < NOW() - $1::interval
		RETURNING l.id, l.email, COALESCE(l.name, ''), COALESCE(l.capture_source, ''),
		          EXTRACT(EPOCH FROM NOW() - l.curator_requested_at)::bigint,
		          (SELECT u.id FROM users u
		            WHERE lower(u.email) = l.email AND u.deleted_at IS NULL
		            LIMIT 1)`,
		intervalOf(after))
	if err != nil {
		return 0, fmt.Errorf("find unhandled curator requests: %w", err)
	}
	defer func() { _ = rows.Close() }()

	type pending struct {
		req     curatorRequest
		waiting time.Duration
	}
	var raised []pending
	for rows.Next() {
		var (
			p       pending
			seconds int64
		)
		if err := rows.Scan(&p.req.LeadID, &p.req.Email, &p.req.Name, &p.req.CaptureSource,
			&seconds, &p.req.UserID); err != nil {
			return 0, fmt.Errorf("read an unhandled curator request: %w", err)
		}
		p.waiting = time.Duration(seconds) * time.Second
		raised = append(raised, p)
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("read unhandled curator requests: %w", err)
	}
	// Оповещение — после того, как курсор закрыт: оно само ходит в базу.
	_ = rows.Close()

	for _, p := range raised {
		s.announce(ctx, p.req, p.waiting)
	}
	return len(raised), nil
}
