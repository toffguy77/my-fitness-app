//go:build integration

package notifications

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Доставка пушей на настоящей базе, с поддельными Apple и push-сервисом
// браузера. Подделка Apple — HTTP/2 по TLS, как настоящий APNs.

const (
	phoneA = "11111111-1111-4111-8111-111111111111"
	phoneB = "22222222-2222-4222-8222-222222222222"
)

// applePush is one request the fake Apple received.
type applePush struct {
	host    string
	token   string
	proto   int
	header  http.Header
	payload map[string]any
}

func (p applePush) aps() map[string]any { return p.payload["aps"].(map[string]any) }

func (p applePush) isAlert() bool {
	_, ok := p.aps()["alert"]
	return ok
}

// fakeApple answers like APNs. A token's queued statuses are used in turn;
// without one it answers 200.
type fakeApple struct {
	mu       sync.Mutex
	answers  map[string][]int
	received []applePush
}

func (f *fakeApple) handler(host string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.URL.Path, "/3/device/")
		body, _ := io.ReadAll(r.Body)
		var payload map[string]any
		_ = json.Unmarshal(body, &payload)
		f.mu.Lock()
		f.received = append(f.received, applePush{host, token, r.ProtoMajor, r.Header.Clone(), payload})
		status := http.StatusOK
		if queue := f.answers[token]; len(queue) > 0 {
			status, f.answers[token] = queue[0], queue[1:]
		}
		f.mu.Unlock()
		w.WriteHeader(status)
		switch status {
		case http.StatusGone:
			_ = json.NewEncoder(w).Encode(map[string]string{"reason": "Unregistered"})
		case http.StatusBadRequest:
			_ = json.NewEncoder(w).Encode(map[string]string{"reason": "BadDeviceToken"})
		case http.StatusServiceUnavailable:
			_ = json.NewEncoder(w).Encode(map[string]string{"reason": "ServiceUnavailable"})
		}
	}
}

func (f *fakeApple) answer(token string, statuses ...int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.answers[token] = append(f.answers[token], statuses...)
}

func (f *fakeApple) pushes() []applePush {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]applePush(nil), f.received...)
}

func (f *fakeApple) alerts() []applePush {
	out := []applePush{}
	for _, p := range f.pushes() {
		if p.isAlert() {
			out = append(out, p)
		}
	}
	return out
}

func (f *fakeApple) reset() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.received = nil
}

// fakeBrowser is a push service: it counts what it was asked to deliver.
type fakeBrowser struct {
	mu    sync.Mutex
	count int
}

func (f *fakeBrowser) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	f.mu.Lock()
	f.count++
	f.mu.Unlock()
	w.WriteHeader(http.StatusCreated)
}

func (f *fakeBrowser) delivered() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.count
}

type pushStand struct {
	t        *testing.T
	ctx      context.Context
	db       *database.DB
	service  *Service
	apple    *fakeApple
	browser  *fakeBrowser
	endpoint string
}

func newPushStand(t *testing.T, prefix string) *pushStand {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, prefix)
	service := NewService(db, logger.New())
	pemKey, _ := testAPNSKey(t)
	require.NoError(t, service.WithAPNS(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: pemKey, Topic: "team.burcev.app"}))

	apple := &fakeApple{answers: map[string][]int{}}
	production := newHTTP2APNs(t, apple.handler("production"))
	sandbox := newHTTP2APNs(t, apple.handler("sandbox"))
	sender := testSender(t, production)
	sender.hosts = map[string]string{APNSProduction: production.URL, APNSSandbox: sandbox.URL}
	service.apns = sender

	// Web Push with a real VAPID pair: the library signs every request.
	private, public, err := webpush.GenerateVAPIDKeys()
	require.NoError(t, err)
	service.WithPush(PushConfig{PublicKey: public, PrivateKey: private, Subject: "mailto:test@burcev.team"})
	browser := &fakeBrowser{}
	browserServer := httptest.NewServer(browser)
	t.Cleanup(browserServer.Close)
	// The production client refuses loopback by design; the fake lives there.
	service.pushClient = browserServer.Client()

	return &pushStand{t: t, ctx: context.Background(), db: db, service: service,
		apple: apple, browser: browser, endpoint: browserServer.URL}
}

