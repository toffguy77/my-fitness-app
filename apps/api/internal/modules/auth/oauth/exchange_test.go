package oauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubProvider points a real adapter at a local server so the exchange runs
// end to end without reaching the provider.
func stubYandex(t *testing.T, token, profile http.HandlerFunc) Provider {
	t.Helper()
	tokenSrv := httptest.NewServer(token)
	profileSrv := httptest.NewServer(profile)
	t.Cleanup(tokenSrv.Close)
	t.Cleanup(profileSrv.Close)

	p := NewYandex("client", "secret").(*yandexProvider)
	p.tokenURL = tokenSrv.URL
	p.profileURL = profileSrv.URL
	return p
}

func stubVK(t *testing.T, token http.HandlerFunc) Provider {
	t.Helper()
	srv := httptest.NewServer(token)
	t.Cleanup(srv.Close)

	p := NewVK("client", "secret").(*vkProvider)
	p.tokenURL = srv.URL
	return p
}

func TestYandexExchange_SendsTheVerifierAndReadsTheProfile(t *testing.T) {
	var gotForm url.Values
	var gotAuth string

	provider := stubYandex(t,
		func(w http.ResponseWriter, r *http.Request) {
			require.NoError(t, r.ParseForm())
			gotForm = r.PostForm
			_, _ = w.Write([]byte(`{"access_token":"at-1"}`))
		},
		func(w http.ResponseWriter, r *http.Request) {
			gotAuth = r.Header.Get("Authorization")
			_, _ = w.Write([]byte(`{"id":"77","default_email":"a@ya.ru","display_name":"Аня","default_avatar_id":"av1"}`))
		})

	profile, err := provider.Exchange(context.Background(), "the-code", "the-verifier", "https://app/cb")

	require.NoError(t, err)
	// Without the verifier an intercepted code would be redeemable by anyone.
	assert.Equal(t, "the-verifier", gotForm.Get("code_verifier"))
	assert.Equal(t, "the-code", gotForm.Get("code"))
	assert.Equal(t, "authorization_code", gotForm.Get("grant_type"))
	assert.Equal(t, "OAuth at-1", gotAuth)

	assert.Equal(t, "77", profile.ProviderUserID)
	assert.Equal(t, "a@ya.ru", profile.Email)
	assert.Equal(t, "Аня", profile.Name)
	assert.Contains(t, profile.AvatarURL, "av1")
}

// An avatar the user never set must not become a broken image.
func TestYandexExchange_OmitsAnEmptyAvatar(t *testing.T) {
	provider := stubYandex(t,
		func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"access_token":"at"}`)) },
		func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"id":"1","real_name":"Real","default_avatar_id":"x","is_avatar_empty":true}`))
		})

	profile, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

	require.NoError(t, err)
	assert.Empty(t, profile.AvatarURL)
	assert.Equal(t, "Real", profile.Name, "the real name stands in for a missing display name")
}

// Every one of these responses would otherwise produce a profile with an empty
// identifier — and an account keyed on nothing.
func TestYandexExchange_RefusesUnusableResponses(t *testing.T) {
	cases := []struct {
		name    string
		token   http.HandlerFunc
		profile http.HandlerFunc
	}{
		{
			name:  "token endpoint rejects the code",
			token: func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusBadRequest) },
		},
		{
			name:  "token response carries no token",
			token: func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{}`)) },
		},
		{
			name:  "token response is not JSON",
			token: func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`<html>`)) },
		},
		{
			name:    "profile endpoint refuses the token",
			token:   func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"access_token":"at"}`)) },
			profile: func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnauthorized) },
		},
		{
			name:    "profile has no id",
			token:   func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"access_token":"at"}`)) },
			profile: func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"default_email":"a@ya.ru"}`)) },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.profile == nil {
				tc.profile = func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }
			}
			_, err := stubYandex(t, tc.token, tc.profile).
				Exchange(context.Background(), "c", "v", "https://app/cb")

			assert.Error(t, err)
		})
	}
}

// VK returns the profile alongside the token, in either of two shapes.
func TestVKExchange_ReadsBothResponseShapes(t *testing.T) {
	t.Run("identifier at the top level", func(t *testing.T) {
		provider := stubVK(t, func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"user_id":"5","email":"a@vk.ru","user":{"first_name":"Иван","last_name":"Петров"}}`))
		})

		profile, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

		require.NoError(t, err)
		assert.Equal(t, "5", profile.ProviderUserID)
		assert.Equal(t, "a@vk.ru", profile.Email)
		assert.Equal(t, "Иван Петров", profile.Name)
	})

	t.Run("identifier nested in the user object", func(t *testing.T) {
		provider := stubVK(t, func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"user":{"user_id":"6","email":"b@vk.ru","first_name":"Ольга","avatar":"https://vk/a.jpg"}}`))
		})

		profile, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

		require.NoError(t, err)
		assert.Equal(t, "6", profile.ProviderUserID)
		assert.Equal(t, "b@vk.ru", profile.Email)
		assert.Equal(t, "Ольга", profile.Name)
		assert.Equal(t, "https://vk/a.jpg", profile.AvatarURL)
	})
}

// Without the `email` scope VK returns no address. That is an ordinary outcome
// the caller resolves by asking the user, not a failure.
func TestVKExchange_MissingEmailIsNotAnError(t *testing.T) {
	provider := stubVK(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"user_id":"9","user":{"first_name":"Без","last_name":"Почты"}}`))
	})

	profile, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

	require.NoError(t, err)
	assert.Empty(t, profile.Email)
	assert.Equal(t, "9", profile.ProviderUserID)
}

func TestVKExchange_RefusesAResponseWithoutAnIdentifier(t *testing.T) {
	provider := stubVK(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"user":{"first_name":"Никто"}}`))
	})

	_, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

	assert.Error(t, err)
}
