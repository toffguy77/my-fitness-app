package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func tokenFor(t *testing.T, secret string, userID int64, version int) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"email":   "user@example.com",
		"role":    "client",
		"tv":      version,
		"exp":     time.Now().Add(15 * time.Minute).Unix(),
	})
	signed, err := token.SignedString([]byte(secret))
	require.NoError(t, err)
	return signed
}

// request runs one authenticated request through the middleware.
func request(cfg *config.Config, versions *TokenVersions, bearer string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/", RequireAuth(cfg, versions), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+bearer)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func TestTokenVersionGate(t *testing.T) {
	cfg := &config.Config{JWTSecret: "a-test-secret"}

	t.Run("a token issued at the current version is accepted", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer db.Close()
		mock.ExpectQuery(`SELECT token_version FROM users`).
			WithArgs(int64(7)).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(3))

		assert.Equal(t, http.StatusOK,
			request(cfg, NewTokenVersions(db), tokenFor(t, cfg.JWTSecret, 7, 3)).Code)
	})

	t.Run("a token issued before a password change is refused", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer db.Close()
		mock.ExpectQuery(`SELECT token_version FROM users`).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(4))

		// Signature still valid, expiry still in the future — and refused
		// anyway. That is the whole point: a stolen access token must not
		// outlive the action taken to stop it.
		assert.Equal(t, http.StatusUnauthorized,
			request(cfg, NewTokenVersions(db), tokenFor(t, cfg.JWTSecret, 7, 3)).Code)
	})

	t.Run("a token from before this field existed still works", func(t *testing.T) {
		// Deploying the change must not sign everybody out: an old token has
		// no tv claim, which decodes as 0 — the version every account starts
		// at.
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer db.Close()
		mock.ExpectQuery(`SELECT token_version FROM users`).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(0))

		old := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"user_id": int64(7), "email": "user@example.com", "role": "client",
			"exp": time.Now().Add(15 * time.Minute).Unix(),
		})
		signed, err := old.SignedString([]byte(cfg.JWTSecret))
		require.NoError(t, err)

		assert.Equal(t, http.StatusOK, request(cfg, NewTokenVersions(db), signed).Code)
	})

	t.Run("an account that no longer exists is refused", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer db.Close()
		mock.ExpectQuery(`SELECT token_version FROM users`).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}))

		assert.Equal(t, http.StatusUnauthorized,
			request(cfg, NewTokenVersions(db), tokenFor(t, cfg.JWTSecret, 7, 0)).Code)
	})

	t.Run("without a version source the check is skipped", func(t *testing.T) {
		// Tests and tools that have no database still get a working middleware.
		assert.Equal(t, http.StatusOK,
			request(cfg, nil, tokenFor(t, cfg.JWTSecret, 7, 99)).Code)
	})
}

func TestTokenVersionsCache(t *testing.T) {
	t.Run("a second read inside the TTL does not hit the database", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer db.Close()
		// One expectation, two reads. A second query would fail the test.
		mock.ExpectQuery(`SELECT token_version FROM users`).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(2))

		versions := NewTokenVersions(db)
		first, err := versions.Current(context.Background(), 7)
		require.NoError(t, err)
		second, err := versions.Current(context.Background(), 7)
		require.NoError(t, err)

		assert.Equal(t, 2, first)
		assert.Equal(t, 2, second)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("forgetting an account makes the next read reach the database", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer db.Close()
		mock.ExpectQuery(`SELECT token_version FROM users`).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(2))
		mock.ExpectQuery(`SELECT token_version FROM users`).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(3))

		versions := NewTokenVersions(db)
		_, err = versions.Current(context.Background(), 7)
		require.NoError(t, err)

		// This is what makes a revocation immediate on the instance that
		// performed it, rather than merely eventual.
		versions.Forget(7)

		after, err := versions.Current(context.Background(), 7)
		require.NoError(t, err)
		assert.Equal(t, 3, after)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("a stale entry is re-read once the TTL has passed", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer db.Close()
		mock.ExpectQuery(`SELECT token_version FROM users`).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(2))
		mock.ExpectQuery(`SELECT token_version FROM users`).
			WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(5))

		versions := NewTokenVersions(db)
		versions.ttl = time.Millisecond
		_, err = versions.Current(context.Background(), 7)
		require.NoError(t, err)

		time.Sleep(5 * time.Millisecond)

		after, err := versions.Current(context.Background(), 7)
		require.NoError(t, err)
		assert.Equal(t, 5, after, "a revocation elsewhere must be seen within the TTL")
	})
}

func TestBumpVersionInvalidatesTheCachedOne(t *testing.T) {
	// Writing the new version and forgetting the cached one are one act. When
	// they were two, the cache went on answering with the old version for the
	// length of its TTL — and every request in that window was refused,
	// including ones carrying a token minted a second earlier. The tokens were
	// right; the cache was stale.
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	mock.ExpectQuery(`SELECT token_version FROM users`).
		WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(0))
	mock.ExpectBegin()
	mock.ExpectExec(`UPDATE users SET token_version`).
		WithArgs(int64(7)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	mock.ExpectQuery(`SELECT token_version FROM users`).
		WillReturnRows(sqlmock.NewRows([]string{"token_version"}).AddRow(1))

	versions := NewTokenVersions(db)

	before, err := versions.Current(context.Background(), 7)
	require.NoError(t, err)
	require.Equal(t, 0, before)

	tx, err := db.BeginTx(context.Background(), nil)
	require.NoError(t, err)
	require.NoError(t, versions.BumpVersion(context.Background(), tx, 7))
	require.NoError(t, tx.Commit())

	after, err := versions.Current(context.Background(), 7)
	require.NoError(t, err)
	assert.Equal(t, 1, after, "the cache answered with the version it had before the bump")
	assert.NoError(t, mock.ExpectationsWereMet())
}
