// Package applestub stands in for appleid.apple.com in tests: it serves a
// signing key set, accepts authorization codes, records revocations and
// signs identity tokens with a test key. Nothing here talks to Apple.
package applestub

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/golang-jwt/jwt/v5"
)

const (
	TeamID   = "TEAM123456"
	BundleID = "team.burcev.app.test"
	KeyID    = "SIWAKEY123"
	// EncryptionKey is a fixed APPLE_TOKEN_ENCRYPTION_KEY for tests.
	EncryptionKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
)

// Server is the stub.
type Server struct {
	*httptest.Server
	t *testing.T

	mu sync.Mutex
	// SigningKeys are the keys served at /auth/keys, by kid.
	SigningKeys map[string]*rsa.PrivateKey
	// KeyFetches counts GET /auth/keys.
	KeyFetches int
	// Codes maps an accepted authorization code to the refresh token it
	// yields; any other code is invalid_grant.
	Codes map[string]string
	// Revoked lists refresh tokens revoked through /auth/revoke.
	Revoked []string
	// FailRevoke makes /auth/revoke answer 503.
	FailRevoke bool
	// ClientSecretErrors collects problems with the client_secret received.
	ClientSecretErrors []string

	clientKey *ecdsa.PrivateKey
	// PrivateKeyPEM is the APPLE_PRIVATE_KEY the adapter signs with.
	PrivateKeyPEM string
}

// New starts the stub with one signing key, "kid-1".
func New(t *testing.T) *Server {
	t.Helper()
	clientKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(clientKey)
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{
		t:             t,
		SigningKeys:   map[string]*rsa.PrivateKey{},
		Codes:         map[string]string{},
		clientKey:     clientKey,
		PrivateKeyPEM: string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})),
	}
	s.AddSigningKey("kid-1")

	mux := http.NewServeMux()
	mux.HandleFunc("GET /auth/keys", s.keys)
	mux.HandleFunc("POST /auth/token", s.token)
	mux.HandleFunc("POST /auth/revoke", s.revoke)
	s.Server = httptest.NewServer(mux)
	t.Cleanup(s.Close)
	return s
}

// AddSigningKey creates a key Apple would sign with under kid.
func (s *Server) AddSigningKey(kid string) *rsa.PrivateKey {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		s.t.Fatal(err)
	}
	s.mu.Lock()
	s.SigningKeys[kid] = key
	s.mu.Unlock()
	return key
}

// Config is an AppleConfig pointing at the stub.
func (s *Server) Config(now func() time.Time) oauth.AppleConfig {
	sealer, err := oauth.NewSealer(EncryptionKey)
	if err != nil {
		s.t.Fatal(err)
	}
	return oauth.AppleConfig{
		TeamID: TeamID, BundleID: BundleID, KeyID: KeyID, PrivateKey: s.PrivateKeyPEM,
		Sealer: sealer, BaseURL: s.URL, Now: now,
	}
}

// Adapter is a ready adapter against the stub.
func (s *Server) Adapter(now func() time.Time) *oauth.Apple {
	a, err := oauth.NewApple(s.Config(now))
	if err != nil {
		s.t.Fatal(err)
	}
	return a
}

