package oauth_test

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/modules/auth/oauth/applestub"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Сценарии apple-sign-in на токенах, подписанных тестовым ключом, против
// заглушки appleid.apple.com.

type clock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *clock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.now }
func (c *clock) Add(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	c.mu.Unlock()
}

func newClock() *clock { return &clock{now: time.Now()} }

func credential(stub *applestub.Server, tok applestub.Token, code string) oauth.AppleCredential {
	if tok.RawNonce == "" {
		tok.RawNonce = "raw-nonce-1"
	}
	return oauth.AppleCredential{IdentityToken: stub.Sign(tok), AuthorizationCode: code, Nonce: tok.RawNonce}
}

func TestAppleAuthenticateReturnsTheProfileWithASealedRefreshToken(t *testing.T) {
	stub := applestub.New(t)
	stub.AcceptCode("code-1", "apple-refresh-1")
	apple := stub.Adapter(nil)

	in := credential(stub, applestub.Token{Subject: "001.abc", Email: "Person@Example.com"}, "code-1")
	in.FullName = &oauth.AppleName{GivenName: "Анна", FamilyName: "Петрова"}
	profile, err := apple.Authenticate(context.Background(), in)
	require.NoError(t, err)

	assert.Equal(t, "001.abc", profile.ProviderUserID)
	assert.Equal(t, "person@example.com", profile.Email)
	assert.Equal(t, "Анна Петрова", profile.Name)
	assert.NotContains(t, profile.SealedRefreshToken, "apple-refresh-1", "токен Apple хранится открытым")
	assert.Empty(t, stub.ClientSecretErrors, "client_secret не тот, что ждёт Apple")

	sealer, err := oauth.NewSealer(applestub.EncryptionKey)
	require.NoError(t, err)
	plain, err := sealer.Open(profile.SealedRefreshToken)
	require.NoError(t, err)
	assert.Equal(t, "apple-refresh-1", plain)
}

// «Новый пользователь со скрытым адресом»: адрес Private Relay с
// email_verified строкой "true" принимается как подтверждённый.
func TestApplePrivateRelayAddressCountsAsVerified(t *testing.T) {
	stub := applestub.New(t)
	stub.AcceptCode("code-1", "r")
	profile, err := stub.Adapter(nil).Authenticate(context.Background(), credential(stub, applestub.Token{
		Subject: "001.relay", Email: "x7k2@privaterelay.appleid.com", EmailVerified: "true", Private: true,
	}, "code-1"))
	require.NoError(t, err)
	assert.Equal(t, "x7k2@privaterelay.appleid.com", profile.Email)
}

// Адрес, который Apple не подтвердила, не используется: человека спросят.
func TestAppleUnverifiedAddressIsNotUsed(t *testing.T) {
	stub := applestub.New(t)
	stub.AcceptCode("code-1", "r")
	profile, err := stub.Adapter(nil).Authenticate(context.Background(), credential(stub, applestub.Token{
		Subject: "001.unverified", Email: "x@example.com", EmailVerified: "false",
	}, "code-1"))
	require.NoError(t, err)
	assert.Empty(t, profile.Email)
}

func TestAppleRejectsTokens(t *testing.T) {
	stub := applestub.New(t)
	apple := stub.Adapter(nil)

	cases := map[string]oauth.AppleCredential{
		// «Чужая аудитория»
		"другая аудитория": credential(stub, applestub.Token{Subject: "s", Audience: "com.other.app"}, "c"),
		"другой издатель":  credential(stub, applestub.Token{Subject: "s", Issuer: "https://evil.example"}, "c"),
		"истёк":            credential(stub, applestub.Token{Subject: "s", ExpiresAt: time.Now().Add(-time.Minute)}, "c"),
		"без sub":          credential(stub, applestub.Token{}, "c"),
		"чужая подпись":    credential(stub, applestub.Token{Subject: "s", Kid: "kid-unknown"}, "c"),
	}
	// «Подменённый nonce»
	swapped := credential(stub, applestub.Token{Subject: "s", RawNonce: "nonce-of-the-real-sign-in"}, "c")
	swapped.Nonce = "attackers-nonce"
	cases["подменённый nonce"] = swapped
	// nonce, переданный уже хэшем, тоже не подходит: хэшируем мы.
	hashed := credential(stub, applestub.Token{Subject: "s", RawNonce: "raw"}, "c")
	hashed.Nonce = applestub.HashNonce("raw")
	cases["nonce хэшем"] = hashed
	none := credential(stub, applestub.Token{Subject: "s"}, "c")
	none.Nonce = ""
	cases["без nonce"] = none

	for name, in := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := apple.Authenticate(context.Background(), in)
			require.ErrorIs(t, err, oauth.ErrIdentityRejected)
		})
	}
}

// Код, который Apple не принимает (уже обменян, просрочен): тот же отказ.
func TestAppleRefusedAuthorizationCodeIsRejected(t *testing.T) {
	stub := applestub.New(t)
	_, err := stub.Adapter(nil).Authenticate(context.Background(),
		credential(stub, applestub.Token{Subject: "s"}, "spent-code"))
	require.ErrorIs(t, err, oauth.ErrIdentityRejected)
}

