package notifications

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/golang-jwt/jwt/v5"
)

// APNSConfig is what Apple's push service demands: a .p8 key with the APNs
// permission, its id, the team that owns it, and the app the push is for.
type APNSConfig struct {
	KeyID      string
	TeamID     string
	PrivateKey string
	Topic      string
}

// Environments an iPhone can register from. A build from TestFlight or the App
// Store talks to production; a build installed from Xcode talks to sandbox, and
// a token from one is refused by the other.
const (
	APNSProduction = "production"
	APNSSandbox    = "sandbox"
)

var apnsHosts = map[string]string{
	APNSProduction: "https://api.push.apple.com",
	APNSSandbox:    "https://api.sandbox.push.apple.com",
}

// apnsTokenLifetime is how long a provider token is reused. Apple accepts one
// for an hour and refuses one refreshed more often than every twenty minutes.
const apnsTokenLifetime = 50 * time.Minute

// apnsDeviceToken is the hex Apple hands the app. 64 characters today; the
// documentation reserves the right to make it longer.
var apnsDeviceToken = regexp.MustCompile(`^[0-9a-fA-F]{64,200}$`)

// apnsSender signs and sends. Safe for concurrent use.
type apnsSender struct {
	cfg    APNSConfig
	key    *ecdsa.PrivateKey
	client *http.Client
	hosts  map[string]string

	mu     sync.Mutex
	token  string
	issued time.Time
	now    func() time.Time
}

func newAPNSSender(cfg APNSConfig) (*apnsSender, error) {
	// A key pasted into an environment variable often arrives with literal \n
	// in place of line breaks.
	raw := strings.ReplaceAll(cfg.PrivateKey, `\n`, "\n")
	block, _ := pem.Decode([]byte(raw))
	if block == nil {
		return nil, errors.New("APNS_PRIVATE_KEY is not a PEM key (expected the contents of AuthKey_XXXX.p8)")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse APNs key: %w", err)
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("APNs key is not an EC key")
	}
	return &apnsSender{
		cfg: cfg,
		key: key,
		client: &http.Client{
			Timeout: 20 * time.Second,
			// APNs speaks only HTTP/2; a custom transport does not attempt it
			// unless told to.
			Transport: &http.Transport{ForceAttemptHTTP2: true, TLSHandshakeTimeout: 10 * time.Second},
		},
		hosts: apnsHosts,
		now:   time.Now,
	}, nil
}

func (a *apnsSender) bearer() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := a.now()
	if a.token != "" && now.Sub(a.issued) < apnsTokenLifetime {
		return a.token, nil
	}
	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"iss": a.cfg.TeamID,
		"iat": now.Unix(),
	})
	token.Header["kid"] = a.cfg.KeyID
	signed, err := token.SignedString(a.key)
	if err != nil {
		return "", fmt.Errorf("sign APNs token: %w", err)
	}
	a.token, a.issued = signed, now
	return signed, nil
}

// apnsResult is Apple's answer: the status and, when it refused, why.
type apnsResult struct {
	status int
	reason string
}

// gone reports an answer meaning the token will never work again: the app was
// removed, or the token belongs to another environment or app.
func (r apnsResult) gone() bool {
	switch r.status {
	case http.StatusGone:
		return true
	case http.StatusBadRequest:
		return r.reason == "BadDeviceToken" || r.reason == "DeviceTokenNotForTopic"
	}
	return false
}

// apnsMessage is one request to Apple: the payload and the headers that go
// with its kind.
type apnsMessage struct {
	payload []byte
	// background is a silent badge update: content-available, no alert. Apple
	// demands push type "background" and priority 5 for it, and refuses 10.
	background bool
	// collapseID makes a phone that receives the same notification twice show
	// one banner. Empty for chat messages: every message is its own text.
	collapseID string
}

