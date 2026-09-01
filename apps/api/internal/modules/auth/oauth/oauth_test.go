package oauth

import (
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A provider without credentials must not be registered at all: a sign-in
// screen must never show a button that cannot work.
func TestProviders_AbsentCredentialsYieldNoProvider(t *testing.T) {
	assert.Nil(t, NewYandex("", ""))
	assert.Nil(t, NewYandex("id", ""))
	assert.Nil(t, NewVK("", "secret"))

	assert.NotNil(t, NewYandex("id", "secret"))
	assert.NotNil(t, NewVK("id", "secret"))
}

func TestRegistry_OnlyOffersConfiguredProviders(t *testing.T) {
	r := NewRegistry()
	assert.False(t, r.Enabled())
	assert.Empty(t, r.Names())

	r.Register(NewYandex("id", "secret"))

	assert.True(t, r.Enabled())
	assert.Equal(t, []string{"yandex"}, r.Names())

	_, err := r.Get("vk")
	assert.Error(t, err, "an unconfigured provider must not resolve")
}

// PKCE removes the class of attack where an intercepted authorization code is
// redeemed by somebody else, so the challenge must actually derive from the
// verifier and the state must be unguessable.
func TestPKCE_ChallengeDerivesFromVerifier(t *testing.T) {
	pkce, err := NewPKCE()
	require.NoError(t, err)

	assert.Equal(t, pkce.Challenge, ChallengeFor(pkce.Verifier))
	assert.NotEqual(t, pkce.Challenge, ChallengeFor(pkce.Verifier+"x"))
}

func TestPKCE_ValuesAreUnpredictable(t *testing.T) {
	states := make(map[string]bool)
	verifiers := make(map[string]bool)
	for i := 0; i < 200; i++ {
		pkce, err := NewPKCE()
		require.NoError(t, err)
		assert.False(t, states[pkce.State], "state repeated")
		assert.False(t, verifiers[pkce.Verifier], "verifier repeated")
		states[pkce.State] = true
		verifiers[pkce.Verifier] = true
		assert.GreaterOrEqual(t, len(pkce.State), 32)
	}
}

func TestAuthorizationURL_CarriesPKCEAndState(t *testing.T) {
	for _, provider := range []Provider{NewYandex("client", "secret"), NewVK("client", "secret")} {
		t.Run(provider.Name(), func(t *testing.T) {
			raw := provider.AuthorizationURL("the-state", "the-challenge", "https://app/callback")

			parsed, err := url.Parse(raw)
			require.NoError(t, err)
			q := parsed.Query()

			assert.Equal(t, "code", q.Get("response_type"))
			assert.Equal(t, "client", q.Get("client_id"))
			assert.Equal(t, "the-state", q.Get("state"))
			assert.Equal(t, "the-challenge", q.Get("code_challenge"))
			assert.Equal(t, "https://app/callback", q.Get("redirect_uri"))
			assert.NotEmpty(t, q.Get("code_challenge_method"))
			// The client secret must never appear in a URL the browser follows.
			assert.NotContains(t, raw, "secret")
		})
	}
}
