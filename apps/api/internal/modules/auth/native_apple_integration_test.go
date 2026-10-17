//go:build integration

package auth_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/modules/auth/oauth/applestub"
	"github.com/burcev/api/internal/router"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// Sign in with Apple целиком: настоящий движок маршрутов и схема, Apple —
// заглушка с тестовыми ключами (applestub).

type appleStand struct {
	engine      *gin.Engine
	db          *database.DB
	stub        *applestub.Server
	revocations *auth.AppleRevocations
	accounts    *account.Service
}

func newAppleStand(t *testing.T, name string, withApple bool) appleStand {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db := testsupport.SchemaWithMigrations(t, name)
	cfg := &config.Config{Env: "test", JWTSecret: "integration-secret-that-is-long-enough-32", AppDomain: "app.example.com"}
	log := logger.New()
	versions := middleware.NewTokenVersions(db.DB)
	service := auth.NewService(db.DB, cfg, log).WithSessionCache(versions)
	oauthHandler := auth.NewOAuthHandler(cfg, log, service, oauth.NewRegistry())
	accounts := account.NewService(db, log, nil)

	stand := appleStand{db: db, accounts: accounts}
	if withApple {
		stand.stub = applestub.New(t)
		apple := stand.stub.Adapter(nil)
		stand.revocations = auth.NewAppleRevocations(db.DB, apple, log)
		service.WithAppleRevocations(stand.revocations)
		accounts.WithAppleRevocations(stand.revocations)
		oauthHandler.WithApple(apple)
	}
	stand.engine = router.New(router.Deps{
		Cfg:             cfg,
		Log:             log,
		DB:              db,
		TokenVersions:   versions,
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
		Auth:            auth.NewHandler(service, cfg, log, nil),
		OAuth:           oauthHandler,
		Account:         account.NewHandler(accounts, log),
	})
	return stand
}

func (s appleStand) call(t *testing.T, method, path, body, access string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if access != "" {
		req.Header.Set("Authorization", "Bearer "+access)
	}
	w := httptest.NewRecorder()
	s.engine.ServeHTTP(w, req)
	for _, c := range w.Result().Cookies() {
		assert.NotEqual(t, "refresh_token", c.Name, "нативный путь поставил refresh-cookie")
	}
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

// signIn sends a fresh Apple credential for sub/email; code yields refresh.
func (s appleStand) signIn(t *testing.T, sub, email, refresh string, extra ...string) (int, map[string]any) {
	t.Helper()
	code := "code-" + refresh
	s.stub.AcceptCode(code, refresh)
	token := s.stub.Sign(applestub.Token{Subject: sub, Email: email, RawNonce: "raw-" + refresh, Private: strings.HasSuffix(email, "privaterelay.appleid.com")})
	body := `{"identity_token":"` + token + `","authorization_code":"` + code + `","nonce":"raw-` + refresh + `"` +
		strings.Join(extra, "") + `}`
	return s.call(t, http.MethodPost, "/api/v1/auth/native/apple", body, "")
}

func (s appleStand) count(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, s.db.QueryRowContext(context.Background(), query, args...).Scan(&n))
	return n
}

const appleConsents = `"consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}`

