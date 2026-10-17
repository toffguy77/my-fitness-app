package auth

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

// «Журнал обновления»: запись журнала запроса native/refresh не содержит
// значение токена — ни из тела, ни из адреса, ни из сообщений обработчика,
// в том числе когда обработчик пишет ошибку.
//
// Журнал собирается целиком: middleware.Logger и журнал обработчика пишут в
// один наблюдатель, и проверяется всё, что в нём оказалось, — так тест
// поймает и будущую запись тела, а не только сегодняшнюю маску адреса.
func TestNativeRefreshLogNeverContainsTheToken(t *testing.T) {
	const secret = "s3cr3t-native-refresh-token-value"

	for name, lookup := range map[string]func(sqlmock.Sqlmock){
		"unknown token": func(m sqlmock.Sqlmock) {
			m.ExpectQuery("FROM refresh_tokens").WillReturnError(errors.New("sql: no rows in result set"))
		},
		"database failure": func(m sqlmock.Sqlmock) {
			m.ExpectQuery("FROM refresh_tokens").WillReturnError(errors.New("connection reset"))
		},
	} {
		t.Run(name, func(t *testing.T) {
			core, logs := observer.New(zap.DebugLevel)
			log := &logger.Logger{SugaredLogger: zap.New(core).Sugar()}

			db, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer func() { _ = db.Close() }()
			lookup(mock)

			cfg := &config.Config{JWTSecret: "test-secret"}
			h := NewHandler(NewService(db, cfg, log), cfg, log, nil)

			gin.SetMode(gin.TestMode)
			r := gin.New()
			r.Use(middleware.Logger(log))
			r.POST("/api/v1/auth/native/refresh", h.NativeRefresh)

			req := httptest.NewRequest(http.MethodPost,
				"/api/v1/auth/native/refresh?refresh_token="+secret+"&identity_token="+secret,
				strings.NewReader(`{"refresh_token":"`+secret+`"}`))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			require.NotEqual(t, http.StatusOK, w.Code)

			require.NotZero(t, logs.Len(), "журнал запроса должен быть записан")
			for _, entry := range logs.All() {
				line := entry.Message + " " + fmt.Sprint(entry.ContextMap())
				assert.NotContains(t, line, secret, "токен попал в журнал: %s", line)
			}
		})
	}
}
