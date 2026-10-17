package notifications

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testAPNSKey is a fresh P-256 key in the form Apple hands out (.p8, PKCS#8).
func testAPNSKey(t *testing.T) (string, *ecdsa.PrivateKey) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	der, err := x509.MarshalPKCS8PrivateKey(key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})), key
}

func TestAPNSKeyIsParsedFromPEMOrOneLine(t *testing.T) {
	pemKey, _ := testAPNSKey(t)
	_, err := newAPNSSender(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: pemKey, Topic: "x"})
	require.NoError(t, err)

	// Pasted into an environment variable, the line breaks arrive as "\n".
	oneLine := strings.ReplaceAll(pemKey, "\n", `\n`)
	_, err = newAPNSSender(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: oneLine, Topic: "x"})
	require.NoError(t, err)

	_, err = newAPNSSender(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: "not a key", Topic: "x"})
	require.Error(t, err)
}

// The provider token carries the key id and team, verifies with the key, and is
// reused rather than re-signed for every push — Apple refuses one refreshed
// more often than every twenty minutes.
func TestAPNSProviderToken(t *testing.T) {
	pemKey, key := testAPNSKey(t)
	sender, err := newAPNSSender(APNSConfig{KeyID: "KEY1234567", TeamID: "TEAM123456", PrivateKey: pemKey, Topic: "x"})
	require.NoError(t, err)
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	sender.now = func() time.Time { return now }

	first, err := sender.bearer()
	require.NoError(t, err)
	parsed, err := jwt.Parse(first, func(*jwt.Token) (any, error) { return &key.PublicKey, nil },
		jwt.WithValidMethods([]string{"ES256"}), jwt.WithTimeFunc(func() time.Time { return now }))
	require.NoError(t, err)
	assert.Equal(t, "KEY1234567", parsed.Header["kid"])
	claims := parsed.Claims.(jwt.MapClaims)
	assert.Equal(t, "TEAM123456", claims["iss"])

	now = now.Add(30 * time.Minute)
	again, _ := sender.bearer()
	assert.Equal(t, first, again, "token re-signed too early")

	now = now.Add(25 * time.Minute)
	renewed, _ := sender.bearer()
	assert.NotEqual(t, first, renewed, "token kept past its lifetime")
}

// newHTTP2APNs is a fake Apple: TLS and HTTP/2, as APNs speaks nothing else.
// httptest.NewTLSServer alone answers HTTP/1.1, which would test a protocol
// Apple never uses.
func newHTTP2APNs(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	server := httptest.NewUnstartedServer(handler)
	server.EnableHTTP2 = true
	server.StartTLS()
	t.Cleanup(server.Close)
	return server
}

// testSender talks to the fake, through a client whose transport keeps the
// sender's own settings and trusts the fake's certificate.
func testSender(t *testing.T, server *httptest.Server) *apnsSender {
	t.Helper()
	pemKey, _ := testAPNSKey(t)
	sender, err := newAPNSSender(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: pemKey, Topic: "team.burcev.app"})
	require.NoError(t, err)
	transport := sender.client.Transport.(*http.Transport).Clone()
	transport.TLSClientConfig = server.Client().Transport.(*http.Transport).TLSClientConfig
	sender.client = &http.Client{Transport: transport, Timeout: sender.client.Timeout}
	sender.hosts = map[string]string{APNSProduction: server.URL, APNSSandbox: server.URL}
	return sender
}

