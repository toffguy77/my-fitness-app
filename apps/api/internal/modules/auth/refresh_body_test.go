package auth

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Тело ответа входа не содержит токена обновления.
//
// Он ездит в HttpOnly-cookie, и это весь смысл переезда: токен, который никакой
// сценарий на странице не прочитает. Тело ответа сводило переезд на нет —
// прочитать, записать в журнал или оставить в кэше посредника можно ровно так
// же, как раньше из localStorage.
//
// Клиент его не читал ни разу: поле было объявлено в типе и больше нигде.
func TestLoginResponseCarriesNoRefreshToken(t *testing.T) {
	result := LoginResult{
		User:         &User{ID: 1, Email: "человек@example.test"},
		Token:        "доступ",
		RefreshToken: "секрет-который-не-должен-уехать",
	}

	body, err := json.Marshal(result)
	require.NoError(t, err)

	assert.NotContains(t, string(body), "секрет-который-не-должен-уехать",
		"токен обновления уехал в теле ответа")
	assert.NotContains(t, string(body), "refresh_token",
		"даже имя поля наружу не нужно")
	// Остальное на месте: убрали одно поле, а не ответ целиком.
	assert.Contains(t, string(body), "\"token\":\"доступ\"")
	assert.Contains(t, string(body), "человек@example.test")
}

// Внутри он остаётся: обработчик кладёт его в cookie.
func TestRefreshTokenStaysAvailableToTheHandler(t *testing.T) {
	result := LoginResult{RefreshToken: "для-cookie"}
	assert.Equal(t, "для-cookie", result.RefreshToken)
}

// Приём из тела пока остаётся — намеренно, до 2026-11-01.
//
// Вкладки, открытые до перехода, держат токен в localStorage; их сессии
// истекают сами. Убрать приём раньше — разлогинить тех, кто просто давно не
// перезагружал страницу. Эта проверка стоит здесь, чтобы удаление приёма было
// осознанным действием, а не случайной правкой.
func TestRefreshStillAcceptsABodyToken(t *testing.T) {
	var req RefreshRequest
	require.NoError(t, json.NewDecoder(strings.NewReader(
		`{"refresh_token":"из-старой-вкладки"}`)).Decode(&req))
	assert.Equal(t, "из-старой-вкладки", req.RefreshToken)
}

// bodyRefreshSunset — день, после которого приём токена из тела запроса больше
// не нужен: вкладки, открытые до перехода на cookie, к этому сроку истекут
// сами.
var bodyRefreshSunset = time.Date(2026, time.November, 1, 0, 0, 0, 0, time.UTC)

// Срок, который сам о себе напоминает.
//
// Отложенное удаление, записанное только в комментарии, не удаляется никогда:
// день наступает, и про него некому вспомнить. Комментарий рядом честно
// объяснял, почему приём пока остаётся, — и ровно поэтому пережил бы свою
// причину молча.
//
// После срока сборка падает здесь и говорит, что делать. Это не поломка: это
// единственный момент, когда решение снова оказывается в чьих-то руках.
func TestBodyRefreshRemovalIsDue(t *testing.T) {
	if time.Now().Before(bodyRefreshSunset) {
		t.Skipf("приём из тела остаётся намеренно до %s",
			bodyRefreshSunset.Format("2006-01-02"))
	}

	t.Fatalf("срок вышел (%s): убрать приём refresh_token из тела запроса — "+
		"поле RefreshRequest.RefreshToken, ветку в обработчике и эти две проверки. "+
		"Задача secure-token-lifecycle 9.3. Если переносите срок — переносите "+
		"осознанно, правкой bodyRefreshSunset, а не удалением проверки",
		bodyRefreshSunset.Format("2006-01-02"))
}
