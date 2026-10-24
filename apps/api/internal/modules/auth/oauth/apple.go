package oauth

import (
	"context"
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Sign in with Apple.
//
// Apple differs from Yandex and VK in how the profile arrives, not in what
// happens to it: the app gets an identity token from AuthenticationServices
// and hands it to us, so there is no browser redirect to start and no
// callback. The adapter therefore implements Name and Authenticate (the
// IdentityTokenProvider shape) rather than AuthorizationURL and Exchange; the
// profile it returns goes through the same sign-in, consents, linking and
// unlinking as every other provider's.
//
// What it checks, in the identity token:
//   - the signature, by a key from https://appleid.apple.com/auth/keys picked
//     by kid (RS256 only);
//   - iss = https://appleid.apple.com, aud = APPLE_BUNDLE_ID, exp not passed;
//   - nonce = hex(SHA-256(raw nonce)). The server issues the raw nonce
//     (auth.IssueAppleNonce), the app sets ASAuthorizationAppleIDRequest.nonce
//     to its SHA-256 in lowercase hex and sends us the raw value back; Apple
//     copies the request's nonce into the token verbatim. That the raw nonce
//     was issued by us and is spent once is the caller's check
//     (auth.ConsumeAppleNonce), not this adapter's;
//   - email_verified: an address Apple has not verified is not used (the
//     person is asked for one). Private relay addresses
//     (@privaterelay.appleid.com) are verified by Apple itself.
//
// The authorization_code is exchanged for Apple's refresh token — it is
// single use and lives five minutes — and the token is kept sealed: it is
// what account deletion revokes (Guideline 5.1.1(v)). Identify and
// ExchangeCode are separate so a caller that already holds a token for this
// Apple ID can sign the person in while Apple's token endpoint is down.

const (
	appleIssuer = "https://appleid.apple.com"
	// appleKeysTTL: Apple rotates its signing keys rarely and without notice.
	appleKeysTTL = time.Hour
	// appleRefetchInterval bounds refetching on an unknown kid, so a stream
	// of forged tokens with made-up kids cannot turn us into a client
	// hammering Apple.
	appleRefetchInterval = time.Minute
	// appleClientSecretTTL: Apple accepts up to six months; a short one is
	// minted per call, nothing to cache or rotate.
	appleClientSecretTTL = 5 * time.Minute
)

// ErrIdentityRejected: the identity token or the authorization code is not
// acceptable — forged, expired, for another app, replayed, or refused by
// Apple. The caller answers 401 token_invalid.
var ErrIdentityRejected = errors.New("apple identity rejected")

// ErrAppleUnavailable: Apple did not answer as it should — its key set or
// token endpoint is unreachable, timed out or failed. Nothing is wrong with
// what the person sent; the same request may succeed later.
var ErrAppleUnavailable = errors.New("apple is unavailable")

// AppleConfig is what the adapter needs; all of it comes from APPLE_*.
type AppleConfig struct {
	TeamID     string
	BundleID   string
	KeyID      string
	PrivateKey string // contents of AuthKey_XXXX.p8
	// Sealer encrypts the refresh token for storage.
	Sealer *Sealer
	// BaseURL replaces https://appleid.apple.com in tests.
	BaseURL string
	// Now replaces time.Now in tests.
	Now func() time.Time
}

// Apple is the Sign in with Apple adapter.
type Apple struct {
	cfg        AppleConfig
	key        *ecdsa.PrivateKey
	httpClient *http.Client
	keysURL    string
	tokenURL   string
	revokeURL  string
	now        func() time.Time

	mu          sync.Mutex
	keys        map[string]*rsa.PublicKey
	fetchedAt   time.Time
	lastAttempt time.Time
}

// NewApple creates the adapter. The key is parsed here so a bad
// APPLE_PRIVATE_KEY stops the start instead of failing the first sign-in.
func NewApple(cfg AppleConfig) (*Apple, error) {
	if cfg.TeamID == "" || cfg.BundleID == "" || cfg.KeyID == "" || cfg.PrivateKey == "" || cfg.Sealer == nil {
		return nil, errors.New("sign in with apple is not configured")
	}
	// A key pasted into an environment variable often arrives with literal \n
	// in place of line breaks — as APNS_PRIVATE_KEY does.
	block, _ := pem.Decode([]byte(strings.ReplaceAll(cfg.PrivateKey, `\n`, "\n")))
	if block == nil {
		return nil, errors.New("APPLE_PRIVATE_KEY is not a PEM key (expected the contents of AuthKey_XXXX.p8)")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse APPLE_PRIVATE_KEY: %w", err)
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("APPLE_PRIVATE_KEY is not an EC key")
	}

	base := strings.TrimRight(cfg.BaseURL, "/")
	if base == "" {
		base = appleIssuer
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	return &Apple{
		cfg:        cfg,
		key:        key,
		httpClient: &http.Client{Timeout: 15 * time.Second},
		keysURL:    base + "/auth/keys",
		tokenURL:   base + "/auth/token",
		revokeURL:  base + "/auth/revoke",
		now:        now,
	}, nil
}

// Name is the provider's stable identifier.
func (a *Apple) Name() string { return "apple" }

// AppleName is the name Apple hands the app on the first authorization only.
type AppleName struct {
	GivenName  string `json:"given_name"`
	FamilyName string `json:"family_name"`
}

// AppleCredential is what the app received from AuthenticationServices.
type AppleCredential struct {
	IdentityToken     string
	AuthorizationCode string
	// Nonce is the raw value; the token carries hex(SHA-256(Nonce)).
	Nonce    string
	FullName *AppleName
}

// Authenticate verifies the identity token, exchanges the authorization code
// for Apple's refresh token and returns the profile, the token sealed in it.
func (a *Apple) Authenticate(ctx context.Context, in AppleCredential) (*Profile, error) {
	profile, err := a.Identify(ctx, in)
	if err != nil {
		return nil, err
	}
	sealed, err := a.ExchangeCode(ctx, in.AuthorizationCode)
	if err != nil {
		return nil, err
	}
	profile.SealedRefreshToken = sealed
	return profile, nil
}

// Identify verifies the identity token and returns the profile without
// talking to Apple's token endpoint: SealedRefreshToken stays empty.
func (a *Apple) Identify(ctx context.Context, in AppleCredential) (*Profile, error) {
	claims, err := a.Verify(ctx, in.IdentityToken, in.Nonce)
	if err != nil {
		return nil, err
	}
	profile := &Profile{ProviderUserID: claims.Subject}
	if claims.EmailVerified {
		profile.Email = strings.ToLower(strings.TrimSpace(claims.Email))
	}
	if in.FullName != nil {
		profile.Name = strings.TrimSpace(strings.TrimSpace(in.FullName.GivenName) + " " + strings.TrimSpace(in.FullName.FamilyName))
	}
	return profile, nil
}

// ExchangeCode trades the authorization code for Apple's refresh token and
// returns it sealed. A code Apple refuses wraps ErrIdentityRejected; Apple
// failing to answer wraps ErrAppleUnavailable.
func (a *Apple) ExchangeCode(ctx context.Context, code string) (string, error) {
	refresh, err := a.exchangeCode(ctx, code)
	if err != nil {
		return "", err
	}
	sealed, err := a.cfg.Sealer.Seal(refresh)
	if err != nil {
		return "", fmt.Errorf("seal apple refresh token: %w", err)
	}
	return sealed, nil
}

// AppleClaims is the part of the identity token we use.
type AppleClaims struct {
	Subject        string
	Email          string
	EmailVerified  bool
	IsPrivateEmail bool
}

type appleTokenClaims struct {
	jwt.RegisteredClaims
	Nonce          string       `json:"nonce"`
	Email          string       `json:"email"`
	EmailVerified  flexibleBool `json:"email_verified"`
	IsPrivateEmail flexibleBool `json:"is_private_email"`
}

// flexibleBool reads Apple's booleans, which arrive as true or as "true".
type flexibleBool bool

func (b *flexibleBool) UnmarshalJSON(raw []byte) error {
	switch strings.Trim(string(raw), `"`) {
	case "true":
		*b = true
	default:
		*b = false
	}
	return nil
}

// Verify checks an identity token against rawNonce. Every refusal wraps
// ErrIdentityRejected.
func (a *Apple) Verify(ctx context.Context, token, rawNonce string) (*AppleClaims, error) {
	if token == "" || rawNonce == "" {
		return nil, fmt.Errorf("identity token and nonce are required: %w", ErrIdentityRejected)
	}

	var claims appleTokenClaims
	var keyErr error
	parsed, err := jwt.ParseWithClaims(token, &claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		key, err := a.publicKey(ctx, kid)
		keyErr = err
		return key, err
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}),
		jwt.WithIssuer(appleIssuer),
		jwt.WithAudience(a.cfg.BundleID),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(a.now),
	)
	if errors.Is(keyErr, ErrAppleUnavailable) {
		// Apple's keys could not be fetched: the token is not known to be
		// bad, it could not be checked.
		return nil, fmt.Errorf("identity token: %w", keyErr)
	}
	if err != nil || !parsed.Valid {
		return nil, fmt.Errorf("identity token: %v: %w", err, ErrIdentityRejected)
	}

	sum := sha256.Sum256([]byte(rawNonce))
	if subtle.ConstantTimeCompare([]byte(hex.EncodeToString(sum[:])), []byte(claims.Nonce)) != 1 {
		return nil, fmt.Errorf("identity token nonce mismatch: %w", ErrIdentityRejected)
	}
	if claims.Subject == "" {
		return nil, fmt.Errorf("identity token without sub: %w", ErrIdentityRejected)
	}

	return &AppleClaims{
		Subject:        claims.Subject,
		Email:          claims.Email,
		EmailVerified:  bool(claims.EmailVerified),
		IsPrivateEmail: bool(claims.IsPrivateEmail),
	}, nil
}

