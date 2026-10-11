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

// apnsPayload is what the phone receives. `aps` is Apple's; the rest is ours,
// read by the app to open the right screen.
type apnsPayload struct {
	APS struct {
		Alert struct {
			Title string `json:"title"`
			Body  string `json:"body"`
		} `json:"alert"`
		Sound string `json:"sound"`
	} `json:"aps"`
	URL            string `json:"url,omitempty"`
	NotificationID string `json:"notification_id"`
}

func newAPNSPayload(item duePush) ([]byte, error) {
	var p apnsPayload
	p.APS.Alert.Title = item.title
	p.APS.Alert.Body = item.content
	p.APS.Sound = "default"
	p.URL = item.actionURL
	p.NotificationID = item.notificationID
	return json.Marshal(p)
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

func (a *apnsSender) send(ctx context.Context, device APNSDevice, payload []byte, collapseID string) (apnsResult, error) {
	host, ok := a.hosts[device.Environment]
	if !ok {
		return apnsResult{}, fmt.Errorf("unknown APNs environment %q", device.Environment)
	}
	bearer, err := a.bearer()
	if err != nil {
		return apnsResult{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, host+"/3/device/"+device.Token, bytes.NewReader(payload))
	if err != nil {
		return apnsResult{}, err
	}
	request.Header.Set("authorization", "bearer "+bearer)
	request.Header.Set("apns-topic", a.cfg.Topic)
	request.Header.Set("apns-push-type", "alert")
	request.Header.Set("apns-priority", "10")
	// Same as web push: a phone offline for longer than a day is not greeted
	// by yesterday's news.
	request.Header.Set("apns-expiration", fmt.Sprint(a.now().Add(pushTTL).Unix()))
	// Same notification, same id: a phone that receives it twice shows one banner.
	request.Header.Set("apns-collapse-id", collapseID)
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

// APNSDevice is one iPhone that agreed to be interrupted.
type APNSDevice struct {
	Token       string `json:"token"`
	Environment string `json:"environment"`
	AppVersion  string `json:"app_version,omitempty"`
}

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

// anyPushReady: the push channel exists if either kind of device can be reached.
func (s *Service) anyPushReady() bool {
	return s.PushReady() || s.APNSReady()
}

// RegisterDevice records where an iPhone can be reached.
//
// Keyed on the token: a phone that signs into another account moves its token
// with it, rather than delivering the previous person's notifications.
func (s *Service) RegisterDevice(ctx context.Context, userID int64, device APNSDevice) error {
	if !s.APNSReady() {
		return fmt.Errorf("ios push: %w", apperrors.ErrEmailUnavailable)
	}
	if !apnsDeviceToken.MatchString(device.Token) {
		return fmt.Errorf("device token is not an APNs token: %w", apperrors.ErrValidation)
	}
	if _, ok := apnsHosts[device.Environment]; !ok {
		return fmt.Errorf("environment must be production or sandbox: %w", apperrors.ErrValidation)
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO apns_devices (user_id, token, environment, app_version)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (token) DO UPDATE
		 SET user_id = EXCLUDED.user_id,
		     environment = EXCLUDED.environment,
		     app_version = EXCLUDED.app_version,
		     failures = 0`,
		userID, strings.ToLower(device.Token), device.Environment, nullIfEmpty(device.AppVersion))
	if err != nil {
		return fmt.Errorf("store APNs device: %w", err)
	}
	return nil
}

// UnregisterDevice forgets one iPhone — on sign-out, so the next person to use
// the phone does not receive this one's notifications.
func (s *Service) UnregisterDevice(ctx context.Context, userID int64, token string) error {
	if token == "" {
		return fmt.Errorf("no device token given: %w", apperrors.ErrValidation)
	}
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM apns_devices WHERE user_id = $1 AND token = $2`,
		userID, strings.ToLower(token)); err != nil {
		return fmt.Errorf("delete APNs device: %w", err)
	}
	return nil
}

func (s *Service) devicesFor(ctx context.Context, userID int64) ([]APNSDevice, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT token, environment FROM apns_devices WHERE user_id = $1`, userID)
	if err != nil {
		return nil, fmt.Errorf("load APNs devices: %w", err)
	}
	defer rows.Close()
	devices := []APNSDevice{}
	for rows.Next() {
		var d APNSDevice
		if err := rows.Scan(&d.Token, &d.Environment); err != nil {
			return nil, fmt.Errorf("scan APNs device: %w", err)
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

// sendToDevices pushes one notification to every iPhone of its recipient.
// Returns whether any accepted it and the last refusal, for the record.
func (s *Service) sendToDevices(ctx context.Context, devices []APNSDevice, item duePush) (bool, error) {
	payload, err := newAPNSPayload(item)
	if err != nil {
		return false, fmt.Errorf("encode APNs payload: %w", err)
	}
	reached := false
	var lastErr error
	for _, device := range devices {
		result, err := s.apns.send(ctx, device, payload, item.notificationID)
		switch {
		case err != nil:
			s.recordDeviceFailure(ctx, device.Token)
			lastErr = err
		case result.status == http.StatusOK:
			reached = true
			if _, err := s.db.ExecContext(ctx,
				`UPDATE apns_devices SET last_used_at = NOW(), failures = 0 WHERE token = $1`, device.Token); err != nil {
				s.log.WithError(err).Error("Failed to record a successful APNs push")
			}
		case result.gone():
			// The app was removed or the token belongs elsewhere: retrying it
			// can never work.
			if _, err := s.db.ExecContext(ctx, `DELETE FROM apns_devices WHERE token = $1`, device.Token); err != nil {
				s.log.WithError(err).Error("Failed to delete a retired APNs device")
			}
			lastErr = fmt.Errorf("APNs: %d %s", result.status, result.reason)
		default:
			s.recordDeviceFailure(ctx, device.Token)
			lastErr = fmt.Errorf("APNs answered %d %s", result.status, result.reason)
		}
	}
	return reached, lastErr
}

func (s *Service) recordDeviceFailure(ctx context.Context, token string) {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE apns_devices SET failures = failures + 1 WHERE token = $1`, token); err != nil {
		s.log.WithError(err).Error("Failed to record an APNs failure")
	}
}
