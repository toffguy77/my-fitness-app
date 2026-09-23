//go:build integration

package supportbridge_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/burcev/api/internal/modules/supportbridge"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/telegram"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeMembers struct {
	links     int
	approved  []int64
	declined  []int64
	removed   []int64
	admins    []telegram.Member
	adminsErr error
	removeErr error
}

func (f *fakeMembers) CreateInviteLink(_ context.Context, _ int64, name string) (telegram.InviteLink, error) {
	f.links++
	return telegram.InviteLink{URL: fmt.Sprintf("https://t.me/+%s-%d", name, f.links)}, nil
}
func (f *fakeMembers) ApproveJoinRequest(_ context.Context, _, userID int64) error {
	f.approved = append(f.approved, userID)
	return nil
}
func (f *fakeMembers) DeclineJoinRequest(_ context.Context, _, userID int64) error {
	f.declined = append(f.declined, userID)
	return nil
}
func (f *fakeMembers) RemoveMember(_ context.Context, _, userID int64) error {
	if f.removeErr != nil {
		return f.removeErr
	}
	f.removed = append(f.removed, userID)
	return nil
}
func (f *fakeMembers) Administrators(context.Context, int64) ([]telegram.Member, error) {
	return f.admins, f.adminsErr
}

type fakeMessenger struct{ sent []string }

func (f *fakeMessenger) SendMessage(_ context.Context, _ int64, text string) error {
	f.sent = append(f.sent, text)
	return nil
}

func withMembership(t *testing.T, prefix string) (*supportbridge.Service, *database.DB, *fakeMembers, *fakeMessenger) {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, prefix)
	members := &fakeMembers{}
	messenger := &fakeMessenger{}
	s := supportbridge.NewService(db.DB, &noopSender{}, logger.New(), -100390, "https://app.test").
		WithMembership(members, messenger)
	return s, db, members, messenger
}

type noopSender struct{}

func (noopSender) CreateForumTopic(context.Context, int64, string) (int64, error) { return 1, nil }
func (noopSender) CloseForumTopic(context.Context, int64, int64) error            { return nil }
func (noopSender) SendToTopic(context.Context, int64, int64, string) (int64, error) {
	return 1, nil
}
func (noopSender) CheckForum(context.Context, int64) (telegram.ForumState, error) {
	return telegram.ForumState{}, nil
}

func account(t *testing.T, db *database.DB, email, role string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email,password,name,role) VALUES ($1,'x','Человек',$2) RETURNING id`,
		email, role).Scan(&id))
	return id
}

func link(t *testing.T, db *database.DB, userID, chatID int64) {
	t.Helper()
	_, err := db.ExecContext(context.Background(),
		`INSERT INTO telegram_links (user_id, chat_id) VALUES ($1,$2)`, userID, chatID)
	require.NoError(t, err)
}

// Приглашение персональное: общая ссылка расходится, и кто её передал — не
// узнать.
func TestInvitesArePersonal(t *testing.T) {
	s, db, members, _ := withMembership(t, "grp_invite")
	ctx := context.Background()
	first := account(t, db, "первый@e.test", "coordinator")
	second := account(t, db, "второй@e.test", "coordinator")

	a, err := s.InviteFor(ctx, first, "Первый")
	require.NoError(t, err)
	b, err := s.InviteFor(ctx, second, "Второй")
	require.NoError(t, err)

	assert.NotEqual(t, a, b, "двум кураторам выдали одну ссылку")
	assert.Equal(t, 2, members.links)

	// Повторный заход отдаёт прежнюю, а не плодит новую: каждая действующая
	// ссылка — это вход в переписку с клиентами.
	again, err := s.InviteFor(ctx, first, "Первый")
	require.NoError(t, err)
	assert.Equal(t, a, again)
	assert.Equal(t, 2, members.links, "выпустили лишнюю ссылку")
}

// Привязан — приглашение приходит в Telegram. Не привязан — только в профиль.
func TestInvitationGoesToTelegramWhenLinked(t *testing.T) {
	s, db, _, messenger := withMembership(t, "grp_granted")
	ctx := context.Background()

	linked := account(t, db, "привязан@e.test", "coordinator")
	link(t, db, linked, 5001)
	require.NoError(t, s.OnRoleGranted(ctx, linked, "Привязанный"))
	require.Len(t, messenger.sent, 1)
	assert.Contains(t, messenger.sent[0], "https://t.me/+")

	bare := account(t, db, "без@e.test", "coordinator")
	require.NoError(t, s.OnRoleGranted(ctx, bare, "Непривязанный"))
	assert.Len(t, messenger.sent, 1, "боту некуда было писать, а он написал")

	var stored string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT invite_link FROM curator_group_invites WHERE user_id = $1`, bare).Scan(&stored))
	assert.NotEmpty(t, stored, "ссылку негде будет взять в профиле")
}

