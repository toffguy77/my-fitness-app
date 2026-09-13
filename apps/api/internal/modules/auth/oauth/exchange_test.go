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

// stubVK подделывает оба шага VK ID: обмен кода на токен и запрос профиля.
//
// Двумя, а не одним, потому что так устроен протокол. Прежняя заглушка отдавала
// профиль вместе с токеном — и проверка доказывала не поведение VK, а веру в
// него: вход падал на живом входе с «token response has no user id», а набор
// оставался зелёным.
func stubVK(t *testing.T, token, userInfo http.HandlerFunc) Provider {
	t.Helper()
	tokenSrv := httptest.NewServer(token)
	userSrv := httptest.NewServer(userInfo)
	t.Cleanup(tokenSrv.Close)
	t.Cleanup(userSrv.Close)

	p := NewVK("client", "secret").(*vkProvider)
	p.tokenURL = tokenSrv.URL
	p.userInfoURL = userSrv.URL
	return p
}

/** Ответ на обмен кода: только токен, как и отдаёт VK ID. */
func vkToken(w http.ResponseWriter, _ *http.Request) {
	_, _ = w.Write([]byte(`{"access_token":"t","refresh_token":"r","expires_in":3600}`))
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

// Профиль приходит из user_info, в любом из двух видов — и с числовым
// идентификатором тоже: VK отдаёт его по-разному в разных местах протокола.
func TestVKExchange_ReadsTheProfileFromUserInfo(t *testing.T) {
	t.Run("идентификатор на верхнем уровне", func(t *testing.T) {
		provider := stubVK(t, vkToken, func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"user_id":"5","email":"a@vk.ru","user":{"first_name":"Иван","last_name":"Петров"}}`))
		})

		profile, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

		require.NoError(t, err)
		assert.Equal(t, "5", profile.ProviderUserID)
		assert.Equal(t, "a@vk.ru", profile.Email)
		assert.Equal(t, "Иван Петров", profile.Name)
	})

	t.Run("идентификатор внутри user", func(t *testing.T) {
		provider := stubVK(t, vkToken, func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"user":{"user_id":"6","email":"b@vk.ru","first_name":"Ольга","avatar":"https://vk/a.jpg"}}`))
		})

		profile, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

		require.NoError(t, err)
		assert.Equal(t, "6", profile.ProviderUserID)
		assert.Equal(t, "b@vk.ru", profile.Email)
		assert.Equal(t, "Ольга", profile.Name)
		assert.Equal(t, "https://vk/a.jpg", profile.AvatarURL)
	})

	t.Run("числовой идентификатор", func(t *testing.T) {
		provider := stubVK(t, vkToken, func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"user":{"user_id":774561,"first_name":"Число"}}`))
		})

		profile, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

		require.NoError(t, err)
		assert.Equal(t, "774561", profile.ProviderUserID,
			"жёсткий тип здесь означает отказ входа при следующей правке у VK")
	})
}

// Ответ на обмен кода профиля не содержит — и это норма, а не отказ. Ровно на
// этом вход и ломался: код искал владельца там, где его нет.
func TestVKExchange_TokenResponseCarriesNoProfile(t *testing.T) {
	var askedUserInfo bool
	provider := stubVK(t, vkToken, func(w http.ResponseWriter, r *http.Request) {
		askedUserInfo = true
		require.NoError(t, r.ParseForm())
		assert.Equal(t, "t", r.Form.Get("access_token"), "профиль просят по полученному токену")
		assert.Equal(t, "client", r.Form.Get("client_id"))
		_, _ = w.Write([]byte(`{"user":{"user_id":"77","first_name":"Кто","last_name":"То"}}`))
	})

	profile, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

	require.NoError(t, err)
	assert.True(t, askedUserInfo, "профиль обязан запрашиваться отдельно")
	assert.Equal(t, "77", profile.ProviderUserID)
}

// Без разрешения `email` адреса нет. Это обычный исход: его спрашивают у
// человека, а не считают отказом.
func TestVKExchange_MissingEmailIsNotAnError(t *testing.T) {
	provider := stubVK(t, vkToken, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"user_id":"9","user":{"first_name":"Без","last_name":"Почты"}}`))
	})

	profile, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

	require.NoError(t, err)
	assert.Empty(t, profile.Email)
	assert.Equal(t, "9", profile.ProviderUserID)
}

// Ни токен, ни профиль не назвали владельца — входить некому.
func TestVKExchange_RefusesWhenNobodyNamesTheUser(t *testing.T) {
	provider := stubVK(t, vkToken, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"user":{"first_name":"Никто"}}`))
	})

	_, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

	assert.Error(t, err)
}

// Обмен без токена — неисправность, и говорить надо о ней, а не идти дальше.
func TestVKExchange_RefusesATokenResponseWithoutAToken(t *testing.T) {
	provider := stubVK(t,
		func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
		},
		func(w http.ResponseWriter, _ *http.Request) {
			t.Error("профиль не должен запрашиваться без токена")
		})

	_, err := provider.Exchange(context.Background(), "c", "v", "https://app/cb")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "access token")
}
