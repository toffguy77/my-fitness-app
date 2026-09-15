package telegramlink

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Хэш билета не должен зависеть ни от чего, кроме билета: иначе выданный билет
// не найдётся при погашении.
func TestHashTicketIsStable(t *testing.T) {
	assert.Equal(t, hashTicket("билет"), hashTicket("билет"))
	assert.NotEqual(t, hashTicket("билет"), hashTicket("другой"))
	// В базу уходит хэш, а не сам билет: утечка таблицы не должна давать
	// возможность привязаться.
	assert.NotEqual(t, "билет", hashTicket("билет"))
}

// Пустой билет отклоняется тем же, чем и любой негодный.
func TestEmptyTicketIsRefusedLikeAnyOther(t *testing.T) {
	_, err := (&Service{}).Redeem(context.Background(), "", 1, "ник")
	assert.ErrorIs(t, err, apperrors.ErrTokenInvalid)
}

// Без имени бота подключать некуда: это «недоступно», а не пятисотка.
func TestConnectWithoutABotSaysUnavailable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("user_id", int64(1)); c.Next() })
	r.POST("/", NewHandler(&Service{}, logger.New(), "").Connect)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/", nil))

	require.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Contains(t, w.Body.String(), "feature_unavailable",
		"отказ без машиночитаемого кода — фронту не на что опереться")
}

// Без опознанного вызывающего ручки отвечают отказом, а не падают.
func TestHandlersRefuseAnUnknownCaller(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewHandler(&Service{}, logger.New(), "бот")
	for name, handler := range map[string]gin.HandlerFunc{
		"состояние": h.Status, "подключение": h.Connect, "отвязка": h.Disconnect,
	} {
		r := gin.New()
		r.GET("/", handler)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))
		assert.Equal(t, http.StatusBadRequest, w.Code, "ручка %s", name)
	}
}

// Отправитель не настроен — отказ назван, а не проглочен.
func TestDeliveryWithoutASenderSaysSo(t *testing.T) {
	err := NewDelivery(&Service{}, nil).Send(context.Background(), 1, "текст")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "бот не настроен")
}