func (s *pushStand) user(email, role, name string) int64 {
	s.t.Helper()
	var id int64
	require.NoError(s.t, s.db.QueryRowContext(s.ctx,
		`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', $2, $3) RETURNING id`,
		email, name, role).Scan(&id))
	return id
}

func (s *pushStand) phone(userID int64, token, environment, installation string) {
	s.t.Helper()
	require.NoError(s.t, s.service.RegisterDevice(s.ctx, userID,
		APNSDevice{Token: token, Environment: environment, InstallationID: installation}))
}

// browserOf subscribes a browser with real encryption keys. Inserted directly:
// Subscribe refuses loopback endpoints, and the fake listens on one.
func (s *pushStand) browserOf(userID int64) {
	s.t.Helper()
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	require.NoError(s.t, err)
	secret := make([]byte, 16)
	_, err = rand.Read(secret)
	require.NoError(s.t, err)
	suffix := make([]byte, 6)
	_, err = rand.Read(suffix)
	require.NoError(s.t, err)
	_, err = s.db.ExecContext(s.ctx,
		`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)`,
		userID, s.endpoint+"/push/"+base64.RawURLEncoding.EncodeToString(suffix),
		base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes()),
		base64.RawURLEncoding.EncodeToString(secret))
	require.NoError(s.t, err)
}

func (s *pushStand) notify(userID int64, notificationType NotificationType, category NotificationCategory, ids IDs) *Notification {
	s.t.Helper()
	n := &Notification{UserID: userID, Category: category, Type: notificationType,
		Title: "Заголовок", Content: "Текст", Target: Target{IDs: ids}}
	require.NoError(s.t, s.service.CreateNotification(s.ctx, n))
	return n
}

func (s *pushStand) send() int {
	s.t.Helper()
	reached, err := s.service.SendDuePushes(s.ctx)
	require.NoError(s.t, err)
	return reached
}

// due makes every pending job due now: the retry delay is a minute.
func (s *pushStand) due() {
	s.t.Helper()
	_, err := s.db.ExecContext(s.ctx, `UPDATE push_deliveries SET not_before = NOW() WHERE status = 'pending'`)
	require.NoError(s.t, err)
}

func (s *pushStand) jobs(where string, args ...any) map[string]string {
	s.t.Helper()
	rows, err := s.db.QueryContext(s.ctx,
		`SELECT transport, status FROM push_deliveries WHERE `+where+` ORDER BY id`, args...)
	require.NoError(s.t, err)
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var transport, status string
		require.NoError(s.t, rows.Scan(&transport, &status))
		out[transport] = status
	}
	require.NoError(s.t, rows.Err())
	return out
}

func (s *pushStand) summary(notificationID string) string {
	s.t.Helper()
	var status string
	require.NoError(s.t, s.db.QueryRowContext(s.ctx,
		`SELECT status FROM notification_deliveries WHERE notification_id = $1 AND channel = 'push'`,
		notificationID).Scan(&status))
	return status
}

func (s *pushStand) disabled(token string) bool {
	s.t.Helper()
	var disabled bool
	require.NoError(s.t, s.db.QueryRowContext(s.ctx,
		`SELECT disabled_at IS NOT NULL FROM push_devices WHERE token = $1`, token).Scan(&disabled))
	return disabled
}

func (s *pushStand) conversation(client, curator int64) string {
	s.t.Helper()
	var id string
	require.NoError(s.t, s.db.QueryRowContext(s.ctx,
		`INSERT INTO conversations (client_id, curator_id) VALUES ($1, $2) RETURNING id`, client, curator).Scan(&id))
	return id
}

func (s *pushStand) message(conversationID string, sender int64, kind, content string) string {
	s.t.Helper()
	var id string
	require.NoError(s.t, s.db.QueryRowContext(s.ctx,
		`INSERT INTO messages (conversation_id, sender_id, type, content) VALUES ($1, $2, $3, $4) RETURNING id`,
		conversationID, sender, kind, content).Scan(&id))
	return id
}

