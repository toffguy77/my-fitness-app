package supportbridge

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/burcev/api/internal/shared/telegram"
)

// Состав группы кураторов следует за ролями в базе.
//
// Роль и список участников — два независимых списка, и вручную они расходятся в
// первый же месяц. В группу зеркалится переписка с клиентами, поэтому лишний
// участник — это доступ к чужим разговорам, а не беспорядок.
//
// Добавить человека в группу бот не может: такого метода в Bot API нет.
// Поэтому приглашение — персональная ссылка-заявка, а вступление одобряет бот,
// сверившись с ролью. Удаление, в отличие от добавления, полностью
// автоматическое.

// Membership — то, что умеет Telegram в части состава.
type Membership interface {
	CreateInviteLink(ctx context.Context, chatID int64, name string) (telegram.InviteLink, error)
	ApproveJoinRequest(ctx context.Context, chatID, userID int64) error
	DeclineJoinRequest(ctx context.Context, chatID, userID int64) error
	RemoveMember(ctx context.Context, chatID, userID int64) error
	Administrators(ctx context.Context, chatID int64) ([]telegram.Member, error)
}

// Messenger отправляет личное сообщение.
type Messenger interface {
	SendMessage(ctx context.Context, chatID int64, text string) error
}

// WithMembership подключает работу с составом группы.
func (s *Service) WithMembership(members Membership, messenger Messenger) *Service {
	s.members = members
	s.messenger = messenger
	return s
}

// belongsInGroup отвечает, место ли человеку в группе.
//
// Кураторы и администраторы — и только пока их учётная запись жива. Человек,
// запросивший удаление, уже уходит: доступ к переписке ему больше не нужен.
func (s *Service) belongsInGroup(ctx context.Context, userID int64) (bool, error) {
	var ok bool
	err := s.db.QueryRowContext(ctx, `
		SELECT role IN ('coordinator', 'super_admin')
		   AND deleted_at IS NULL
		   AND deletion_requested_at IS NULL
		  FROM users WHERE id = $1`, userID).Scan(&ok)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check group membership: %w", err)
	}
	return ok, nil
}

// InviteFor выдаёт человеку приглашение и запоминает его.
//
// Ссылка персональная: общая ссылка группы расходится, и кто её передал —
// уже не узнать. Повторный вызов отдаёт прежнюю ссылку, а не плодит новую:
// каждая действующая ссылка — это вход в переписку с клиентами.
func (s *Service) InviteFor(ctx context.Context, userID int64, name string) (string, error) {
	if !s.membershipEnabled() {
		return "", nil
	}

	var link string
	err := s.db.QueryRowContext(ctx,
		`SELECT invite_link FROM curator_group_invites WHERE user_id = $1`, userID).Scan(&link)
	if err == nil {
		return link, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("look up invite: %w", err)
	}

	created, err := s.members.CreateInviteLink(ctx, s.groupID, name)
	if err != nil {
		return "", fmt.Errorf("create invite: %w", err)
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO curator_group_invites (user_id, invite_link)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET invite_link = EXCLUDED.invite_link,
		                                    issued_at = NOW(), joined_at = NULL`,
		userID, created.URL); err != nil {
		return "", fmt.Errorf("store invite: %w", err)
	}
	return created.URL, nil
}

// OnRoleGranted зовётся, когда человек стал куратором.
//
// Привязан Telegram — приглашение уходит в личный чат. Не привязан — ссылка
// остаётся в профиле: боту некуда писать, он не пишет первым.
func (s *Service) OnRoleGranted(ctx context.Context, userID int64, name string) error {
	if !s.membershipEnabled() {
		return nil
	}

	link, err := s.InviteFor(ctx, userID, name)
	if err != nil || link == "" {
		return err
	}

	chatID, linked, err := s.chatIDOf(ctx, userID)
	if err != nil || !linked {
		// Не ошибка: ссылку человек возьмёт в профиле.
		return err
	}
	if s.messenger == nil {
		return nil
	}
	return s.messenger.SendMessage(ctx, chatID, invitationText+"\n\n"+link)
}

// OnTelegramLinked зовётся, когда человек подключил бота.
//
// Возвращает, куратор ли это. Ответ нужен поддержке, чтобы не слать куратору
// руководство клиента: его рабочее место — кураторский раздел, и «как вести
// дневник питания» ему не про него.
//
// Смена роли и подключение бота идут в любом порядке. Если роль дали раньше,
// OnRoleGranted писать было некуда — бот не пишет первым, — и приглашение
// осталось ждать в профиле, где его никто не искал. Человек, только что
// нажавший «Старт», как раз там, где сообщение дойдёт.
//
// Уже вошедшему в группу не пишем: приглашение ему больше ни к чему, а
// повторное сообщение после отвязки и новой привязки выглядело бы сбоем.
// Куратором он при этом остаётся — руководство клиента ему всё равно не идёт.
func (s *Service) OnTelegramLinked(ctx context.Context, userID int64) (bool, error) {
	curator, err := s.belongsInGroup(ctx, userID)
	if err != nil || !curator {
		return false, err
	}
	if !s.membershipEnabled() {
		return true, nil
	}

	var joined bool
	err = s.db.QueryRowContext(ctx,
		`SELECT joined_at IS NOT NULL FROM curator_group_invites WHERE user_id = $1`,
		userID).Scan(&joined)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return true, fmt.Errorf("check invite state: %w", err)
	}
	if joined {
		return true, nil
	}

	var name string
	if err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(name, '') FROM users WHERE id = $1`, userID).Scan(&name); err != nil {
		return true, fmt.Errorf("look up name: %w", err)
	}

	return true, s.OnRoleGranted(ctx, userID, name)
}