func (a *apnsSender) send(ctx context.Context, device pushDevice, message apnsMessage) (apnsResult, error) {
	host, ok := a.hosts[device.environment]
	if !ok {
		return apnsResult{}, fmt.Errorf("unknown APNs environment %q", device.environment)
	}
	bearer, err := a.bearer()
	if err != nil {
		return apnsResult{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, host+"/3/device/"+device.token, bytes.NewReader(message.payload))
	if err != nil {
		return apnsResult{}, err
	}
	request.Header.Set("authorization", "bearer "+bearer)
	request.Header.Set("apns-topic", a.cfg.Topic)
	if message.background {
		request.Header.Set("apns-push-type", "background")
		request.Header.Set("apns-priority", "5")
	} else {
		request.Header.Set("apns-push-type", "alert")
		request.Header.Set("apns-priority", "10")
	}
	// Same as web push: a phone offline for longer than a day is not greeted
	// by yesterday's news.
	request.Header.Set("apns-expiration", fmt.Sprint(a.now().Add(pushTTL).Unix()))
	if message.collapseID != "" {
		request.Header.Set("apns-collapse-id", message.collapseID)
	}
	request.Header.Set("content-type", "application/json")

	response, err := a.client.Do(request)
	if err != nil {
		return apnsResult{}, fmt.Errorf("send APNs push: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	result := apnsResult{status: response.StatusCode}
	if response.StatusCode != http.StatusOK {
		var body struct {
			Reason string `json:"reason"`
		}
		data, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		_ = json.Unmarshal(data, &body)
		result.reason = body.Reason
	}
	return result, nil
}

// APNSDevice is what the app sends to register an iPhone.
type APNSDevice struct {
	Token       string `json:"token"`
	Environment string `json:"environment"`
	AppVersion  string `json:"app_version,omitempty"`
	// InstallationID is generated once by the app and kept in the phone's
	// Keychain. It is what proves a re-registration comes from the same phone.
	InstallationID string `json:"installation_id"`
}

// pushDevice is a registered iPhone as the sender sees it.
type pushDevice struct {
	id          int64
	token       string
	environment string
}

var apnsInstallationID = regexp.MustCompile(`^[0-9a-fA-F-]{36}$`)

// WithAPNS supplies the key. A key that does not parse is a configuration
// error worth failing loudly over, not a channel that silently never sends.
func (s *Service) WithAPNS(cfg APNSConfig) error {
	sender, err := newAPNSSender(cfg)
	if err != nil {
		return err
	}
	s.apns = sender
	return nil
}

// APNSReady reports whether a push can be sent to an iPhone at all.
func (s *Service) APNSReady() bool {
	return s.apns != nil
}

// PushChannelReady: the push channel exists if either kind of device can be
// reached. The sending job runs on this, not on Web Push alone — otherwise a
// deployment with only the APNs key would queue pushes nobody sends.
func (s *Service) PushChannelReady() bool {
	return s.PushReady() || s.APNSReady()
}

func (s *Service) anyPushReady() bool { return s.PushChannelReady() }

// RegisterDevice records where an iPhone can be reached.
//
// Keyed on the token: a phone that signs into another account moves its token
// with it, rather than delivering the previous person's notifications. But
// only the phone itself may move it — the update applies when the installation
// id matches. Otherwise anybody who learned a token could register it to their
// own account: their notifications would land on somebody else's phone, and
// the owner would stop receiving theirs.
//
// Registering again re-enables a device APNs once called dead: the app only
// registers a token iOS has just handed it.
func (s *Service) RegisterDevice(ctx context.Context, userID int64, device APNSDevice) error {
	if !s.APNSReady() {
		return fmt.Errorf("ios push: %w", apperrors.ErrFeatureUnavailable)
	}
	if !apnsDeviceToken.MatchString(device.Token) {
		return fmt.Errorf("device token is not an APNs token: %w", apperrors.ErrValidation)
	}
	if _, ok := apnsHosts[device.Environment]; !ok {
		return fmt.Errorf("environment must be production or sandbox: %w", apperrors.ErrValidation)
	}
	if !apnsInstallationID.MatchString(device.InstallationID) {
		return fmt.Errorf("installation id is required: %w", apperrors.ErrValidation)
	}
	result, err := s.db.ExecContext(ctx,
		`INSERT INTO push_devices (user_id, token, installation_id, environment, app_version, platform)
		 VALUES ($1, $2, $3, $4, $5, 'ios')
		 ON CONFLICT (token) DO UPDATE
		 SET user_id = EXCLUDED.user_id,
		     environment = EXCLUDED.environment,
		     app_version = EXCLUDED.app_version,
		     failures = 0,
		     last_seen_at = NOW(),
		     disabled_at = NULL
		 WHERE push_devices.installation_id = EXCLUDED.installation_id`,
		userID, strings.ToLower(device.Token), strings.ToLower(device.InstallationID),
		device.Environment, nullIfEmpty(device.AppVersion))
	if err != nil {
		return fmt.Errorf("store APNs device: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("store APNs device: %w", err)
	}
	if affected == 0 {
		return fmt.Errorf("device token belongs to another installation: %w", apperrors.ErrForbidden)
	}
	return nil
}

// UnregisterDevice forgets one iPhone — on sign-out, so the next person to use
// the phone does not receive this one's notifications. Somebody else's token,
// or one already gone, changes nothing and is not an error: the answer must
// not tell a caller whether a token exists.
func (s *Service) UnregisterDevice(ctx context.Context, userID int64, token string) error {
	if token == "" {
		return fmt.Errorf("no device token given: %w", apperrors.ErrValidation)
	}
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM push_devices WHERE user_id = $1 AND token = $2`,
		userID, strings.ToLower(token)); err != nil {
		return fmt.Errorf("delete APNs device: %w", err)
	}
	return nil
}

// devicesFor lists the iPhones a push can go to: registered and not disabled.
func (s *Service) devicesFor(ctx context.Context, q queryer, userID int64) ([]pushDevice, error) {
	rows, err := q.QueryContext(ctx,
		`SELECT id, token, environment FROM push_devices
		 WHERE user_id = $1 AND disabled_at IS NULL ORDER BY id`, userID)
	if err != nil {
		return nil, fmt.Errorf("load APNs devices: %w", err)
	}
	defer rows.Close()
	devices := []pushDevice{}
	for rows.Next() {
		var d pushDevice
		if err := rows.Scan(&d.id, &d.token, &d.environment); err != nil {
			return nil, fmt.Errorf("scan APNs device: %w", err)
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

// disableDevice records that APNs called the token dead. The row stays: it
// says what happened and when, and a new registration switches it back on.
func (s *Service) disableDevice(ctx context.Context, deviceID int64) {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE push_devices SET disabled_at = NOW() WHERE id = $1`, deviceID); err != nil {
		s.log.WithError(err).Error("Failed to disable a retired APNs device")
	}
}

func (s *Service) recordDeviceFailure(ctx context.Context, deviceID int64) {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE push_devices SET failures = failures + 1 WHERE id = $1`, deviceID); err != nil {
		s.log.WithError(err).Error("Failed to record an APNs failure")
	}
}