func TestAPNSRequestShape(t *testing.T) {
	type seen struct {
		proto  int
		path   string
		header http.Header
		body   []byte
	}
	requests := make(chan seen, 4)
	server := newHTTP2APNs(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		requests <- seen{r.ProtoMajor, r.URL.Path, r.Header.Clone(), body}
		w.WriteHeader(http.StatusOK)
	})
	sender := testSender(t, server)
	token := strings.Repeat("ab", 32)
	device := pushDevice{id: 1, token: token, environment: APNSProduction}

	payload, err := newAPNSPayload(pushMessage{notificationID: "n-1", notificationType: TypeTaskAssigned,
		title: "Новая задача", body: "Выпить воды", target: Target{Kind: TargetTask, IDs: IDs{"task_id": "t-1"}}})
	require.NoError(t, err)
	result, err := sender.send(context.Background(), device, apnsMessage{payload: payload, collapseID: "n-1"})
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, result.status)

	got := <-requests
	assert.Equal(t, 2, got.proto, "APNs speaks HTTP/2 only")
	assert.Equal(t, "/3/device/"+token, got.path)
	assert.Equal(t, "team.burcev.app", got.header.Get("apns-topic"))
	assert.Equal(t, "alert", got.header.Get("apns-push-type"))
	assert.Equal(t, "10", got.header.Get("apns-priority"))
	assert.Equal(t, "n-1", got.header.Get("apns-collapse-id"))
	assert.True(t, strings.HasPrefix(got.header.Get("authorization"), "bearer "))
	var decoded map[string]any
	require.NoError(t, json.Unmarshal(got.body, &decoded))
	alert := decoded["aps"].(map[string]any)["alert"].(map[string]any)
	assert.Equal(t, "Новая задача", alert["title"])

	// A silent badge update: type background, priority 5, no collapse id.
	badge, err := newBadgePayload(3)
	require.NoError(t, err)
	_, err = sender.send(context.Background(), device, apnsMessage{payload: badge, background: true})
	require.NoError(t, err)
	got = <-requests
	assert.Equal(t, "background", got.header.Get("apns-push-type"))
	assert.Equal(t, "5", got.header.Get("apns-priority"))
	assert.Empty(t, got.header.Get("apns-collapse-id"))
}

// Устройство сборки из Xcode: окружение sandbox — хост api.sandbox.push.apple.com.
func TestAPNSHostFollowsTheDeviceEnvironment(t *testing.T) {
	assert.Equal(t, "https://api.sandbox.push.apple.com", apnsHosts[APNSSandbox])
	assert.Equal(t, "https://api.push.apple.com", apnsHosts[APNSProduction])

	hosts := make(chan string, 2)
	sandbox := newHTTP2APNs(t, func(w http.ResponseWriter, r *http.Request) { hosts <- "sandbox"; w.WriteHeader(200) })
	production := newHTTP2APNs(t, func(w http.ResponseWriter, r *http.Request) { hosts <- "production"; w.WriteHeader(200) })
	sender := testSender(t, sandbox)
	sender.hosts = map[string]string{APNSSandbox: sandbox.URL, APNSProduction: production.URL}
	// Both fakes share the test CA, so one client trusts both.
	_, err := sender.send(context.Background(), pushDevice{token: "aa", environment: APNSSandbox}, apnsMessage{payload: []byte(`{}`)})
	require.NoError(t, err)
	assert.Equal(t, "sandbox", <-hosts)
}

