package auth

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/modules/auth/oauth/applestub"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

// Журнал native/apple не содержит ни identity token, ни authorization_code,
// ни nonce — ни из тела, ни из адреса, ни из сообщений обработчика, в том
// числе когда Apple отказывает (настоящий адаптер против заглушки).
func TestNativeAppleLogNeverContainsTheSecrets(t *testing.T) {
	stub := applestub.New(t)
	const code = "s3cr3t-authorization-code"
	const nonce = "s3cr3t-raw-nonce"
	// Подписан не тем ключом: Apple не подтверждает — ветка с записью ошибки.
	token := stub.Sign(applestub.Token{Subject: "001.log", Kid: "kid-unknown", RawNonce: nonce})

	core, logs := observer.New(zap.DebugLevel)
	log := &logger.Logger{SugaredLogger: zap.New(core).Sugar()}
	cfg := &config.Config{JWTSecret: "test-secret"}
	h := NewOAuthHandler(cfg, log, NewService(nil, cfg, log), oauth.NewRegistry()).WithApple(stub.Adapter(nil))

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.Logger(log))
	r.POST("/api/v1/auth/native/apple", h.NativeApple)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/auth/native/apple?identity_token="+token+"&authorization_code="+code,
		strings.NewReader(`{"identity_token":"`+token+`","authorization_code":"`+code+`","nonce":"`+nonce+`"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusUnauthorized, w.Code)

	require.NotZero(t, logs.Len())
	for _, entry := range logs.All() {
		line := entry.Message + " " + fmt.Sprint(entry.ContextMap())
		for _, secret := range []string{token, code, nonce} {
			assert.NotContains(t, line, secret, "секрет попал в журнал: %s", line)
		}
	}
}
