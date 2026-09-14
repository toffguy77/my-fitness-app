package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"github.com/burcev/api/internal/shared/httpx"
	"strings"
	"time"
)

// vkProvider implements sign-in through VK ID.
//
// Протокол — OAuth 2.1 с PKCE, и профиль в нём отдаётся **отдельным** запросом
// к oauth2/user_info. Здесь раньше считалось иначе: профиль искали в ответе на
// обмен кода. Обмен при этом проходил успешно, VK отвечал 200 — и вход падал с
// «token response has no user id», то есть жалобой на собеседника вместо своей
// ошибки. Проверки это пропустили, потому что подделывали тот же неверный
// протокол: заглушка отдавала профиль вместе с токеном.
//
// Адрес почты приходит только при выданном разрешении `email`, так что пустой
// адрес — обычный исход, а не отказ.
type vkProvider struct {
	clientID     string
	clientSecret string
	httpClient   *http.Client
	// Endpoints are fields rather than constants so the exchange can be
	// exercised against a stub in tests.
	authURL     string
	tokenURL    string
	userInfoURL string
}

// vkID принимает идентификатор и строкой, и числом.
//
// VK отдаёт его по-разному в разных местах протокола, и жёсткий тип здесь
// означает отказ входа при следующей правке на их стороне.
type vkID string

func (v *vkID) UnmarshalJSON(data []byte) error {
	text := strings.Trim(string(data), `"`)
	if text == "null" {
		text = ""
	}
	*v = vkID(text)
	return nil
}

// NewVK creates the adapter. Returns nil when credentials are absent.
func NewVK(clientID, clientSecret string) Provider {
	if clientID == "" || clientSecret == "" {
		return nil
	}
	return &vkProvider{
		clientID:     clientID,
		clientSecret: clientSecret,
		// Через httpx: на этом хосте нет маршрута в IPv6, и собственный клиент
		// означал бы тот же молчаливый отказ, что обездвижил бота.
		httpClient:  httpx.NewClient(15 * time.Second),
		authURL:     "https://id.vk.com/authorize",
		tokenURL:    "https://id.vk.com/oauth2/auth",
		userInfoURL: "https://id.vk.com/oauth2/user_info",
	}
}

func (p *vkProvider) Name() string { return "vk" }

func (p *vkProvider) AuthorizationURL(state, codeChallenge, redirectURI string) string {
	params := url.Values{
		"response_type":         {"code"},
		"client_id":             {p.clientID},
		"redirect_uri":          {redirectURI},
		"state":                 {state},
		"scope":                 {"email"},
		"code_challenge":        {codeChallenge},
		"code_challenge_method": {"s256"},
	}
	return p.authURL + "?" + params.Encode()
}

func (p *vkProvider) Exchange(ctx context.Context, in ExchangeRequest) (*Profile, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {in.Code},
		"client_id":     {p.clientID},
		"client_secret": {p.clientSecret},
		"code_verifier": {in.CodeVerifier},
		"redirect_uri":  {in.RedirectURI},
	}
	// VK ID выдаёт код вместе с device_id и без него токен не отдаёт. Поля нет
	// в обычном OAuth, поэтому оно приходит из обратного вызова как есть.
	if deviceID := in.Callback.Get("device_id"); deviceID != "" {
		form.Set("device_id", deviceID)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token endpoint returned %d", resp.StatusCode)
	}

	var token struct {
		AccessToken string `json:"access_token"`
		UserID      vkID   `json:"user_id"`
		// VK отвечает на отказ кодом 200 и телом с ошибкой. Пока эти поля не
		// читались, любой отказ выглядел как «нет токена» — то есть как наша
		// неисправность, и починить по такому сообщению было нечего.
		Error       string `json:"error"`
		Description string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&token); err != nil {
		return nil, fmt.Errorf("decode token response: %w", err)
	}
	if token.Error != "" {
		return nil, fmt.Errorf("vk refused the exchange: %s (%s)", token.Error, token.Description)
	}
	if token.AccessToken == "" {
		return nil, fmt.Errorf("token response has no access token and no error")
	}

	profile, err := p.userInfo(ctx, token.AccessToken)
	if err != nil {
		return nil, err
	}
	if profile.ProviderUserID == "" {
		// Обмен прошёл, а профиль не назвал владельца — это неисправность
		// протокола, а не отказ входа, и звучать должна именно так.
		profile.ProviderUserID = string(token.UserID)
	}
	if profile.ProviderUserID == "" {
		return nil, fmt.Errorf("neither the token nor the profile names a user")
	}
	return profile, nil
}

// userInfo asks VK who the token belongs to.
//
// Отдельный запрос, потому что так устроен VK ID: обмен кода возвращает токен,
// и только он. Имя, идентификатор и адрес живут здесь.
func (p *vkProvider) userInfo(ctx context.Context, accessToken string) (*Profile, error) {
	form := url.Values{
		"client_id":    {p.clientID},
		"access_token": {accessToken},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.userInfoURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("build user_info request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch user_info: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("user_info returned %d", resp.StatusCode)
	}

	var body struct {
		UserID vkID   `json:"user_id"`
		Email  string `json:"email"`
		User   struct {
			UserID    vkID   `json:"user_id"`
			FirstName string `json:"first_name"`
			LastName  string `json:"last_name"`
			Avatar    string `json:"avatar"`
			Email     string `json:"email"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decode user_info: %w", err)
	}

	id := string(body.UserID)
	if id == "" {
		id = string(body.User.UserID)
	}

	email := body.Email
	if email == "" {
		email = body.User.Email
	}

	name := strings.TrimSpace(body.User.FirstName + " " + body.User.LastName)

	return &Profile{
		ProviderUserID: id,
		Email:          email,
		Name:           name,
		AvatarURL:      body.User.Avatar,
	}, nil
}