var (
	tokenA = strings.Repeat("a", 64)
	tokenB = strings.Repeat("b", 64)
)

// ---------------------------------------------------------------- push-devices

// «Первая регистрация»; повторная обновляет last_seen_at и не плодит строк.
func TestRegisterDeviceStoresOneActiveIOSDevice(t *testing.T) {
	s := newPushStand(t, "push_register")
	id := s.user("reg@e.test", "client", "Р")
	s.phone(id, tokenA, APNSProduction, phoneA)
	_, err := s.db.ExecContext(s.ctx, `UPDATE push_devices SET last_seen_at = NOW() - INTERVAL '1 day'`)
	require.NoError(t, err)
	s.phone(id, tokenA, APNSProduction, phoneA)

	var platform string
	var count int
	var fresh bool
	require.NoError(t, s.db.QueryRowContext(s.ctx,
		`SELECT MIN(platform), COUNT(*), BOOL_AND(last_seen_at > NOW() - INTERVAL '1 minute')
		 FROM push_devices WHERE user_id = $1 AND disabled_at IS NULL`, id).Scan(&platform, &count, &fresh))
	assert.Equal(t, "ios", platform)
	assert.Equal(t, 1, count)
	assert.True(t, fresh, "повторная регистрация обновляет last_seen_at")
}

// «Другой аккаунт на том же телефоне»: токен переходит, когда регистрирует
// тот же телефон (installation_id), и пуши прежнего владельца на него не идут.
func TestDeviceMovesToTheAccountSignedInOnIt(t *testing.T) {
	s := newPushStand(t, "push_move")
	first, second := s.user("first@e.test", "client", "A"), s.user("second@e.test", "client", "B")
	s.phone(first, tokenA, APNSProduction, phoneA)
	s.phone(second, strings.ToUpper(tokenA), APNSProduction, phoneA)

	devices, err := s.service.devicesFor(s.ctx, s.db, first)
	require.NoError(t, err)
	assert.Empty(t, devices)
	devices, err = s.service.devicesFor(s.ctx, s.db, second)
	require.NoError(t, err)
	assert.Len(t, devices, 1)

	s.notify(first, TypeReminder, CategoryMain, nil)
	s.send()
	assert.Empty(t, s.apple.alerts(), "пуш A ушёл на телефон, где теперь B")
}

// Знать чужой токен недостаточно: с другого телефона его не перехватить.
func TestForeignInstallationCannotTakeOverAToken(t *testing.T) {
	s := newPushStand(t, "push_steal")
	owner, attacker := s.user("owner@e.test", "client", "O"), s.user("attacker@e.test", "client", "X")
	s.phone(owner, tokenA, APNSProduction, phoneA)
	err := s.service.RegisterDevice(s.ctx, attacker, APNSDevice{Token: tokenA, Environment: APNSProduction, InstallationID: phoneB})
	require.ErrorIs(t, err, apperrors.ErrForbidden)

	devices, _ := s.service.devicesFor(s.ctx, s.db, owner)
	assert.Len(t, devices, 1, "токен ушёл к чужому аккаунту")
	devices, _ = s.service.devicesFor(s.ctx, s.db, attacker)
	assert.Empty(t, devices)
}

func TestDeviceTokenIsValidated(t *testing.T) {
	s := newPushStand(t, "push_bad")
	id := s.user("bad@e.test", "client", "П")
	for _, device := range []APNSDevice{
		{Token: "https://evil", Environment: APNSProduction, InstallationID: phoneA},
		{Token: tokenB, Environment: "staging", InstallationID: phoneA},
		{Token: tokenB, Environment: APNSProduction},
	} {
		assert.ErrorIs(t, s.service.RegisterDevice(s.ctx, id, device), apperrors.ErrValidation)
	}
}

