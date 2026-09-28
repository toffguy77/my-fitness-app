//go:build integration

package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/chat"
	"github.com/burcev/api/internal/shared/curatoraccess"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/ws"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Запись в переписку закрыта на уровне API, а не скрытием входа в интерфейсе.
//
// Проверяется через настоящий роутер и настоящую схему: платный доступ,
// закрытый только интерфейсом, открыт любому, кто обратится к API напрямую, а
// подмена базы показала бы зелёное и там, где колонки срока нет вовсе.
//
// Здесь же видно, какие маршруты запрет НЕ закрывает: чтение истории и отметка
// о прочтении. Написанное человеком не становится недоступным ему из-за
// окончания оплаты, и проверить это можно только со стороны роутера — из
// middleware не видно, на какие маршруты его повесили.

type accessFixture struct {
	engine       *gin.Engine
	db           *database.DB
	curatorID    int64
	clientID     int64
	conversation string
}

func newAccessFixture(t *testing.T, name string) accessFixture {
	t.Helper()
	ctx := context.Background()
	gin.SetMode(gin.TestMode)

	db := testsupport.SchemaWithMigrations(t, name)
	log := logger.New()

	var curatorID, clientID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('curator@example.test', 'x', 'Куратор', 'coordinator', true) RETURNING id`).Scan(&curatorID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('client@example.test', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&clientID))

	var conversation string
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO conversations (client_id, curator_id) VALUES ($1, $2) RETURNING id`,
		clientID, curatorID).Scan(&conversation))

	engine := New(Deps{
		Cfg:             &config.Config{Env: "test", JWTSecret: "test-secret"},
		Log:             log,
		DB:              db,
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
		Chat:            chat.NewHandler(&config.Config{Env: "test"}, log, db, chat.NewService(db, log), nil, ws.NewHub()),
	})

	return accessFixture{engine: engine, db: db, curatorID: curatorID, clientID: clientID, conversation: conversation}
}

func (f accessFixture) link(t *testing.T, status string, expires *time.Time) {
	t.Helper()
	_, err := f.db.ExecContext(context.Background(),
		`INSERT INTO curator_client_relationships (curator_id, client_id, status, access_expires_at)
		 VALUES ($1, $2, $3, $4)`, f.curatorID, f.clientID, status, expires)
	require.NoError(t, err)
}