// OnRoleRevoked убирает человека из группы.
//
// Сразу, не дожидаясь сверки: ушедший куратор, остающийся в группе даже на
// день, продолжает видеть переписку с клиентами, которых больше не ведёт.
func (s *Service) OnRoleRevoked(ctx context.Context, userID int64) error {
	if !s.membershipEnabled() {
		return nil
	}

	chatID, linked, err := s.chatIDOf(ctx, userID)
	if err != nil {
		return err
	}

	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM curator_group_invites WHERE user_id = $1`, userID); err != nil {
		s.log.Errorw("Не удалось убрать приглашение", "error", err, "user_id", userID)
	}

	if !linked {
		// Его Telegram нам неизвестен — удалить некого. Найдёт сверка по
		// составу группы, если он в ней есть.
		return nil
	}
	if err := s.members.RemoveMember(ctx, s.groupID, chatID); err != nil {
		return fmt.Errorf("remove from group: %w", err)
	}
	return nil
}

// OnJoinRequest решает судьбу заявки на вступление.
//
// Решение принимается по привязке Telegram, а не по имени: имя человек выбирает
// сам, и совпадение по нему — совпадение по строке.
func (s *Service) OnJoinRequest(ctx context.Context, telegramUserID int64, username string) error {
	if !s.membershipEnabled() {
		return nil
	}

	userID, linked, err := s.userByChat(ctx, telegramUserID)
	if err != nil {
		return err
	}

	allowed := false
	if linked {
		if allowed, err = s.belongsInGroup(ctx, userID); err != nil {
			return err
		}
	}

	if !allowed {
		s.log.Warnw("Отклонена заявка в группу кураторов",
			"telegram_user_id", telegramUserID, "username", username,
			"привязан", linked)
		return s.members.DeclineJoinRequest(ctx, s.groupID, telegramUserID)
	}

	if err := s.members.ApproveJoinRequest(ctx, s.groupID, telegramUserID); err != nil {
		return fmt.Errorf("approve join request: %w", err)
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE curator_group_invites SET joined_at = NOW() WHERE user_id = $1`, userID); err != nil {
		s.log.Errorw("Не удалось отметить вступление", "error", err, "user_id", userID)
	}
	return nil
}

func (s *Service) membershipEnabled() bool {
	return s != nil && s.groupID != 0 && s.members != nil
}

func (s *Service) chatIDOf(ctx context.Context, userID int64) (int64, bool, error) {
	var chatID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT chat_id FROM telegram_links WHERE user_id = $1`, userID).Scan(&chatID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("look up telegram link: %w", err)
	}
	return chatID, true, nil
}

func (s *Service) userByChat(ctx context.Context, chatID int64) (int64, bool, error) {
	var userID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT user_id FROM telegram_links WHERE chat_id = $1`, chatID).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("look up account by chat: %w", err)
	}
	return userID, true, nil
}

// invitationText — что человек видит вместе со ссылкой.
//
// Руководство названо ссылкой, а не пересказом: пересказ в сообщении устареет
// молча, а по ссылке всегда лежит то, что в `main`. Репозиторий открыт —
// учётная запись GitHub читателю не нужна.
const invitationText = "Вы назначены куратором. Вот ссылка в рабочую группу — " +
	"в ней у каждого клиента своя тема.\n\n" +
	"Ссылка личная и работает один раз.\n\n" +
	"С чего начать — здесь: " + CuratorGuideURL