// «Приложение удалено с телефона»: 410 отключает устройство, следующее
// уведомление на него не уходит; новая регистрация включает обратно.
func TestGoneTokenDisablesTheDevice(t *testing.T) {
	s := newPushStand(t, "push_gone")
	id := s.user("gone@e.test", "client", "Г")
	s.phone(id, tokenA, APNSProduction, phoneA)
	s.phone(id, tokenB, APNSSandbox, phoneB)
	s.apple.answer(tokenB, http.StatusGone)

	n := s.notify(id, TypeTaskAssigned, CategoryMain, IDs{"task_id": "t-1"})
	assert.Equal(t, 1, s.send())
	assert.Equal(t, StatusSent, s.summary(n.ID))
	assert.True(t, s.disabled(tokenB), "устройство отключено, а не удалено")

	s.apple.reset()
	s.notify(id, TypeReminder, CategoryMain, nil)
	s.send()
	require.NotEmpty(t, s.apple.pushes())
	for _, p := range s.apple.pushes() {
		assert.NotEqual(t, tokenB, p.token, "на отключённое устройство пуш ушёл")
	}

	s.phone(id, tokenB, APNSSandbox, phoneB)
	assert.False(t, s.disabled(tokenB), "новая регистрация включает устройство")
}

// 400 BadDeviceToken — то же: токен из другого окружения не заработает.
func TestBadDeviceTokenDisablesTheDevice(t *testing.T) {
	s := newPushStand(t, "push_baddevice")
	id := s.user("bdt@e.test", "client", "Б")
	s.phone(id, tokenA, APNSProduction, phoneA)
	s.apple.answer(tokenA, http.StatusBadRequest)
	s.notify(id, TypeReminder, CategoryMain, nil)
	s.send()
	assert.True(t, s.disabled(tokenA))
	assert.Equal(t, map[string]string{"apns": StatusFailed}, s.jobs("user_id = $1", id), "повтора не будет")
}

// ------------------------------------------------------- notification-delivery

// «Пользователь с браузером и телефоном»: одно сообщение Web Push, одно APNs,
// результат каждой отправки записан.
func TestPushReachesBrowserAndIPhone(t *testing.T) {
	s := newPushStand(t, "push_both")
	id := s.user("both@e.test", "client", "О")
	s.browserOf(id)
	s.phone(id, tokenA, APNSProduction, phoneA)

	n := s.notify(id, TypeTaskAssigned, CategoryMain, IDs{"task_id": "t-1"})
	assert.Equal(t, 2, s.send())

	assert.Equal(t, 1, s.browser.delivered())
	alerts := s.apple.alerts()
	require.Len(t, alerts, 1)
	assert.Equal(t, 2, alerts[0].proto, "APNs по HTTP/2")
	assert.Equal(t, map[string]string{"webpush": StatusSent, "apns": StatusSent}, s.jobs("notification_id = $1", n.ID))
	assert.Equal(t, StatusSent, s.summary(n.ID))
	// «Пуш о задаче» на настоящей отправке.
	assert.Equal(t, "TASK", alerts[0].aps()["category"])
	assert.Equal(t, "t-1", alerts[0].payload["target"].(map[string]any)["ids"].(map[string]any)["task_id"])
	assert.Equal(t, n.ID, alerts[0].payload["notification_id"])
}

// «Устройство сборки из Xcode»: sandbox идёт на хост sandbox.
func TestSandboxDeviceGoesToTheSandboxHost(t *testing.T) {
	s := newPushStand(t, "push_sandbox")
	id := s.user("xcode@e.test", "client", "X")
	s.phone(id, tokenA, APNSSandbox, phoneA)
	s.notify(id, TypeReminder, CategoryMain, nil)
	s.send()
	alerts := s.apple.alerts()
	require.Len(t, alerts, 1)
	assert.Equal(t, "sandbox", alerts[0].host)
}

