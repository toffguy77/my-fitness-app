package httpx

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Клиент должен ходить по IPv4, даже когда просят просто «tcp».
//
// На этом хосте нет маршрута в IPv6: адреса разрешаются, соединение не
// устанавливается. Это уже стоило двух молчаливых поломок — бот принимал
// сообщения и не мог ответить, сборки падали на реестре образов. Отказ при
// этом выглядит как неисправность собеседника, а не как своя.
func TestDialsOverIPv4(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	resp, err := NewClient(5 * time.Second).Get(server.URL)

	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// Подмена сети происходит до набора номера, а не после отказа: ждать отката
// значит ждать таймаут, а таймаут для вызывающего неотличим от неисправного
// собеседника.
func TestNetworkIsRewrittenBeforeDialing(t *testing.T) {
	client := NewClient(time.Second)
	transport, ok := client.Transport.(*http.Transport)
	require.True(t, ok, "клиент должен нести свой транспорт")
	require.NotNil(t, transport.DialContext)

	var asked string
	// Оборачиваем, чтобы увидеть, с какой сетью транспорт зовёт набор.
	original := transport.DialContext
	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		asked = network
		return original(ctx, network, addr)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	defer server.Close()
	resp, err := client.Get(server.URL)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, "tcp", asked, "транспорт просит tcp, а замена на tcp4 происходит внутри")
}

func TestTimeoutIsHonoured(t *testing.T) {
	assert.Equal(t, 3*time.Second, NewClient(3*time.Second).Timeout)
}

// Набор номера по IPv4 нужен не только HTTP.
//
// SMTP открывает свой сокет, и у smtp.yandex.ru есть адрес IPv6 — то есть
// почта несла тот же дефект, что и бот, и ждала тех же условий. Слушатель
// здесь только на IPv4: без подмены сети «tcp6» до него не доходит.
func TestAsksForIPv6AndGetsIPv4(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	require.NoError(t, err)
	defer func() { _ = listener.Close() }()

	conn, err := DialContext(context.Background(), "tcp6", listener.Addr().String())

	require.NoError(t, err, "подмена сети не сработала — так молчал бот")
	_ = conn.Close()
}