// Точка выдачи токенов Apple не отвечает: это не отказ в личности, а
// недоступность (503 apple_unavailable у обработчика). Identify без обмена
// при этом работает и токен не трогает.
func TestAppleTokenEndpointDownIsUnavailableNotRejected(t *testing.T) {
	stub := applestub.New(t)
	apple := stub.Adapter(nil)
	stub.AcceptCode("code-1", "refresh-1")
	in := credential(stub, applestub.Token{Subject: "s", Email: "a@example.test"}, "code-1")
	stub.SetFailToken(true)

	_, err := apple.Authenticate(context.Background(), in)
	require.ErrorIs(t, err, oauth.ErrAppleUnavailable)
	require.NotErrorIs(t, err, oauth.ErrIdentityRejected)

	profile, err := apple.Identify(context.Background(), in)
	require.NoError(t, err)
	require.Equal(t, "s", profile.ProviderUserID)
	require.Equal(t, "a@example.test", profile.Email)
	require.Empty(t, profile.SealedRefreshToken)

	stub.SetFailToken(false)
	sealed, err := apple.ExchangeCode(context.Background(), "code-1")
	require.NoError(t, err)
	require.NotEmpty(t, sealed)
}

// Набор ключей Apple недоступен, а в кэше ключа нет: проверить токен нечем —
// это недоступность, а не поддельный токен.
func TestAppleKeysUnreachableIsUnavailable(t *testing.T) {
	stub := applestub.New(t)
	apple := stub.Adapter(nil)
	in := credential(stub, applestub.Token{Subject: "s"}, "code-1")
	stub.Close()

	_, err := apple.Identify(context.Background(), in)
	require.ErrorIs(t, err, oauth.ErrAppleUnavailable)
	require.NotErrorIs(t, err, oauth.ErrIdentityRejected)
}

// «Неизвестный ключ подписи»: набор ключей кэшируется на час; неизвестный kid
// перечитывает его, но не чаще раза в минуту, и проверка идёт по свежему.
func TestAppleKeysAreCachedAndRefetchedAtMostOnceAMinute(t *testing.T) {
	stub := applestub.New(t)
	clk := newClock()
	apple := stub.Adapter(clk.Now)
	ctx := context.Background()

	verify := func(kid string) error {
		_, err := apple.Verify(ctx, stub.Sign(applestub.Token{Subject: "s", Kid: kid, RawNonce: "n", ExpiresAt: clk.Now().Add(time.Hour)}), "n")
		return err
	}

	require.NoError(t, verify("kid-1"))
	require.NoError(t, verify("kid-1"))
	assert.Equal(t, 1, stub.Fetches(), "ключи читаются при каждой проверке")

	// Apple сменила ключ: токен с новым kid — перечитывание и успех.
	stub.AddSigningKey("kid-2")
	clk.Add(2 * time.Minute)
	require.NoError(t, verify("kid-2"))
	assert.Equal(t, 2, stub.Fetches())

	// Поток подделок с выдуманными kid не превращается в поток запросов.
	for range 10 {
		require.ErrorIs(t, verify("kid-made-up"), oauth.ErrIdentityRejected)
	}
	assert.Equal(t, 2, stub.Fetches(), "неизвестный kid перечитал ключи чаще раза в минуту")
	clk.Add(61 * time.Second)
	require.ErrorIs(t, verify("kid-made-up"), oauth.ErrIdentityRejected)
	assert.Equal(t, 3, stub.Fetches())

	// Через час кэш устаревает и для известного kid.
	clk.Add(time.Hour)
	require.NoError(t, verify("kid-1"))
	assert.Equal(t, 4, stub.Fetches())
}

func TestAppleRevokeSendsTheStoredToken(t *testing.T) {
	stub := applestub.New(t)
	stub.AcceptCode("code-1", "apple-refresh-9")
	apple := stub.Adapter(nil)
	profile, err := apple.Authenticate(context.Background(), credential(stub, applestub.Token{Subject: "s"}, "code-1"))
	require.NoError(t, err)

	require.NoError(t, apple.Revoke(context.Background(), profile.SealedRefreshToken))
	assert.Equal(t, []string{"apple-refresh-9"}, stub.RevokedTokens())
	assert.Empty(t, stub.ClientSecretErrors)

	stub.SetFailRevoke(true)
	require.Error(t, apple.Revoke(context.Background(), profile.SealedRefreshToken))
}

func TestSealerRoundTripAndTamper(t *testing.T) {
	sealer, err := oauth.NewSealer(applestub.EncryptionKey)
	require.NoError(t, err)
	a, err := sealer.Seal("secret")
	require.NoError(t, err)
	b, err := sealer.Seal("secret")
	require.NoError(t, err)
	assert.NotEqual(t, a, b, "одинаковые токены шифруются одинаково")

	plain, err := sealer.Open(a)
	require.NoError(t, err)
	assert.Equal(t, "secret", plain)

	_, err = sealer.Open(strings.Replace(a, a[len(a)-4:], "AAAA", 1))
	assert.Error(t, err)
	_, err = oauth.NewSealer("c2hvcnQ=")
	assert.Error(t, err)
}

func TestNewAppleRefusesABadKey(t *testing.T) {
	stub := applestub.New(t)
	cfg := stub.Config(nil)
	cfg.PrivateKey = "not a key"
	_, err := oauth.NewApple(cfg)
	assert.ErrorContains(t, err, "APPLE_PRIVATE_KEY")
}
