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

// vkProvider implements sign-in through VK ID.
//
// VK returns the profile alongside the token rather than from a separate
// endpoint, and the email only when the `email` scope was granted — so an empty
// address here is normal, not an error.
type vkProvider struct {
	clientID     string
	clientSecret string
	httpClient   *http.Client
}

// NewVK creates the adapter. Returns nil when credentials are absent.
func NewVK(clientID, clientSecret string) Provider {
	if clientID == "" || clientSecret == "" {
		return nil
	}
	return &vkProvider{
		clientID:     clientID,
		clientSecret: clientSecret,
		httpClient:   &http.Client{Timeout: 15 * time.Second},
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
	return "https://id.vk.com/authorize?" + params.Encode()
}

func (p *vkProvider) Exchange(ctx context.Context, code, codeVerifier, redirectURI string) (*Profile, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"client_id":     {p.clientID},
		"client_secret": {p.clientSecret},
		"code_verifier": {codeVerifier},
		"redirect_uri":  {redirectURI},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://id.vk.com/oauth2/auth", strings.NewReader(form.Encode()))
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

	var body struct {
		UserID string `json:"user_id"`
		Email  string `json:"email"`
		User   struct {
			UserID    string `json:"user_id"`
			FirstName string `json:"first_name"`
			LastName  string `json:"last_name"`
			Avatar    string `json:"avatar"`
			Email     string `json:"email"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decode token response: %w", err)
	}

	id := body.UserID
	if id == "" {
		id = body.User.UserID
	}
	if id == "" {
		return nil, fmt.Errorf("token response has no user id")
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