func (f accessFixture) tokenFor(t *testing.T, userID int64, role string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, middleware.UserClaims{
		UserID: userID,
		Email:  "someone@example.test",
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	signed, err := token.SignedString([]byte("test-secret"))
	require.NoError(t, err)
	return signed
}

func (f accessFixture) do(t *testing.T, method, path, body string, userID int64, role string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Authorization", "Bearer "+f.tokenFor(t, userID, role))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	f.engine.ServeHTTP(w, req)
	return w
}

const sendBody = `{"type":"text","content":"привет"}`

func TestSendMessage_БезПраваОтвергается(t *testing.T) {
	f := newAccessFixture(t, "router_access_none")
	// Связи нет вовсе: так теперь выглядит только что зарегистрировавшийся.

	w := f.do(t, http.MethodPost, "/api/v1/conversations/"+f.conversation+"/messages", sendBody, f.clientID, "client")

	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.Contains(t, w.Body.String(), "curator_access_required",
		"ответ обязан называть причину кодом, а не только русской фразой")
}

func TestSendMessage_ИстёкшееПравоОтвергается(t *testing.T) {
	f := newAccessFixture(t, "router_access_expired")
	yesterday := curatoraccess.Today().AddDate(0, 0, -1)
	f.link(t, curatoraccess.StatusActive, &yesterday)

	w := f.do(t, http.MethodPost, "/api/v1/conversations/"+f.conversation+"/messages", sendBody, f.clientID, "client")

	assert.Equal(t, http.StatusForbidden, w.Code,
		"статус связи ещё active, но день предельной даты прошёл — право кончилось")
}

func TestSendMessage_КураторуКлиентаБезПраваТожеНельзя(t *testing.T) {
	f := newAccessFixture(t, "router_access_curator")
	yesterday := curatoraccess.Today().AddDate(0, 0, -1)
	f.link(t, curatoraccess.StatusActive, &yesterday)

	w := f.do(t, http.MethodPost, "/api/v1/conversations/"+f.conversation+"/messages", sendBody, f.curatorID, "coordinator")

	assert.Equal(t, http.StatusForbidden, w.Code,
		"куратор, не знающий о прекращении, работал бы бесплатно")
}

func TestSendMessage_СДействующимПравомПринимается(t *testing.T) {
	f := newAccessFixture(t, "router_access_allowed")
	future := curatoraccess.Today().AddDate(0, 0, 30)
	f.link(t, curatoraccess.StatusActive, &future)

	w := f.do(t, http.MethodPost, "/api/v1/conversations/"+f.conversation+"/messages", sendBody, f.clientID, "client")

	assert.Equal(t, http.StatusCreated, w.Code, w.Body.String())
}

// Последний день действует целиком: ошибка здесь стоит денег тому, кто заплатил.
func TestSendMessage_ПоследнийДеньЕщёРаботает(t *testing.T) {
	f := newAccessFixture(t, "router_access_last_day")
	today := curatoraccess.Today()
	f.link(t, curatoraccess.StatusActive, &today)

	w := f.do(t, http.MethodPost, "/api/v1/conversations/"+f.conversation+"/messages", sendBody, f.clientID, "client")

	assert.Equal(t, http.StatusCreated, w.Code, w.Body.String())
}

func TestReadMessages_БезПраваРазрешено(t *testing.T) {
	f := newAccessFixture(t, "router_access_read")
	yesterday := curatoraccess.Today().AddDate(0, 0, -1)
	f.link(t, curatoraccess.StatusActive, &yesterday)

	w := f.do(t, http.MethodGet, "/api/v1/conversations/"+f.conversation+"/messages", "", f.clientID, "client")

	assert.Equal(t, http.StatusOK, w.Code,
		"написанное человеком не становится недоступным ему из-за окончания оплаты")
}

func TestMarkAsRead_БезПраваРазрешено(t *testing.T) {
	f := newAccessFixture(t, "router_access_mark_read")
	yesterday := curatoraccess.Today().AddDate(0, 0, -1)
	f.link(t, curatoraccess.StatusActive, &yesterday)

	w := f.do(t, http.MethodPost, "/api/v1/conversations/"+f.conversation+"/read", "", f.clientID, "client")

	assert.Equal(t, http.StatusOK, w.Code, "отметка о прочтении — часть чтения")
}

func TestUploadAttachment_БезПраваОтвергается(t *testing.T) {
	f := newAccessFixture(t, "router_access_upload")

	w := f.do(t, http.MethodPost, "/api/v1/conversations/"+f.conversation+"/upload", "", f.clientID, "client")

	assert.Equal(t, http.StatusForbidden, w.Code,
		"вложение — та же запись в переписку")
}

func TestCreateFoodEntryFromChat_БезПраваОтвергается(t *testing.T) {
	f := newAccessFixture(t, "router_access_food_entry")

	path := "/api/v1/conversations/" + f.conversation + "/messages/" + f.conversation + "/food-entry"
	w := f.do(t, http.MethodPost, path, `{}`, f.curatorID, "coordinator")

	assert.Equal(t, http.StatusForbidden, w.Code,
		"запись в дневник клиента из переписки — тоже работа куратора")
}

func TestGetAccess_СообщаетСостояниеПрава(t *testing.T) {
	f := newAccessFixture(t, "router_access_state")
	future := curatoraccess.Today().AddDate(0, 0, 10)
	f.link(t, curatoraccess.StatusActive, &future)

	w := f.do(t, http.MethodGet, "/api/v1/conversations/access", "", f.clientID, "client")

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	body := w.Body.String()
	assert.Contains(t, body, `"allowed":true`)
	assert.Contains(t, body, future.Format(time.DateOnly), "дата окончания нужна, чтобы предложить продление вовремя")
	assert.Contains(t, body, f.conversation, "прежняя переписка доступна для чтения и без права")
}

func TestGetAccess_БезКуратораНеПутаетсяСИстёкшим(t *testing.T) {
	f := newAccessFixture(t, "router_access_state_none")

	w := f.do(t, http.MethodGet, "/api/v1/conversations/access", "", f.clientID, "client")

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Contains(t, w.Body.String(), `"allowed":false`)
	assert.Contains(t, w.Body.String(), `"expired":false`,
		"куратора никогда не было — это предложение купить, а не продлить")
}