// Payload per target kind: thread-id, category, target, notification_id.
func TestAPNSPayloadPerTargetKind(t *testing.T) {
	cases := []struct {
		name     string
		message  pushMessage
		thread   string
		category string
	}{
		{"chat", pushMessage{notificationType: TypeChatMessage,
			target: Target{Kind: TargetChat, IDs: IDs{"conversation_id": "c-1", "participant_id": "5"}}},
			"conversation:c-1", "CHAT_MESSAGE"},
		{"task", pushMessage{notificationID: "n", notificationType: TypeTaskAssigned,
			target: Target{Kind: TargetTask, IDs: IDs{"task_id": "t-1", "task_type": "habit"}}}, "task", "TASK"},
		{"workout task", pushMessage{notificationID: "n", notificationType: TypeTaskOverdue,
			target: Target{Kind: TargetTask, IDs: IDs{"task_id": "t-1", "task_type": "workout"}}}, "task", "TASK_WORKOUT"},
		{"weekly feedback", pushMessage{notificationID: "n", notificationType: TypeFeedbackReceived,
			target: Target{Kind: TargetWeeklyFeedback, IDs: IDs{"report_id": "r-1"}}}, "weekly_feedback", ""},
		{"plan", pushMessage{notificationID: "n", notificationType: TypePlanUpdated,
			target: Target{Kind: TargetPlan, IDs: IDs{"plan_id": "p-1"}}}, "plan", ""},
		{"client", pushMessage{notificationID: "n", notificationType: TypeClientLeft,
			target: Target{Kind: TargetClient, IDs: IDs{"client_id": "9"}}}, "client", ""},
		{"support", pushMessage{notificationID: "n", notificationType: TypeSupportEscalated,
			target: Target{Kind: TargetSupportConversation, IDs: IDs{"conversation_id": "s-1"}}}, "support:s-1", "SUPPORT_ESCALATED"},
		{"lead", pushMessage{notificationID: "n", notificationType: TypeCuratorRequested,
			target: Target{Kind: TargetLead, IDs: IDs{"lead_id": "l-1"}}}, "lead", ""},
		{"article", pushMessage{notificationID: "n", notificationType: TypeNewContent,
			target: Target{Kind: TargetArticle, IDs: IDs{"article_id": "a-1", "slug": "s"}}}, "article", ""},
		{"export", pushMessage{notificationID: "n", notificationType: TypeExportReady,
			target: Target{Kind: TargetExport, IDs: IDs{"export_id": "e-1"}}}, "export", ""},
		{"notifications", pushMessage{notificationID: "n", notificationType: TypeGeneral,
			target: Target{Kind: TargetNotifications}}, "notifications", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			c.message.title, c.message.body, c.message.badge = "Заголовок", "Текст", 4
			data, err := newAPNSPayload(c.message)
			require.NoError(t, err)
			var p struct {
				APS            map[string]any `json:"aps"`
				Target         Target         `json:"target"`
				NotificationID *string        `json:"notification_id"`
			}
			require.NoError(t, json.Unmarshal(data, &p))
			assert.Equal(t, c.thread, p.APS["thread-id"])
			if c.category == "" {
				assert.NotContains(t, p.APS, "category")
			} else {
				assert.Equal(t, c.category, p.APS["category"])
			}
			assert.Equal(t, float64(4), p.APS["badge"])
			assert.Equal(t, "default", p.APS["sound"])
			assert.Equal(t, c.message.target, p.Target)
			alert := p.APS["alert"].(map[string]any)
			assert.Equal(t, "Заголовок", alert["title"])
			assert.Equal(t, "Текст", alert["body"])
			if c.message.notificationID == "" {
				assert.Nil(t, p.NotificationID, "a chat message is not a notification")
			} else {
				require.NotNil(t, p.NotificationID)
			}
		})
	}
}

// «Пуш о задаче»: category TASK и target.ids.task_id.
func TestTaskPushCarriesCategoryAndTaskID(t *testing.T) {
	data, err := newAPNSPayload(pushMessage{notificationID: "n-1", notificationType: TypeTaskAssigned,
		title: "Новая задача", body: "Пить воду", target: Target{Kind: TargetTask, IDs: IDs{"task_id": "t-7"}}})
	require.NoError(t, err)
	assert.JSONEq(t, `{
		"aps": {"alert": {"title": "Новая задача", "body": "Пить воду"}, "sound": "default", "badge": 0,
		        "thread-id": "task", "category": "TASK"},
		"target": {"kind": "task", "ids": {"task_id": "t-7"}},
		"notification_id": "n-1"
	}`, string(data))
}