// «Новый пользователь со скрытым адресом» и «Нет согласий».
func TestAppleNewUserWithHiddenAddressWaitsForConsents(t *testing.T) {
	s := newAppleStand(t, "apple_new", true)
	const relay = "x7k2@privaterelay.appleid.com"

	code, body := s.signIn(t, "001.new", relay, "apple-r1", `,"full_name":{"given_name":"Анна","family_name":"Петрова"},"device_name":"iPhone 15"`)
	require.Equal(t, http.StatusOK, code, body)
	d := data(body)
	assert.Equal(t, "needs_consents", d["status"])
	pending, _ := d["pending_token"].(string)
	require.NotEmpty(t, pending)
	assert.Zero(t, s.count(t, `SELECT COUNT(*) FROM users WHERE email = $1`, relay), "аккаунт создан до согласий")

	code, body = s.call(t, http.MethodPost, "/api/v1/auth/native/consents",
		`{"pending_token":"`+pending+`","consents":{"terms_of_service":true,"privacy_policy":true}}`, "")
	assert.Equal(t, http.StatusBadRequest, code)
	assert.Equal(t, apperrors.CodeConsentsRequired, body["code"])
	assert.Zero(t, s.count(t, `SELECT COUNT(*) FROM users WHERE email = $1`, relay))

	code, body = s.call(t, http.MethodPost, "/api/v1/auth/native/consents",
		`{"pending_token":"`+pending+`","device_name":"iPhone 15",`+appleConsents+`}`, "")
	require.Equal(t, http.StatusOK, code, body)
	d = data(body)
	assert.Equal(t, true, d["created"])
	assert.NotEmpty(t, d["access_token"])
	assert.NotEmpty(t, d["refresh_token"])

	var verified bool
	var name sql.NullString
	var userID int64
	require.NoError(t, s.db.QueryRowContext(context.Background(),
		`SELECT id, email_verified, name FROM users WHERE email = $1`, relay).Scan(&userID, &verified, &name))
	assert.True(t, verified, "адрес Private Relay не помечен подтверждённым")
	assert.Equal(t, "Анна Петрова", name.String)
	assert.Equal(t, 3, s.count(t, `SELECT COUNT(*) FROM user_consents WHERE user_id = $1 AND granted`, userID))

	var sealed string
	require.NoError(t, s.db.QueryRowContext(context.Background(),
		`SELECT provider_refresh_token_enc FROM external_identities WHERE user_id = $1 AND provider = 'apple'`,
		userID).Scan(&sealed))
	assert.NotEmpty(t, sealed)
	assert.NotContains(t, sealed, "apple-r1", "токен Apple хранится открытым")
}

// «Чужая аудитория»: 401 token_invalid, ни аккаунта, ни попытки.
func TestAppleForeignAudienceCreatesNothing(t *testing.T) {
	s := newAppleStand(t, "apple_aud", true)
	s.stub.AcceptCode("c", "r")
	token := s.stub.Sign(applestub.Token{Subject: "001.x", Email: "x@example.test", Audience: "com.other.app", RawNonce: "n"})

	code, body := s.call(t, http.MethodPost, "/api/v1/auth/native/apple",
		`{"identity_token":"`+token+`","authorization_code":"c","nonce":"n"}`, "")
	assert.Equal(t, http.StatusUnauthorized, code)
	assert.Equal(t, apperrors.CodeTokenInvalid, body["code"])
	assert.Zero(t, s.count(t, `SELECT COUNT(*) FROM users WHERE email = 'x@example.test'`))
	assert.Zero(t, s.count(t, `SELECT COUNT(*) FROM oauth_pending_links`))
}

// «Пользователь сменил адрес пересылки»: вход по sub в тот же аккаунт.
func TestAppleLinkedUserIsFoundBySub(t *testing.T) {
	s := newAppleStand(t, "apple_sub", true)
	_, body := s.signIn(t, "001.same", "first@privaterelay.appleid.com", "apple-a")
	pending := data(body)["pending_token"].(string)
	code, body := s.call(t, http.MethodPost, "/api/v1/auth/native/consents", `{"pending_token":"`+pending+`",`+appleConsents+`}`, "")
	require.Equal(t, http.StatusOK, code, body)
	firstID := data(body)["user"].(map[string]any)["id"]

	code, body = s.signIn(t, "001.same", "second@privaterelay.appleid.com", "apple-b")
	require.Equal(t, http.StatusOK, code, body)
	d := data(body)
	assert.Equal(t, "signed_in", d["status"])
	assert.Equal(t, firstID, d["user"].(map[string]any)["id"])
	assert.NotEmpty(t, d["refresh_token"])
}