// «Частичный сбой»: Web Push доставлен, APNs ответил 503 — повторяется только
// APNs, браузер второй раз пуш не получает.
func TestPartialFailureRetriesOnlyTheFailedAddressee(t *testing.T) {
	s := newPushStand(t, "push_partial")
	id := s.user("partial@e.test", "client", "Ч")
	s.browserOf(id)
	s.phone(id, tokenA, APNSProduction, phoneA)
	s.apple.answer(tokenA, http.StatusServiceUnavailable)

	n := s.notify(id, TypePlanUpdated, CategoryMain, IDs{"plan_id": "p-1"})
	assert.Equal(t, 1, s.send())
	assert.Equal(t, map[string]string{"webpush": StatusSent, "apns": StatusPending}, s.jobs("notification_id = $1", n.ID))
	assert.Equal(t, StatusSent, s.summary(n.ID), "браузер получил — сводка «отправлено»")

	s.due()
	assert.Equal(t, 1, s.send())
	assert.Equal(t, 1, s.browser.delivered(), "браузер получил пуш дважды")
	assert.Len(t, s.apple.alerts(), 2)
	assert.Equal(t, map[string]string{"webpush": StatusSent, "apns": StatusSent}, s.jobs("notification_id = $1", n.ID))
}

// «APNs временно недоступен»: не более трёх попыток.
func TestUnavailableAPNsIsTriedThreeTimes(t *testing.T) {
	s := newPushStand(t, "push_retry")
	id := s.user("retry@e.test", "client", "П")
	s.phone(id, tokenA, APNSProduction, phoneA)
	s.apple.answer(tokenA, 503, 503, 503, 503, 503, 503)

	n := s.notify(id, TypeReminder, CategoryMain, nil)
	for i := 0; i < 5; i++ {
		s.send()
		s.due()
	}
	assert.Len(t, s.apple.alerts(), maxAttempts)
	var attempts int
	var status string
	require.NoError(t, s.db.QueryRowContext(s.ctx,
		`SELECT attempts, status FROM push_deliveries WHERE notification_id = $1`, n.ID).Scan(&attempts, &status))
	assert.Equal(t, maxAttempts, attempts)
	assert.Equal(t, StatusFailed, status)
	assert.Equal(t, StatusFailed, s.summary(n.ID))
}

// No device and no browser: the push summary is skipped, not left pending.
func TestNobodyToReachIsSkipped(t *testing.T) {
	s := newPushStand(t, "push_nobody")
	id := s.user("nobody@e.test", "client", "Н")
	n := s.notify(id, TypeReminder, CategoryMain, nil)
	assert.Equal(t, StatusSkipped, s.summary(n.ID))
}

// --------------------------------------------------- notification-preferences

func (s *pushStand) quietNow(userID int64) {
	s.t.Helper()
	// A quiet window of 23 hours that covers the current UTC hour.
	_, err := s.db.ExecContext(s.ctx, `
		UPDATE users SET quiet_hours_start = EXTRACT(HOUR FROM NOW() AT TIME ZONE 'UTC')::int,
		                 quiet_hours_end = (EXTRACT(HOUR FROM NOW() AT TIME ZONE 'UTC')::int + 23) % 24
		WHERE id = $1`, userID)
	require.NoError(s.t, err)
	_, err = s.db.ExecContext(s.ctx,
		`INSERT INTO user_settings (user_id, timezone) VALUES ($1, 'UTC')
		 ON CONFLICT (user_id) DO UPDATE SET timezone = 'UTC'`, userID)
	require.NoError(s.t, err)
}

// «Событие в тихое время» и «…на iPhone»: Web Push ждёт конца интервала,
// iPhone получает сразу — passive и без звука; запись в приложении есть сразу.
func TestQuietHoursDelayWebPushAndHushIPhone(t *testing.T) {
	s := newPushStand(t, "push_quiet")
	id := s.user("quiet@e.test", "client", "Т")
	s.quietNow(id)
	s.browserOf(id)
	s.phone(id, tokenA, APNSProduction, phoneA)

	n := s.notify(id, TypeFeedbackReceived, CategoryMain, IDs{"report_id": "r-1"})
	s.send()

	assert.Zero(t, s.browser.delivered(), "Web Push в тихое время отложен")
	var later bool
	require.NoError(t, s.db.QueryRowContext(s.ctx,
		`SELECT not_before > NOW() + INTERVAL '30 minutes' FROM push_deliveries
		 WHERE notification_id = $1 AND transport = 'webpush'`, n.ID).Scan(&later))
	assert.True(t, later)

	alerts := s.apple.alerts()
	require.Len(t, alerts, 1, "iPhone получает сразу")
	assert.Equal(t, "passive", alerts[0].aps()["interruption-level"])
	assert.NotContains(t, alerts[0].aps(), "sound")

	var listed int
	require.NoError(t, s.db.QueryRowContext(s.ctx,
		`SELECT COUNT(*) FROM notifications WHERE id = $1`, n.ID).Scan(&listed))
	assert.Equal(t, 1, listed)
}

