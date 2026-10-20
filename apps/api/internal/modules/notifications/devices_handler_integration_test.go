//go:build integration

package notifications

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// push-devices через HTTP: обработчик с настоящей службой и базой, маршруты
// как в router/users.go.
func devicesRouter(s *pushStand) func(method, path, body string, userID int64) (int, map[string]any) {
	gin.SetMode(gin.TestMode)
	handler := NewHandler(s.service, &config.Config{Env: "test"}, logger.New())
	return func(method, path, body string, userID int64) (int, map[string]any) {
		engine := gin.New()
		auth := func(c *gin.Context) { c.Set("user_id", userID) }
		engine.POST("/api/v1/notifications/devices", auth, handler.RegisterDevice)
		engine.DELETE("/api/v1/notifications/devices/:token", auth, handler.UnregisterDevice)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(method, path, strings.NewReader(body)))
		var decoded map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &decoded)
		return w.Code, decoded
	}
}

func deviceBody(token, environment, installation string) string {
	return `{"token":"` + token + `","environment":"` + environment + `","app_version":"0.4.0","installation_id":"` + installation + `"}`
}

func activeDevices(t *testing.T, s *pushStand, userID int64) int {
	t.Helper()
	var n int
	require.NoError(t, s.db.QueryRowContext(s.ctx,
		`SELECT COUNT(*) FROM push_devices WHERE user_id = $1 AND disabled_at IS NULL`, userID).Scan(&n))
	return n
}

// «Первая регистрация» и «Неверное окружение».
func TestDevicesEndpointRegisters(t *testing.T) {
	s := newPushStand(t, "devices_http_register")
	call := devicesRouter(s)
	id := s.user("http-reg@e.test", "client", "Р")

	status, _ := call(http.MethodPost, "/api/v1/notifications/devices", deviceBody(tokenA, "production", phoneA), id)
	assert.Equal(t, http.StatusNoContent, status)
	assert.Equal(t, 1, activeDevices(t, s, id))

	status, body := call(http.MethodPost, "/api/v1/notifications/devices", deviceBody(tokenB, "staging", phoneB), id)
	assert.Equal(t, http.StatusBadRequest, status)
	assert.Equal(t, "validation", body["code"])
	assert.Equal(t, 1, activeDevices(t, s, id))

	// Чужой телефон с тем же токеном — 403, токен остаётся у владельца.
	other := s.user("http-other@e.test", "client", "Д")
	status, body = call(http.MethodPost, "/api/v1/notifications/devices", deviceBody(tokenA, "production", phoneB), other)
	assert.Equal(t, http.StatusForbidden, status)
	assert.Equal(t, "forbidden", body["code"])
	assert.Equal(t, 1, activeDevices(t, s, id))
}

// «Выход из приложения» и «Чужой токен».
func TestDevicesEndpointUnregistersOnlyOwnDevice(t *testing.T) {
	s := newPushStand(t, "devices_http_delete")
	call := devicesRouter(s)
	a, b := s.user("http-a@e.test", "client", "A"), s.user("http-b@e.test", "client", "B")
	s.phone(a, tokenA, APNSProduction, phoneA)
	s.phone(b, tokenB, APNSProduction, phoneB)

	status, _ := call(http.MethodDelete, "/api/v1/notifications/devices/"+tokenB, "", a)
	assert.Equal(t, http.StatusNoContent, status)
	assert.Equal(t, 1, activeDevices(t, s, b), "устройство B осталось активным")

	status, _ = call(http.MethodDelete, "/api/v1/notifications/devices/"+tokenA, "", a)
	assert.Equal(t, http.StatusNoContent, status)
	assert.Zero(t, activeDevices(t, s, a))

	// Устройства уже нет — тоже 204.
	status, _ = call(http.MethodDelete, "/api/v1/notifications/devices/"+tokenA, "", a)
	assert.Equal(t, http.StatusNoContent, status)
}

// «Ключ не задан»: 503 feature_unavailable.
func TestDevicesEndpointWithoutAPNsKey(t *testing.T) {
	s := newPushStand(t, "devices_http_off")
	s.service.apns = nil
	call := devicesRouter(s)
	id := s.user("http-off@e.test", "client", "О")

	status, body := call(http.MethodPost, "/api/v1/notifications/devices", deviceBody(tokenA, "production", phoneA), id)
	assert.Equal(t, http.StatusServiceUnavailable, status)
	assert.Equal(t, "feature_unavailable", body["code"])
}
