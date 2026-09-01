package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// yandexProvider implements sign-in through Yandex ID.
//
// Yandex returns the address as `default_email`, and the avatar as an id that
// has to be turned into a URL — the sort of per-provider detail this adapter
// exists to contain.
type yandexProvider struct {
	clientID     string
	clientSecret string
	httpClient   *http.Client
	// Endpoints are fields rather than constants so the exchange can be
	// exercised against a stub in tests.
	authURL    string
	tokenURL   string
	profileURL string
}

// NewYandex creates the adapter. Returns nil when credentials are absent, so an
// unconfigured provider is simply not offered.
func NewYandex(clientID, clientSecret string) Provider {
	if clientID == "" || clientSecret == "" {
		return nil
	}
	return &yandexProvider{
		clientID:     clientID,
		clientSecret: clientSecret,
		httpClient:   &http.Client{Timeout: 15 * time.Second},
		authURL:      "https://oauth.yandex.ru/authorize",
		tokenURL:     "https://oauth.yandex.ru/token",
		profileURL:   "https://login.yandex.ru/info?format=json",
	}
}

func (p *yandexProvider) Name() string { return "yandex" }

func (p *yandexProvider) AuthorizationURL(state, codeChallenge, redirectURI string) string {
	params := url.Values{
		"response_type":         {"code"},
		"client_id":             {p.clientID},
		"redirect_uri":          {redirectURI},
		"state":                 {state},
		"code_challenge":        {codeChallenge},
		"code_challenge_method": {"S256"},
	}
	return p.authURL + "?" + params.Encode()
}

func (p *yandexProvider) Exchange(ctx context.Context, code, codeVerifier, redirectURI string) (*Profile, error) {
	token, err := p.exchangeCode(ctx, code, codeVerifier, redirectURI)
	if err != nil {
		return nil, err
	}
	return p.fetchProfile(ctx, token)
}

func (p *yandexProvider) exchangeCode(ctx context.Context, code, codeVerifier, redirectURI string) (string, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"client_id":     {p.clientID},
		"client_secret": {p.clientSecret},
		"code_verifier": {codeVerifier},
		"redirect_uri":  {redirectURI},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("exchange code: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token endpoint returned %d", resp.StatusCode)
	}

	var body struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}
	if body.AccessToken == "" {
		return "", fmt.Errorf("token endpoint returned no access token")
	}
	return body.AccessToken, nil
}

func (p *yandexProvider) fetchProfile(ctx context.Context, token string) (*Profile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.profileURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build profile request: %w", err)
	}
	req.Header.Set("Authorization", "OAuth "+token)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch profile: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("profile endpoint returned %d", resp.StatusCode)
	}

	var body struct {
		ID           string `json:"id"`
		DefaultEmail string `json:"default_email"`
		DisplayName  string `json:"display_name"`
		RealName     string `json:"real_name"`
		AvatarID     string `json:"default_avatar_id"`
		AvatarEmpty  bool   `json:"is_avatar_empty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decode profile: %w", err)
	}
	if body.ID == "" {
		return nil, fmt.Errorf("profile has no id")
	}

	name := body.DisplayName
	if name == "" {
		name = body.RealName
	}

	var avatar string
	if !body.AvatarEmpty && body.AvatarID != "" {
		avatar = "https://avatars.yandex.net/get-yapic/" + body.AvatarID + "/islands-200"
	}

	return &Profile{
		ProviderUserID: body.ID,
		Email:          body.DefaultEmail,
		Name:           name,
		AvatarURL:      avatar,
	}, nil
}
