package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func importAs(t *testing.T, engine *gin.Engine, userID int64) *httptest.ResponseRecorder {
	t.Helper()
	// Тело пустое: обработчик отвечает 400 до базы, а лимит считает и такие
	// запросы — проверяется именно лимит.
	req := httptest.NewRequest(http.MethodPost, "/api/v1/health/import", strings.NewReader(""))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+signedToken(t, userID, "client"))
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	return w
}

// Сценарий «Зацикленная отправка» (health-import): 121-я пачка за час
// получает 429 с кодом too_many_attempts и Retry-After. Счёт — по
// пользователю: соседний пользователь за тем же адресом не задет.
func TestHealthImportIsLimitedPerUser(t *testing.T) {
	engine := testEngine(t)

	for i := 1; i <= 120; i++ {
		w := importAs(t, engine, 1)
		require.NotEqual(t, http.StatusTooManyRequests, w.Code, "пачка %d из 120 должна пройти лимит", i)
	}

	w := importAs(t, engine, 1)
	require.Equal(t, http.StatusTooManyRequests, w.Code)
	retryAfter, err := strconv.Atoi(w.Header().Get("Retry-After"))
	require.NoError(t, err, "Retry-After обязателен")
	assert.Greater(t, retryAfter, 0)

	var body struct {
		Code string `json:"code"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "too_many_attempts", body.Code)

	assert.NotEqual(t, http.StatusTooManyRequests, importAs(t, engine, 2).Code,
		"лимит считается по пользователю, а не по IP")
}

func TestHealthImportRequiresAuth(t *testing.T) {
	engine := testEngine(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/health/import", strings.NewReader(`{"items":[]}`))
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