// Роль снята — человек удаляется сразу.
func TestRevokedRoleRemovesFromGroup(t *testing.T) {
	s, db, members, _ := withMembership(t, "grp_revoke")
	ctx := context.Background()
	id := account(t, db, "ушёл@e.test", "coordinator")
	link(t, db, id, 6001)
	_, err := s.InviteFor(ctx, id, "Ушедший")
	require.NoError(t, err)

	require.NoError(t, s.OnRoleRevoked(ctx, id))

	assert.Equal(t, []int64{6001}, members.removed, "ушедший остался в группе")
	var invites int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM curator_group_invites WHERE user_id = $1`, id).Scan(&invites))
	assert.Zero(t, invites, "приглашение осталось действующим")
}

// Заявка решается по привязке, а не по имени: имя человек выбирает сам.
func TestJoinRequestIsDecidedByTheLink(t *testing.T) {
	s, db, members, _ := withMembership(t, "grp_join")
	ctx := context.Background()

	curator := account(t, db, "куратор@e.test", "coordinator")
	link(t, db, curator, 7001)
	require.NoError(t, s.OnJoinRequest(ctx, 7001, "kurator"))
	assert.Equal(t, []int64{7001}, members.approved)

	// Тот же ник, но привязки нет.
	require.NoError(t, s.OnJoinRequest(ctx, 7002, "kurator"))
	assert.Equal(t, []int64{7002}, members.declined, "впустили по совпадению имени")

	// Привязка есть, но роль клиентская.
	client := account(t, db, "клиент@e.test", "client")
	link(t, db, client, 7003)
	require.NoError(t, s.OnJoinRequest(ctx, 7003, "client"))
	assert.Contains(t, members.declined, int64(7003), "впустили клиента")
}

// Вступление отмечается: иначе «приглашение не дошло» не отличить от «не открыл».
func TestJoinIsRecorded(t *testing.T) {
	s, db, _, _ := withMembership(t, "grp_joined")
	ctx := context.Background()
	id := account(t, db, "вступил@e.test", "coordinator")
	link(t, db, id, 8001)
	_, err := s.InviteFor(ctx, id, "Вступивший")
	require.NoError(t, err)

	require.NoError(t, s.OnJoinRequest(ctx, 8001, "кто-то"))

	var joined *string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT joined_at::text FROM curator_group_invites WHERE user_id = $1`, id).Scan(&joined))
	assert.NotNil(t, joined, "вступление не отмечено")
}

// Сверка убирает посторонних и не трогает владельца.
func TestReconcileRemovesOutsidersButNotTheOwner(t *testing.T) {
	s, db, members, _ := withMembership(t, "grp_reconcile")
	ctx := context.Background()

	curator := account(t, db, "свой@e.test", "coordinator")
	link(t, db, curator, 9001)
	stranger := account(t, db, "чужой@e.test", "client")
	link(t, db, stranger, 9002)

	members.admins = []telegram.Member{
		{UserID: 1, Status: "creator"},                    // владелец
		{UserID: 2, Status: "administrator", IsBot: true}, // сам бот
		{UserID: 9001, Status: "administrator"},           // куратор
		{UserID: 9002, Status: "administrator"},           // клиент — лишний
		{UserID: 9003, Status: "administrator"},           // вообще неизвестный
	}

	removed, err := s.Reconcile(ctx)

	require.NoError(t, err)
	assert.Equal(t, 2, removed)
	assert.ElementsMatch(t, []int64{9002, 9003}, members.removed)
	assert.NotContains(t, members.removed, int64(1), "попробовали удалить владельца")
	assert.NotContains(t, members.removed, int64(2), "попробовали удалить самого бота")
	assert.NotContains(t, members.removed, int64(9001), "удалили действующего куратора")
}

// Состав недоступен — сверка не делает ничего.
//
// Это главное свойство: обратное поведение однажды вычистит группу целиком из-за
// сетевого отказа, а вернуть людей бот не может — добавлять он не умеет.
func TestReconcileRemovesNobodyWhenItCannotSee(t *testing.T) {
	s, db, members, _ := withMembership(t, "grp_blind")
	ctx := context.Background()
	account(t, db, "кто-то@e.test", "coordinator")
	members.adminsErr = fmt.Errorf("chat not found")

	_, err := s.Reconcile(ctx)

	require.Error(t, err)
	assert.Empty(t, members.removed, "сверка вычистила группу, не видя её состава")
}

// Неудача удаления не останавливает сверку и не проглатывается.
func TestReconcileKeepsGoingWhenRemovalFails(t *testing.T) {
	s, db, members, _ := withMembership(t, "grp_stuck")
	ctx := context.Background()
	account(t, db, "кто-то@e.test", "coordinator")
	members.admins = []telegram.Member{{UserID: 9100, Status: "administrator"}}
	members.removeErr = fmt.Errorf("not enough rights")

	removed, err := s.Reconcile(ctx)

	require.NoError(t, err, "сверка упала из-за одного неподдавшегося участника")
	assert.Zero(t, removed)
}