// «Чтение предпочтений»: chat_message — только push, включён по умолчанию.
func TestDeliveryPreferencesListChatMessagesPushOnly(t *testing.T) {
	s := newPushStand(t, "push_prefs")
	id := s.user("prefs@e.test", "client", "П")
	prefs, err := s.service.GetDeliveryPreferences(s.ctx, id)
	require.NoError(t, err)
	assert.True(t, prefs.ShowMessageText, "текст сообщений по умолчанию показывается")

	var chat *TypeSetting
	for i := range prefs.Types {
		if prefs.Types[i].Type == string(TypeChatMessage) {
			chat = &prefs.Types[i]
		}
		if prefs.Types[i].Type == string(TypeTrainerFeedback) {
			require.NotNil(t, prefs.Types[i].Email, "у прочих типов почта есть")
		}
	}
	require.NotNil(t, chat, "chat_message нет в матрице")
	assert.True(t, chat.Push)
	assert.Nil(t, chat.Email, "почтового канала у сообщений чата нет")
	data, err := json.Marshal(chat)
	require.NoError(t, err)
	assert.NotContains(t, string(data), "email")

	// Выключить push и текст; почту для chat_message записать нельзя.
	yes, no := true, false
	require.NoError(t, s.service.UpdateDeliveryPreferences(s.ctx, id, UpdateDeliveryPreferencesRequest{
		Types:           []TypeSetting{{Type: string(TypeChatMessage), Push: false, Email: &yes}},
		ShowMessageText: &no,
	}))
	prefs, err = s.service.GetDeliveryPreferences(s.ctx, id)
	require.NoError(t, err)
	assert.False(t, prefs.ShowMessageText)
	var mailRows int
	require.NoError(t, s.db.QueryRowContext(s.ctx,
		`SELECT COUNT(*) FROM notification_preferences WHERE user_id = $1 AND type = 'chat_message' AND channel = 'email'`,
		id).Scan(&mailRows))
	assert.Zero(t, mailRows)

	// Экран без переключателя текста его не сбрасывает.
	require.NoError(t, s.service.UpdateDeliveryPreferences(s.ctx, id, UpdateDeliveryPreferencesRequest{}))
	prefs, _ = s.service.GetDeliveryPreferences(s.ctx, id)
	assert.False(t, prefs.ShowMessageText)
}

// ---------------------------------------------------------- notification-targets

// «Две статьи и одно сообщение»: значок 1.
func TestBadgeCountsMainAndChatButNotContent(t *testing.T) {
	s := newPushStand(t, "push_badge")
	client, curator := s.user("badge-client@e.test", "client", "К"), s.user("badge-cur@e.test", "coordinator", "Анна")
	for i := 0; i < 2; i++ {
		s.notify(client, TypeNewContent, CategoryContent, IDs{"article_id": "a", "slug": "s"})
	}
	conversation := s.conversation(client, curator)
	s.message(conversation, curator, "text", "Привет")

	badge, err := s.service.badgeFor(s.ctx, client)
	require.NoError(t, err)
	assert.Equal(t, 1, badge)

	// И в настоящем пуше: второе сообщение — значок 2.
	s.phone(client, tokenA, APNSProduction, phoneA)
	s.service.ChatMessageSent(s.ctx, s.message(conversation, curator, "text", "Ещё"))
	s.send()
	alerts := s.apple.alerts()
	require.Len(t, alerts, 1)
	assert.Equal(t, float64(2), alerts[0].aps()["badge"])
}