// Адрес Apple совпал с существующим аккаунтом: подтверждение владения
// паролем (общее правило external-identity), затем привязка.
func TestAppleAddressOfAnExistingAccountNeedsThePassword(t *testing.T) {
	s := newAppleStand(t, "apple_existing", true)
	hash, err := bcrypt.GenerateFromPassword([]byte("OwnerPass1!"), bcrypt.MinCost)
	require.NoError(t, err)
	var userID int64
	require.NoError(t, s.db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role) VALUES ('owner@example.test', $1, 'Хозяин', 'client') RETURNING id`,
		string(hash)).Scan(&userID))

	code, body := s.signIn(t, "001.owner", "owner@example.test", "apple-o")
	require.Equal(t, http.StatusOK, code)
	d := data(body)
	assert.Equal(t, "needs_link_confirmation", d["status"])
	assert.Equal(t, "owner@example.test", d["email"])

	code, body = s.call(t, http.MethodPost, "/api/v1/auth/native/oauth/link",
		`{"pending_token":"`+d["pending_token"].(string)+`","password":"OwnerPass1!"}`, "")
	require.Equal(t, http.StatusOK, code, body)
	assert.NotEmpty(t, data(body)["refresh_token"])
	assert.Equal(t, 1, s.count(t,
		`SELECT COUNT(*) FROM external_identities WHERE user_id = $1 AND provider = 'apple' AND provider_refresh_token_enc IS NOT NULL`, userID))
}

// «Провайдер не настроен»: providers без apple, native/apple — 503.
func TestAppleNotConfigured(t *testing.T) {
	s := newAppleStand(t, "apple_off", false)
	code, body := s.call(t, http.MethodGet, "/api/v1/auth/providers", "", "")
	require.Equal(t, http.StatusOK, code)
	assert.NotContains(t, data(body)["providers"], "apple")

	code, body = s.call(t, http.MethodPost, "/api/v1/auth/native/apple",
		`{"identity_token":"x","authorization_code":"y","nonce":"z"}`, "")
	assert.Equal(t, http.StatusServiceUnavailable, code)
	assert.Equal(t, apperrors.CodeFeatureUnavailable, body["code"])
}

// «Привязка Apple к существующему аккаунту» и «Отвязка последнего способа
// входа»; отвязка отзывает токен у Apple.
func TestAppleLinkAndUnlink(t *testing.T) {
	s := newAppleStand(t, "apple_link", true)

	code, body := s.call(t, http.MethodGet, "/api/v1/auth/providers", "", "")
	require.Equal(t, http.StatusOK, code)
	assert.Contains(t, data(body)["providers"], "apple")

	// Пользователь с паролем привязывает Apple.
	code, body = s.call(t, http.MethodPost, "/api/v1/auth/native/register",
		`{"email":"withpass@example.test","password":"IntegrationPass1!",`+appleConsents+`}`, "")
	require.Equal(t, http.StatusCreated, code, body)
	access := data(body)["access_token"].(string)

	s.stub.AcceptCode("link-code", "apple-link-r")
	token := s.stub.Sign(applestub.Token{Subject: "001.link", Email: "withpass@example.test", RawNonce: "ln"})
	code, body = s.call(t, http.MethodPost, "/api/v1/auth/native/apple/link",
		`{"identity_token":"`+token+`","authorization_code":"link-code","nonce":"ln"}`, access)
	require.Equal(t, http.StatusOK, code, body)

	code, body = s.call(t, http.MethodGet, "/api/v1/auth/providers/linked", "", access)
	require.Equal(t, http.StatusOK, code)
	raw, _ := json.Marshal(data(body)["linked"])
	assert.Contains(t, string(raw), `"provider":"apple"`)

	// С паролем отвязать можно — и токен отзывается у Apple.
	code, _ = s.call(t, http.MethodDelete, "/api/v1/auth/providers/apple", "", access)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, []string{"apple-link-r"}, s.stub.RevokedTokens())
	assert.Zero(t, s.count(t, `SELECT COUNT(*) FROM apple_token_revocations`))

	// Аккаунт без пароля с одним Apple: отвязка — 409 provider_only_way_in.
	_, body = s.signIn(t, "001.only", "only@privaterelay.appleid.com", "apple-only")
	code, body = s.call(t, http.MethodPost, "/api/v1/auth/native/consents",
		`{"pending_token":"`+data(body)["pending_token"].(string)+`",`+appleConsents+`}`, "")
	require.Equal(t, http.StatusOK, code)
	onlyAccess := data(body)["access_token"].(string)
	code, body = s.call(t, http.MethodDelete, "/api/v1/auth/providers/apple", "", onlyAccess)
	assert.Equal(t, http.StatusConflict, code)
	assert.Equal(t, apperrors.CodeProviderOnlyWayIn, body["code"])
	assert.Equal(t, 1, s.count(t, `SELECT COUNT(*) FROM external_identities WHERE provider_user_id = '001.only'`))
}

// «Отзыв при удалении» и «Apple недоступна»: стирание кладёт токен в очередь в
// своей транзакции и отзывает сразу; при отказе Apple аккаунт всё равно
// стёрт, строка остаётся, и задача повтора отзывает позже.
func TestAppleRevocationOnErasure(t *testing.T) {
	ctx := context.Background()
	s := newAppleStand(t, "apple_erase", true)

	register := func(sub, refresh string) int64 {
		_, body := s.signIn(t, sub, sub+"@privaterelay.appleid.com", refresh)
		code, body := s.call(t, http.MethodPost, "/api/v1/auth/native/consents",
			`{"pending_token":"`+data(body)["pending_token"].(string)+`",`+appleConsents+`}`, "")
		require.Equal(t, http.StatusOK, code, body)
		return int64(data(body)["user"].(map[string]any)["id"].(float64))
	}

	t.Run("отзыв при удалении", func(t *testing.T) {
		userID := register("001.erase", "apple-erase-r")
		require.NoError(t, s.accounts.Erase(ctx, userID))
		assert.Contains(t, s.stub.RevokedTokens(), "apple-erase-r")
		assert.Zero(t, s.count(t, `SELECT COUNT(*) FROM apple_token_revocations`))
		assert.Zero(t, s.count(t, `SELECT COUNT(*) FROM external_identities WHERE user_id = $1`, userID))
	})

	t.Run("Apple недоступна", func(t *testing.T) {
		userID := register("001.down", "apple-down-r")
		s.stub.SetFailRevoke(true)
		require.NoError(t, s.accounts.Erase(ctx, userID), "отказ Apple отменил стирание")

		assert.Equal(t, 1, s.count(t, `SELECT COUNT(*) FROM users WHERE id = $1 AND deleted_at IS NOT NULL`, userID))
		assert.Equal(t, 1, s.count(t,
			`SELECT COUNT(*) FROM apple_token_revocations WHERE attempts = 1 AND next_attempt_at > NOW()`),
			"в очереди нет задачи повторить отзыв")

		// Задача повтора берёт только созревшие строки.
		revoked, err := s.revocations.RetryDue(ctx)
		require.NoError(t, err)
		assert.Zero(t, revoked)

		s.stub.SetFailRevoke(false)
		_, err = s.db.ExecContext(ctx, `UPDATE apple_token_revocations SET next_attempt_at = NOW() - INTERVAL '1 second'`)
		require.NoError(t, err)
		revoked, err = s.revocations.RetryDue(ctx)
		require.NoError(t, err)
		assert.Equal(t, 1, revoked)
		assert.Contains(t, s.stub.RevokedTokens(), "apple-down-r")
		assert.Zero(t, s.count(t, `SELECT COUNT(*) FROM apple_token_revocations`))
	})
}

// Служебная учётка, пришедшая через Apple по HTTP-пути приложения,
// получает куратора (TestEveryAccountPathAssignsCurator проверяет то же на
// уровне сервиса; здесь — что обработчики ведут в тот же поток).
func TestAppleServiceAccountGetsACurator(t *testing.T) {
	s := newAppleStand(t, "apple_curator", true)
	_, err := s.db.Exec(`INSERT INTO users (email, password, name, role, email_verified)
		VALUES ('curator@burcev.test', 'x', 'Служебный', 'coordinator', true)`)
	require.NoError(t, err)

	_, body := s.signIn(t, "001.e2e", "e2e-apple@burcev.team", "apple-e2e")
	code, body := s.call(t, http.MethodPost, "/api/v1/auth/native/consents",
		`{"pending_token":"`+data(body)["pending_token"].(string)+`",`+appleConsents+`}`, "")
	require.Equal(t, http.StatusOK, code, body)
	userID := int64(data(body)["user"].(map[string]any)["id"].(float64))
	assert.Equal(t, 1, s.count(t,
		`SELECT COUNT(*) FROM curator_client_relationships WHERE client_id = $1 AND status = 'active'`, userID))
}