// Без группы состав не ведётся и ничего не ломается.
func TestMembershipDisabled(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "grp_off")
	s := supportbridge.NewService(db.DB, &noopSender{}, logger.New(), 0, "")
	ctx := context.Background()

	link, err := s.InviteFor(ctx, 1, "имя")
	require.NoError(t, err)
	assert.Empty(t, link)
	require.NoError(t, s.OnRoleGranted(ctx, 1, "имя"))
	require.NoError(t, s.OnRoleRevoked(ctx, 1))
	require.NoError(t, s.OnJoinRequest(ctx, 1, "ник"))
	n, err := s.Reconcile(ctx)
	require.NoError(t, err)
	assert.Zero(t, n)
}

// Ссылка в профиле положена куратору и не положена клиенту.
//
// Отличать «не положено» от «группа не настроена» наружу незачем: это подсказка
// о том, кому она положена.
func TestInviteLinkForIsOnlyForCurators(t *testing.T) {
	s, db, _, _ := withMembership(t, "grp_profile")
	ctx := context.Background()

	curator := account(t, db, "кур@e.test", "coordinator")
	link, err := s.InviteLinkFor(ctx, curator)
	require.NoError(t, err)
	assert.NotEmpty(t, link)

	client := account(t, db, "кли@e.test", "client")
	link, err = s.InviteLinkFor(ctx, client)
	require.NoError(t, err)
	assert.Empty(t, link, "клиенту выдали ссылку в рабочую группу")

	// Ожидающий удаления уже уходит: доступ к переписке ему не нужен.
	leaving := account(t, db, "уходит@e.test", "coordinator")
	_, err = db.ExecContext(ctx, `UPDATE users SET deletion_requested_at = NOW() WHERE id = $1`, leaving)
	require.NoError(t, err)
	link, err = s.InviteLinkFor(ctx, leaving)
	require.NoError(t, err)
	assert.Empty(t, link, "уходящему выдали ссылку")
}

// Куратор, подключивший бота после назначения, получает приглашение — и в нём
// ссылку на кураторское руководство.
//
// Смена роли и запуск бота идут в любом порядке. Когда роль дали первой,
// писать было некуда: бот не пишет первым, и приглашение оставалось ждать в
// профиле, где его никто не искал. Момент, когда человек нажал «Старт», —
// единственный, в который сообщение дойдёт.
func TestLinkingAfterRoleSendsTheInvitation(t *testing.T) {
	s, db, members, messenger := withMembership(t, "linked_after_role")
	ctx := context.Background()

	curator := account(t, db, "curator@example.test", "coordinator")
	link(t, db, curator, 777)

	isCurator, err := s.OnTelegramLinked(ctx, curator)
	require.NoError(t, err)
	assert.True(t, isCurator)

	require.Len(t, messenger.sent, 1, "куратор остался без приглашения")
	assert.Contains(t, messenger.sent[0], supportbridge.CuratorGuideURL,
		"в приглашении нет ссылки на руководство куратора")
	assert.Equal(t, 1, members.links, "ссылку в группу не выдали")
}

// Обычный человек кураторским приглашением не тревожится.
func TestLinkingByPlainPersonSendsNothing(t *testing.T) {
	s, db, _, messenger := withMembership(t, "linked_plain")
	ctx := context.Background()

	person := account(t, db, "person@example.test", "client")
	link(t, db, person, 778)

	isCurator, err := s.OnTelegramLinked(ctx, person)
	require.NoError(t, err)
	assert.False(t, isCurator, "обычного человека приняли за куратора")
	assert.Empty(t, messenger.sent)
}

// Вошедшему в группу приглашение второй раз не шлётся.
//
// Иначе отвязка и новая привязка выглядели бы сбоем: человек уже внутри, а
// ему снова предлагают войти по ссылке, которая работает один раз.
func TestLinkingAgainDoesNotRepeatTheInvitation(t *testing.T) {
	s, db, _, messenger := withMembership(t, "linked_twice")
	ctx := context.Background()

	curator := account(t, db, "joined@example.test", "coordinator")
	link(t, db, curator, 779)
	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_group_invites (user_id, invite_link, joined_at)
		 VALUES ($1, 'https://t.me/+уже', NOW())`, curator)
	require.NoError(t, err)

	isCurator, err := s.OnTelegramLinked(ctx, curator)
	require.NoError(t, err)
	assert.True(t, isCurator, "вошедший куратор перестал считаться куратором")
	assert.Empty(t, messenger.sent, "приглашение отправили тому, кто уже в группе")
}