// «Прочитано в вебе»: фоновый пуш с badge 0 и без текста — и не чаще раза в
// минуту на устройство.
func TestReadInTheBrowserSendsASilentBadgeUpdate(t *testing.T) {
	s := newPushStand(t, "push_silent")
	id := s.user("silent@e.test", "client", "Т")
	s.phone(id, tokenA, APNSProduction, phoneA)
	_, err := s.db.ExecContext(s.ctx,
		`INSERT INTO notifications (user_id, category, type, title, content) VALUES ($1, 'main', 'general', 'Т', 'С')`, id)
	require.NoError(t, err)

	_, err = s.service.MarkAllAsRead(s.ctx, id, CategoryMain)
	require.NoError(t, err)
	s.send()

	pushes := s.apple.pushes()
	require.Len(t, pushes, 1)
	assert.Equal(t, "background", pushes[0].header.Get("apns-push-type"))
	assert.Equal(t, "5", pushes[0].header.Get("apns-priority"))
	assert.Equal(t, map[string]any{"badge": float64(0), "content-available": float64(1)}, pushes[0].aps())
	assert.NotContains(t, pushes[0].payload, "target")

	// Ещё одно изменение в ту же минуту — второго фонового пуша нет.
	s.service.UnreadChanged(s.ctx, id)
	s.send()
	assert.Len(t, s.apple.pushes(), 1, "фоновый пуш чаще раза в минуту")

	// Минута прошла — изменение, отмеченное раньше, уходит.
	_, err = s.db.ExecContext(s.ctx, `UPDATE push_devices SET badge_pushed_at = NOW() - INTERVAL '61 seconds'`)
	require.NoError(t, err)
	s.send()
	assert.Len(t, s.apple.pushes(), 2)
}

// --------------------------------------------------------------- chat-message-push

type presenceStub map[int64]bool

func (p presenceStub) IsConnected(userID int64) bool { return p[userID] }

func (s *pushStand) chatPair() (client, curator int64, conversation string) {
	client = s.user("chat-client@e.test", "client", "Клиент")
	curator = s.user("chat-curator@e.test", "coordinator", "Анна")
	return client, curator, s.conversation(client, curator)
}

// «Клиент не в приложении»: задание push chat_message с адресом переписки, в
// списке уведомлений новой записи нет. «Настройка по умолчанию»: тело — текст.
func TestChatMessageToAnAbsentClientIsPushed(t *testing.T) {
	s := newPushStand(t, "chat_absent")
	client, curator, conversation := s.chatPair()
	s.phone(client, tokenA, APNSProduction, phoneA)
	s.service.WithPresence(presenceStub{})

	message := s.message(conversation, curator, "text", "Белок держите отлично")
	s.service.ChatMessageSent(s.ctx, message)

	assert.Equal(t, map[string]string{"apns": StatusPending}, s.jobs("chat_message_id = $1", message))
	listed, err := s.service.GetNotifications(s.ctx, client, CategoryMain, 50, 0)
	require.NoError(t, err)
	assert.Empty(t, listed.Notifications, "сообщение чата не уведомление")

	s.send()
	alerts := s.apple.alerts()
	require.Len(t, alerts, 1)
	p := alerts[0]
	alert := p.aps()["alert"].(map[string]any)
	assert.Equal(t, "Анна", alert["title"])
	assert.Equal(t, "Белок держите отлично", alert["body"])
	assert.Equal(t, "CHAT_MESSAGE", p.aps()["category"])
	assert.Equal(t, "conversation:"+conversation, p.aps()["thread-id"])
	assert.Equal(t, map[string]any{"kind": "chat", "ids": map[string]any{
		"conversation_id": conversation, "participant_id": strconv.FormatInt(curator, 10)}}, p.payload["target"])
	assert.NotContains(t, p.payload, "notification_id")
	assert.Empty(t, p.header.Get("apns-collapse-id"), "каждое сообщение — свой текст")
	assert.Equal(t, map[string]string{"apns": StatusSent}, s.jobs("chat_message_id = $1", message))
}