// publicKey returns Apple's key by kid: from the cache while it is under an
// hour old, otherwise — or for a kid the cache does not know — from Apple,
// but not more often than once a minute.
func (a *Apple) publicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	now := a.now()
	key, known := a.keys[kid]
	fresh := now.Sub(a.fetchedAt) < appleKeysTTL
	if known && fresh {
		return key, nil
	}
	if a.lastAttempt.IsZero() || now.Sub(a.lastAttempt) >= appleRefetchInterval {
		a.lastAttempt = now
		keys, err := a.fetchKeys(ctx)
		if err == nil {
			a.keys = keys
			a.fetchedAt = now
		} else if !known {
			return nil, err
		}
		key, known = a.keys[kid]
	}
	if !known {
		return nil, fmt.Errorf("unknown signing key %q", kid)
	}
	return key, nil
}

func (a *Apple) fetchKeys(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.keysURL, nil)
	if err != nil {
		return nil, err
	}
	res, err := a.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch apple keys: %v: %w", err, ErrAppleUnavailable)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch apple keys: status %d: %w", res.StatusCode, ErrAppleUnavailable)
	}

	var set struct {
		Keys []struct {
			Kty string `json:"kty"`
			Kid string `json:"kid"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&set); err != nil {
		return nil, fmt.Errorf("decode apple keys: %v: %w", err, ErrAppleUnavailable)
	}

	keys := make(map[string]*rsa.PublicKey, len(set.Keys))
	for _, k := range set.Keys {
		if k.Kty != "RSA" {
			continue
		}
		n, errN := base64.RawURLEncoding.DecodeString(k.N)
		e, errE := base64.RawURLEncoding.DecodeString(k.E)
		if errN != nil || errE != nil || len(e) == 0 {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
	}
	return keys, nil
}

// clientSecret is the ES256 JWT Apple takes as client_secret.
func (a *Apple) clientSecret() (string, error) {
	now := a.now()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.RegisteredClaims{
		Issuer:    a.cfg.TeamID,
		Subject:   a.cfg.BundleID,
		Audience:  jwt.ClaimStrings{appleIssuer},
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(appleClientSecretTTL)),
	})
	token.Header["kid"] = a.cfg.KeyID
	return token.SignedString(a.key)
}

func (a *Apple) post(ctx context.Context, endpoint string, form url.Values) (int, []byte, error) {
	secret, err := a.clientSecret()
	if err != nil {
		return 0, nil, fmt.Errorf("sign apple client secret: %w", err)
	}
	form.Set("client_id", a.cfg.BundleID)
	form.Set("client_secret", secret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := a.httpClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer func() { _ = res.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	return res.StatusCode, body, err
}

// exchangeCode trades the authorization code for Apple's refresh token.
func (a *Apple) exchangeCode(ctx context.Context, code string) (string, error) {
	if code == "" {
		return "", fmt.Errorf("authorization code is required: %w", ErrIdentityRejected)
	}
	status, body, err := a.post(ctx, a.tokenURL, url.Values{
		"grant_type": {"authorization_code"},
		"code":       {code},
	})
	if err != nil {
		return "", fmt.Errorf("apple token exchange: %v: %w", err, ErrAppleUnavailable)
	}

	var out struct {
		RefreshToken string `json:"refresh_token"`
		Error        string `json:"error"`
	}
	_ = json.Unmarshal(body, &out)
	switch {
	case status == http.StatusOK && out.RefreshToken != "":
		return out.RefreshToken, nil
	case status == http.StatusBadRequest && out.Error == "invalid_grant":
		// Spent, expired, or issued to another app: the person tries again.
		return "", fmt.Errorf("apple refused the authorization code: %w", ErrIdentityRejected)
	case status >= http.StatusInternalServerError:
		return "", fmt.Errorf("apple token exchange: status %d: %w", status, ErrAppleUnavailable)
	default:
		// invalid_client and the like: our configuration, not Apple's outage.
		return "", fmt.Errorf("apple token exchange: status %d, error %q", status, out.Error)
	}
}

// Revoke tells Apple to forget the access a sealed refresh token stands for.
// A token Apple no longer knows (invalid_grant) counts as revoked.
func (a *Apple) Revoke(ctx context.Context, sealed string) error {
	refresh, err := a.cfg.Sealer.Open(sealed)
	if err != nil {
		return fmt.Errorf("open apple refresh token: %w", err)
	}
	status, body, err := a.post(ctx, a.revokeURL, url.Values{
		"token":           {refresh},
		"token_type_hint": {"refresh_token"},
	})
	if err != nil {
		return fmt.Errorf("apple revoke: %w", err)
	}
	if status == http.StatusOK {
		return nil
	}
	var out struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(body, &out)
	if out.Error == "invalid_grant" {
		return nil
	}
	return fmt.Errorf("apple revoke: status %d, error %q", status, out.Error)
}