// HashNonce is what the app puts in the request and Apple in the token.
func HashNonce(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// Token describes an identity token to sign.
type Token struct {
	Kid           string // default kid-1
	Issuer        string // default https://appleid.apple.com
	Audience      string // default BundleID
	Subject       string
	Email         string
	EmailVerified any // true, "true", false; default true
	Private       bool
	RawNonce      string
	ExpiresAt     time.Time // default an hour from now
}

// Sign returns a signed identity token.
func (s *Server) Sign(tok Token) string {
	if tok.Kid == "" {
		tok.Kid = "kid-1"
	}
	if tok.Issuer == "" {
		tok.Issuer = "https://appleid.apple.com"
	}
	if tok.Audience == "" {
		tok.Audience = BundleID
	}
	if tok.ExpiresAt.IsZero() {
		tok.ExpiresAt = time.Now().Add(time.Hour)
	}
	if tok.EmailVerified == nil {
		tok.EmailVerified = true
	}
	claims := jwt.MapClaims{
		"iss":            tok.Issuer,
		"aud":            tok.Audience,
		"sub":            tok.Subject,
		"exp":            tok.ExpiresAt.Unix(),
		"iat":            time.Now().Add(-time.Minute).Unix(),
		"nonce":          HashNonce(tok.RawNonce),
		"email":          tok.Email,
		"email_verified": tok.EmailVerified,
	}
	if tok.Private {
		claims["is_private_email"] = "true"
	}
	s.mu.Lock()
	key := s.SigningKeys[tok.Kid]
	s.mu.Unlock()
	if key == nil {
		// A kid the stub does not serve: sign with a throwaway key.
		var err error
		if key, err = rsa.GenerateKey(rand.Reader, 2048); err != nil {
			s.t.Fatal(err)
		}
	}
	t := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	t.Header["kid"] = tok.Kid
	signed, err := t.SignedString(key)
	if err != nil {
		s.t.Fatal(err)
	}
	return signed
}

// AcceptCode makes code exchangeable for refresh.
func (s *Server) AcceptCode(code, refresh string) {
	s.mu.Lock()
	s.Codes[code] = refresh
	s.mu.Unlock()
}

// RevokedTokens returns a copy of the revoked refresh tokens.
func (s *Server) RevokedTokens() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.Revoked...)
}

// SetFailRevoke switches revocation failures on or off.
func (s *Server) SetFailRevoke(fail bool) {
	s.mu.Lock()
	s.FailRevoke = fail
	s.mu.Unlock()
}

// Fetches returns how many times the key set was requested.
func (s *Server) Fetches() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.KeyFetches
}

func (s *Server) keys(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.KeyFetches++
	var keys []map[string]string
	for kid, key := range s.SigningKeys {
		keys = append(keys, map[string]string{
			"kty": "RSA", "kid": kid, "use": "sig", "alg": "RS256",
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		})
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"keys": keys})
}

// checkClientSecret verifies what Apple verifies about our client secret.
func (s *Server) checkClientSecret(r *http.Request) {
	if r.PostFormValue("client_id") != BundleID {
		s.ClientSecretErrors = append(s.ClientSecretErrors, "client_id "+r.PostFormValue("client_id"))
	}
	var claims jwt.RegisteredClaims
	tok, err := jwt.ParseWithClaims(r.PostFormValue("client_secret"), &claims, func(t *jwt.Token) (any, error) {
		return &s.clientKey.PublicKey, nil
	}, jwt.WithValidMethods([]string{"ES256"}), jwt.WithIssuer(TeamID), jwt.WithAudience("https://appleid.apple.com"),
		jwt.WithSubject(BundleID), jwt.WithExpirationRequired())
	if err != nil || !tok.Valid {
		s.ClientSecretErrors = append(s.ClientSecretErrors, "client_secret: "+errString(err))
		return
	}
	if tok.Header["kid"] != KeyID {
		s.ClientSecretErrors = append(s.ClientSecretErrors, "client_secret kid")
	}
}

func errString(err error) string {
	if err == nil {
		return "invalid"
	}
	return err.Error()
}

func (s *Server) token(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.checkClientSecret(r)
	refresh, ok := s.Codes[r.PostFormValue("code")]
	if !ok || r.PostFormValue("grant_type") != "authorization_code" {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
		return
	}
	delete(s.Codes, r.PostFormValue("code")) // single use
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token": "a", "token_type": "Bearer", "expires_in": 3600, "refresh_token": refresh, "id_token": "x",
	})
}

func (s *Server) revoke(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.checkClientSecret(r)
	if s.FailRevoke {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	if r.PostFormValue("token_type_hint") != "refresh_token" {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"unsupported_token_type"}`))
		return
	}
	s.Revoked = append(s.Revoked, r.PostFormValue("token"))
	w.WriteHeader(http.StatusOK)
}