// «Клиент в приложении»: задания нет.
func TestChatMessageToAConnectedClientIsNotPushed(t *testing.T) {
	s := newPushStand(t, "chat_connected")
	client, curator, conversation := s.chatPair()
	s.phone(client, tokenA, APNSProduction, phoneA)
	s.service.WithPresence(presenceStub{client: true})

	message := s.message(conversation, curator, "text", "Привет")
	s.service.ChatMessageSent(s.ctx, message)
	assert.Empty(t, s.jobs("chat_message_id = $1", message))
}

// «Получатель отключил пуш о сообщениях»: задания нет.
func TestChatMessagePushCanBeTurnedOff(t *testing.T) {
	s := newPushStand(t, "chat_off")
	client, curator, conversation := s.chatPair()
	s.phone(client, tokenA, APNSProduction, phoneA)
	require.NoError(t, s.service.UpdateDeliveryPreferences(s.ctx, client, UpdateDeliveryPreferencesRequest{
		Types: []TypeSetting{{Type: string(TypeChatMessage), Push: false}},
	}))

	message := s.message(conversation, curator, "text", "Привет")
	s.service.ChatMessageSent(s.ctx, message)
	assert.Empty(t, s.jobs("chat_message_id = $1", message))
}

// «Прочитал в вебе до отправки»: пуш не уходит, задание отменено.
func TestChatMessageReadBeforeSendingIsCancelled(t *testing.T) {
	s := newPushStand(t, "chat_read")
	client, curator, conversation := s.chatPair()
	s.phone(client, tokenA, APNSProduction, phoneA)

	message := s.message(conversation, curator, "text", "Привет")
	s.service.ChatMessageSent(s.ctx, message)
	_, err := s.db.ExecContext(s.ctx,
		`INSERT INTO message_read_status (conversation_id, user_id, last_read_at) VALUES ($1, $2, NOW())`,
		conversation, client)
	require.NoError(t, err)

	s.send()
	assert.Empty(t, s.apple.alerts(), "прочитанное ушло пушем")
	assert.Equal(t, map[string]string{"apns": StatusCancelled}, s.jobs("chat_message_id = $1", message))
}

// «Текст скрыт»: «Новое сообщение от Анна», текста сообщения в нагрузке нет.
func TestChatMessageTextCanBeHidden(t *testing.T) {
	s := newPushStand(t, "chat_hidden")
	client, curator, conversation := s.chatPair()
	s.phone(client, tokenA, APNSProduction, phoneA)
	no := false
	require.NoError(t, s.service.UpdateDeliveryPreferences(s.ctx, client, UpdateDeliveryPreferencesRequest{ShowMessageText: &no}))

	s.service.ChatMessageSent(s.ctx, s.message(conversation, curator, "text", "Белок держите отлично"))
	s.send()
	alerts := s.apple.alerts()
	require.Len(t, alerts, 1)
	assert.Equal(t, "Новое сообщение от Анна", alerts[0].aps()["alert"].(map[string]any)["body"])
	raw, err := json.Marshal(alerts[0].payload)
	require.NoError(t, err)
	assert.NotContains(t, string(raw), "Белок")
}

// «Фото от клиента»: тело «Фото», thread-id по переписке; получает куратор.
func TestChatPhotoFromAClient(t *testing.T) {
	s := newPushStand(t, "chat_photo")
	client, curator, conversation := s.chatPair()
	s.phone(curator, tokenB, APNSProduction, phoneB)

	s.service.ChatMessageSent(s.ctx, s.message(conversation, client, "image", "https://s3.example/photo.jpg"))
	s.send()
	alerts := s.apple.alerts()
	require.Len(t, alerts, 1)
	assert.Equal(t, tokenB, alerts[0].token)
	assert.Equal(t, "Фото", alerts[0].aps()["alert"].(map[string]any)["body"])
	assert.Equal(t, "conversation:"+conversation, alerts[0].aps()["thread-id"])
}
