package support

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/telegram"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Порядок решения по обновлению — то, что здесь проверяется.
//
// Ветка вложений стояла раньше ветки группы кураторов, и из этого следовало
// три вещи: бот отвечал «нужен аккаунт» в служебном треде кураторов,
// фотография куратора не доходила до клиента, а на chat_id группы заводилось
// обращение. Ни один тест этого не видел: вложения проверялись вызовом
// HandleAttachment напрямую, минуя вебхук.
func TestClassifyRoutesUpdatesInTheRightOrder(t *testing.T) {
	const group = -1001234567890

	cases := []struct {
		name string
		raw  string
		want updateKind
	}{
		{
			name: "вопрос клиента словами",
			raw:  `{"message":{"chat":{"id":555,"type":"private"},"text":"привет"}}`,
			want: kindQuestion,
		},
		{
			name: "фотография от клиента",
			raw:  `{"message":{"chat":{"id":555,"type":"private"},"photo":[{"file_id":"f1"}]}}`,
			want: kindAttachment,
		},
		{
			name: "стикер от клиента: отвечать не на что",
			raw:  `{"message":{"chat":{"id":555,"type":"private"}}}`,
			want: kindIgnore,
		},
		{
			name: "текст куратора в теме клиента",
			raw:  `{"message":{"chat":{"id":-1001234567890,"type":"supergroup"},"message_thread_id":12,"text":"ответ"}}`,
			want: kindCuratorReply,
		},
		{
			name: "фотография куратора — такой же ответ, как и текст",
			raw:  `{"message":{"chat":{"id":-1001234567890,"type":"supergroup"},"message_thread_id":12,"photo":[{"file_id":"f1"}],"caption":"вот"}}`,
			want: kindCuratorReply,
		},
		{
			name: "фотография в служебном треде группы кураторов",
			raw:  `{"message":{"chat":{"id":-1001234567890,"type":"supergroup"},"photo":[{"file_id":"f1"}]}}`,
			want: kindCuratorReply,
		},
		{
			name: "служебное сообщение в группе: доставлять нечего",
			raw:  `{"message":{"chat":{"id":-1001234567890,"type":"supergroup"}}}`,
			want: kindIgnore,
		},
		{
			name: "текст в посторонней группе: бот там не участник разговора",
			raw:  `{"message":{"chat":{"id":-100999,"type":"supergroup"},"text":"привет"}}`,
			want: kindIgnore,
		},
		{
			name: "фотография в посторонней группе",
			raw:  `{"message":{"chat":{"id":-100999,"type":"group"},"photo":[{"file_id":"f1"}]}}`,
			want: kindIgnore,
		},
		{
			name: "сообщение в канале",
			raw:  `{"message":{"chat":{"id":-100777,"type":"channel"},"text":"пост"}}`,
			want: kindIgnore,
		},
		{
			name: "обновление без сообщения",
			raw:  `{"update_id":1}`,
			want: kindIgnore,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var update telegram.Update
			require.NoError(t, json.Unmarshal([]byte(tc.raw), &update))

			assert.Equal(t, tc.want, classify(&update, group))
		})
	}
}

// Пока группа не настроена, её сообщения разбирать не по чему — но отвечать
// коллегам в группе бот всё равно не должен.
func TestClassifyWithoutAConfiguredGroupStillKeepsQuietInGroups(t *testing.T) {
	var update telegram.Update
	require.NoError(t, json.Unmarshal(
		[]byte(`{"message":{"chat":{"id":-1001234567890,"type":"supergroup"},"text":"привет"}}`), &update))

	assert.Equal(t, kindIgnore, classify(&update, 0))
}

// Тип чата Telegram присылает всегда, но если его вдруг нет — молчать для
// клиента хуже, чем лишнее слово в группе: без ответа остаётся живой человек.
func TestClassifyTreatsAnUnknownChatTypeAsAPerson(t *testing.T) {
	var update telegram.Update
	require.NoError(t, json.Unmarshal(
		[]byte(`{"message":{"chat":{"id":555},"text":"привет"}}`), &update))

	assert.Equal(t, kindQuestion, classify(&update, -1001234567890))
}

func groupWebhookRouter(groupID int64, service *Service) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := NewHandler(&config.Config{
		TelegramWebhookSecret:  "expected-secret",
		TelegramSupportGroupID: groupID,
	}, logger.New(), service)

	r := gin.New()
	r.POST("/webhook", h.Webhook)
	return r
}

func postUpdate(t *testing.T, r *gin.Engine, raw string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/webhook", strings.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(telegram.SecretHeader, "expected-secret")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// Фотография куратора доходит до клиента.
//
// До исправления ветка вложений забирала её себе: FileID в CuratorReply был
// мёртвым полем, клиент не получал ничего, а в тему падало «нужен аккаунт».
func TestWebhook_CuratorPhotoReachesTheClient(t *testing.T) {
	media := &stubMedia{}
	service := NewService(nil, logger.New(), nil, &fakeSender{}, nil, 100).
		WithBridge(stubBridge{clientID: 42, found: true}, &stubDelivery{}, stubCurators{id: 7}).
		WithMedia(media)

	w := postUpdate(t, groupWebhookRouter(-1001234567890, service),
		`{"message":{"message_id":9,"from":{"id":7},"chat":{"id":-1001234567890,"type":"supergroup"},`+
			`"message_thread_id":12,"photo":[{"file_id":"f1"}],"caption":"вот"}}`)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, 1, media.saved, "фотография куратора не доехала до клиента")
}

// В служебном треде кураторов бот не говорит и обращения не заводит.
//
// Ровно это он и сделал в треде General: ответил «Чтобы отправить фото, нужен
// аккаунт» людям, которые о нём не спрашивали.
func TestWebhook_PhotoInTheCuratorsOwnThreadIsSilent(t *testing.T) {
	sender := &fakeSender{}
	media := &stubMedia{}
	// found: false — за служебным тредом не стоит ни один клиент.
	service := NewService(nil, logger.New(), nil, sender, nil, 100).
		WithBridge(stubBridge{found: false}, &stubDelivery{}, stubCurators{}).
		WithMedia(media)

	w := postUpdate(t, groupWebhookRouter(-1001234567890, service),
		`{"message":{"message_id":9,"from":{"id":7},"chat":{"id":-1001234567890,"type":"supergroup"},`+
			`"photo":[{"file_id":"f1"}]}}`)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Empty(t, sender.sent, "бот заговорил в служебном треде кураторов")
	assert.Zero(t, media.saved, "вложение кураторов уехало в хранилище клиента")
}

// Фотография в посторонней группе не создаёт ни ответа, ни обращения.
//
// Услуга без db: nil-соединение упало бы, если бы обновление дошло до
// conversationFor, — то есть тест заодно сторожит, что не дошло.
func TestWebhook_PhotoInAForeignGroupIsSilent(t *testing.T) {
	sender := &fakeSender{}
	media := &stubMedia{}
	service := NewService(nil, logger.New(), nil, sender, nil, 100).WithMedia(media)

	w := postUpdate(t, groupWebhookRouter(-1001234567890, service),
		`{"message":{"message_id":9,"from":{"id":7},"chat":{"id":-100999,"type":"supergroup"},`+
			`"photo":[{"file_id":"f1"}]}}`)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Empty(t, sender.sent, "бот ответил в посторонней группе")
	assert.Zero(t, media.saved)
}
