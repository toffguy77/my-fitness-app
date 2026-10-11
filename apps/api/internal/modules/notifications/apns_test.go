package notifications

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testAPNSKey is a fresh P-256 key in the form Apple hands out (.p8, PKCS#8).
func testAPNSKey(t *testing.T) (string, *ecdsa.PrivateKey) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	der, err := x509.MarshalPKCS8PrivateKey(key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})), key
}

func TestAPNSKeyIsParsedFromPEMOrOneLine(t *testing.T) {
	pemKey, _ := testAPNSKey(t)
	_, err := newAPNSSender(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: pemKey, Topic: "x"})
	require.NoError(t, err)

	// Pasted into an environment variable, the line breaks arrive as "\n".
	oneLine := strings.ReplaceAll(pemKey, "\n", `\n`)
	_, err = newAPNSSender(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: oneLine, Topic: "x"})
	require.NoError(t, err)

	_, err = newAPNSSender(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: "not a key", Topic: "x"})
	require.Error(t, err)
}

// The provider token carries the key id and team, verifies with the key, and is
// reused rather than re-signed for every push — Apple refuses one refreshed
// more often than every twenty minutes.
func TestAPNSProviderToken(t *testing.T) {
	pemKey, key := testAPNSKey(t)
	sender, err := newAPNSSender(APNSConfig{KeyID: "KEY1234567", TeamID: "TEAM123456", PrivateKey: pemKey, Topic: "x"})
	require.NoError(t, err)
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	sender.now = func() time.Time { return now }

	first, err := sender.bearer()
	require.NoError(t, err)
	parsed, err := jwt.Parse(first, func(*jwt.Token) (any, error) { return &key.PublicKey, nil },
		jwt.WithValidMethods([]string{"ES256"}), jwt.WithTimeFunc(func() time.Time { return now }))
	require.NoError(t, err)
	assert.Equal(t, "KEY1234567", parsed.Header["kid"])
	claims := parsed.Claims.(jwt.MapClaims)
	assert.Equal(t, "TEAM123456", claims["iss"])

	now = now.Add(30 * time.Minute)
	again, _ := sender.bearer()
	assert.Equal(t, first, again, "token re-signed too early")

	now = now.Add(25 * time.Minute)
	renewed, _ := sender.bearer()
	assert.NotEqual(t, first, renewed, "token kept past its lifetime")
}

func TestAPNSRequestShape(t *testing.T) {
	pemKey, _ := testAPNSKey(t)
	var got *http.Request
	var body []byte
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r
		body, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender, err := newAPNSSender(APNSConfig{KeyID: "K", TeamID: "T", PrivateKey: pemKey, Topic: "team.burcev.app"})
	require.NoError(t, err)
	sender.client = server.Client()
	sender.hosts = map[string]string{APNSProduction: server.URL}

	payload, err := newAPNSPayload(duePush{notificationID: "n-1", title: "Новая задача", content: "Выпить воды", actionURL: "/dashboard"})
	require.NoError(t, err)
	token := strings.Repeat("ab", 32)
	result, err := sender.send(context.Background(), APNSDevice{Token: token, Environment: APNSProduction}, payload, "n-1")
	require.NoError(t, err)

	assert.Equal(t, http.StatusOK, result.status)
	assert.Equal(t, "/3/device/"+token, got.URL.Path)
	assert.Equal(t, "team.burcev.app", got.Header.Get("apns-topic"))
	assert.Equal(t, "alert", got.Header.Get("apns-push-type"))
	assert.Equal(t, "n-1", got.Header.Get("apns-collapse-id"))
	assert.True(t, strings.HasPrefix(got.Header.Get("authorization"), "bearer "))

	var decoded map[string]any
	require.NoError(t, json.Unmarshal(body, &decoded))
	alert := decoded["aps"].(map[string]any)["alert"].(map[string]any)
	assert.Equal(t, "Новая задача", alert["title"])
	assert.Equal(t, "/dashboard", decoded["url"])
}

// A token Apple says is dead is deleted; a transient refusal is not.
func TestAPNSGoneAnswers(t *testing.T) {
	assert.True(t, apnsResult{status: 410, reason: "Unregistered"}.gone())
	assert.True(t, apnsResult{status: 400, reason: "BadDeviceToken"}.gone())
	assert.True(t, apnsResult{status: 400, reason: "DeviceTokenNotForTopic"}.gone())
	assert.False(t, apnsResult{status: 400, reason: "PayloadTooLarge"}.gone())
	assert.False(t, apnsResult{status: 429, reason: "TooManyRequests"}.gone())
	assert.False(t, apnsResult{status: 503, reason: "ServiceUnavailable"}.gone())
}