// CuratorGuideURL — приглашение куратору в репозитории.
//
// Публичная ссылка на `main`: у куратора нет ни репозитория, ни доступа к
// внутренним путям, а руководство меняется вместе с продуктом.
//
// Путь закодирован процентами, хотя GitHub понимает и кириллицу как есть.
// Причина в получателе: бот шлёт обычный текст (parse_mode не задан — см.
// telegram.Client.SendMessage), и ссылку клиент выделяет сам. Где именно он
// оборвёт кириллический путь, зависит от клиента, а оборванная ссылка ведёт
// в никуда молча. Некрасиво, зато нажимается везде.
const CuratorGuideURL = "https://github.com/toffguy77/my-fitness-app/blob/main/docs/curator-guide/00-%D0%BF%D1%80%D0%B8%D0%B3%D0%BB%D0%B0%D1%88%D0%B5%D0%BD%D0%B8%D0%B5-%D0%BA%D1%83%D1%80%D0%B0%D1%82%D0%BE%D1%80%D1%83.md"

// Reconcile сверяет состав группы с ролями.
//
// Существует не вместо реакции на смену роли, а на случаи мимо неё: правка роли
// прямо в базе, человек вышел сам, бота не было в сети.
//
// **Ничего не удаляет, когда не видит состав.** Обратное поведение — считать
// недоступность пустой группой — однажды вычистит её целиком из-за сетевого
// отказа, и восстановить состав будет нечем: бот не умеет добавлять людей.
func (s *Service) Reconcile(ctx context.Context) (int, error) {
	if !s.membershipEnabled() {
		return 0, nil
	}

	members, err := s.members.Administrators(ctx, s.groupID)
	if err != nil {
		return 0, fmt.Errorf("состав группы недоступен, сверка не проводилась: %w", err)
	}

	removed := 0
	for _, m := range members {
		if m.IsBot {
			continue
		}
		if m.IsOwner() {
			// Владельца бот удалить не может, и это норма: группу завёл человек.
			continue
		}

		userID, linked, err := s.userByChat(ctx, m.UserID)
		if err != nil {
			return removed, err
		}

		belongs := false
		if linked {
			if belongs, err = s.belongsInGroup(ctx, userID); err != nil {
				return removed, err
			}
		}
		if belongs {
			continue
		}

		if err := s.members.RemoveMember(ctx, s.groupID, m.UserID); err != nil {
			// Сверка обязана сообщать о том, чего не смогла: молчаливая сверка
			// бесполезна — группа с посторонним выглядит как группа без него.
			s.log.Warnw("Не удалось удалить постороннего из группы кураторов",
				"telegram_user_id", m.UserID, "username", m.Username, "error", err)
			continue
		}
		s.log.Infow("Посторонний удалён из группы кураторов",
			"telegram_user_id", m.UserID, "username", m.Username, "привязан", linked)
		removed++
	}

	s.reportMissing(ctx, members)
	return removed, nil
}

// reportMissing сообщает о кураторах, которых в группе нет.
//
// Затащить их бот не может, поэтому единственное, что здесь уместно, — сказать.
func (s *Service) reportMissing(ctx context.Context, members []telegram.Member) {
	inside := make(map[int64]struct{}, len(members))
	for _, m := range members {
		inside[m.UserID] = struct{}{}
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, COALESCE(u.name, ''), l.chat_id
		  FROM users u LEFT JOIN telegram_links l ON l.user_id = u.id
		 WHERE u.role IN ('coordinator', 'super_admin')
		   AND u.deleted_at IS NULL AND u.deletion_requested_at IS NULL`)
	if err != nil {
		s.log.Errorw("Не удалось перечислить кураторов для сверки", "error", err)
		return
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		var userID int64
		var name string
		var chatID sql.NullInt64
		if err := rows.Scan(&userID, &name, &chatID); err != nil {
			s.log.Errorw("Не удалось прочитать куратора", "error", err)
			return
		}
		if !chatID.Valid {
			s.log.Warnw("Куратор не привязал Telegram — пригласить его некуда",
				"user_id", userID, "имя", name)
			continue
		}
		if _, ok := inside[chatID.Int64]; !ok {
			s.log.Warnw("Куратора нет в группе — вступить он должен сам",
				"user_id", userID, "имя", name)
		}
	}
	if err := rows.Err(); err != nil {
		s.log.Errorw("Не удалось дочитать список кураторов", "error", err)
	}
}

// InviteLinkFor отдаёт приглашение человеку, которому оно положено.
//
// Пустая строка означает «не положено» — роли нет либо группа не настроена.
// Отличать эти два случая наружу незачем.
func (s *Service) InviteLinkFor(ctx context.Context, userID int64) (string, error) {
	if !s.membershipEnabled() {
		return "", nil
	}
	belongs, err := s.belongsInGroup(ctx, userID)
	if err != nil || !belongs {
		return "", err
	}

	var name string
	if err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(name, '') FROM users WHERE id = $1`, userID).Scan(&name); err != nil {
		return "", fmt.Errorf("read name for invite: %w", err)
	}
	return s.InviteFor(ctx, userID, name)
}