// The payload carries the text of the notification and the address of the
// screen — no email, no diary values, nothing else about the person.
func TestAPNSPayloadCarriesNoPersonalData(t *testing.T) {
	data, err := newAPNSPayload(pushMessage{notificationID: "n-1", notificationType: TypeChatMessage,
		title: "Анна", body: chatBody("food_entry", "Омлет: 320 kcal (20g P / 22g F / 5g C)", "Анна", true),
		actionURL: "/curator/chat/5", target: Target{Kind: TargetChat, IDs: IDs{"conversation_id": "c", "participant_id": "5"}}})
	require.NoError(t, err)
	text := string(data)
	assert.NotContains(t, text, "kcal")
	assert.NotContains(t, text, "320")
	assert.NotContains(t, text, "@")
	assert.NotContains(t, text, "/curator/chat", "the web path is the browser's, not the phone's")

	var top map[string]any
	require.NoError(t, json.Unmarshal(data, &top))
	keys := []string{}
	for key := range top {
		keys = append(keys, key)
	}
	assert.ElementsMatch(t, []string{"aps", "target", "notification_id"}, keys)
}

// Тихое время на iPhone: сразу, passive и без звука.
func TestAPNSPayloadInQuietHoursIsPassiveAndSilent(t *testing.T) {
	data, err := newAPNSPayload(pushMessage{notificationID: "n", notificationType: TypeGeneral, passive: true})
	require.NoError(t, err)
	var p struct {
		APS map[string]any `json:"aps"`
	}
	require.NoError(t, json.Unmarshal(data, &p))
	assert.Equal(t, "passive", p.APS["interruption-level"])
	assert.NotContains(t, p.APS, "sound")
}

// «Прочитано в вебе»: фоновый пуш с badge 0 и без текста.
func TestBadgePayloadHasNoAlert(t *testing.T) {
	data, err := newBadgePayload(0)
	require.NoError(t, err)
	assert.JSONEq(t, `{"aps":{"badge":0,"content-available":1}}`, string(data))
}

func TestChatBody(t *testing.T) {
	assert.Equal(t, "Белок держите отлично", chatBody("text", "Белок держите отлично", "Анна", true))
	assert.Equal(t, "Новое сообщение от Анна", chatBody("text", "Белок держите отлично", "Анна", false))
	assert.Equal(t, "Фото", chatBody("image", "https://s3/x.jpg", "Анна", true))
	assert.Equal(t, "Файл", chatBody("file", "", "Анна", true))
	assert.Equal(t, "КБЖУ запись", chatBody("food_entry", "Омлет: 320 kcal", "Анна", true))

	long := strings.Repeat("я", 300)
	body := chatBody("text", long, "Анна", true)
	assert.Equal(t, 180, utf8.RuneCountInString(body), "cut to 180 characters, not bytes")
	assert.True(t, utf8.ValidString(body))
}

// A token Apple says is dead is deleted; a transient refusal is not.
func TestAPNSGoneAnswers(t *testing.T) {
	assert.True(t, apnsResult{status: 410, reason: "Unregistered"}.gone())
	assert.True(t, apnsResult{status: 400, reason: "BadDeviceToken"}.gone())
	assert.True(t, apnsResult{status: 400, reason: "DeviceTokenNotForTopic"}.gone())
	assert.False(t, apnsResult{status: 400, reason: "PayloadTooLarge"}.gone())
	assert.False(t, apnsResult{status: 429, reason: "TooManyRequests"}.gone())
	assert.False(t, apnsResult{status: 503, reason: "ServiceUnavailable"}.gone())
}

// «Ключ APNs есть, VAPID нет»: канал push готов, и задание отправки
// (jobsetup, notifications.send-pushes) смотрит на PushChannelReady.
func TestPushChannelIsReadyWithAPNsAlone(t *testing.T) {
	service, _, cleanup := setupTestService(t)
	defer cleanup()
	pemKey, _ := testAPNSKey(t)
	require.NoError(t, service.WithAPNS(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: pemKey, Topic: "x"}))
	assert.False(t, service.PushReady())
	assert.True(t, service.PushChannelReady())
}
