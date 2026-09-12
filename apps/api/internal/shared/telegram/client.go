// Package telegram is a small client for the Bot API.
//
// Written over the standard library rather than pulled in as a dependency: the
// bot sends messages and verifies updates, which is two endpoints and a header
// check.
package telegram

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client talks to the Telegram Bot API.
type Client struct {
	token      string
	baseURL    string
	httpClient *http.Client
}

// NewClient creates the client. Returns nil without a token, so an
// unconfigured deployment has no bot rather than a broken one.
func NewClient(token string) *Client {
	if token == "" {
		return nil
	}
	return &Client{
		token:      token,
		baseURL:    "https://api.telegram.org",
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// Update is the part of a Telegram update this bot acts on.
type Update struct {
	UpdateID int64 `json:"update_id"`
	Message  *struct {
		MessageID int64 `json:"message_id"`
		From      *struct {
			ID        int64  `json:"id"`
			Username  string `json:"username"`
			FirstName string `json:"first_name"`
		} `json:"from"`
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
}

// SendMessage delivers a reply to a chat.
func (c *Client) SendMessage(ctx context.Context, chatID int64, text string) error {
	body, err := json.Marshal(map[string]any{
		"chat_id": chatID,
		"text":    text,
		// Plain text: the corpus is Markdown, and half-escaped Markdown reaches
		// the reader as visible asterisks or as a delivery failure.
		"disable_web_page_preview": true,
	})
	if err != nil {
		return fmt.Errorf("marshal message: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/bot%s/sendMessage", c.baseURL, c.token), bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build send request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send message: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("telegram returned %d: %s", resp.StatusCode, payload)
	}
	return nil
}

// SecretHeader is the header Telegram sets on every update when a webhook is
// registered with a secret token.
const SecretHeader = "X-Telegram-Bot-Api-Secret-Token"

// ValidSecret reports whether an update carries the expected secret.
//
// The webhook path is public — it has to be — so this header is the only thing
// separating a genuine update from anybody's POST. Compared in constant time:
// a comparison that returns early leaks the secret one byte at a time.
func ValidSecret(expected, received string) bool {
	if expected == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(expected), []byte(received)) == 1
}

// VerifyWebhook asks Telegram whether it can still reach us.
//
// The most silent failure this bot has. Telegram keeps the last delivery error
// to itself: if our certificate expires, the route changes or the host refuses
// the connection, updates simply stop arriving. Nothing is logged here, because
// nothing reaches here. The bot looks alive — the token works, the process runs
// — and nobody gets an answer.
//
// getWebhookInfo is free and reports the last error Telegram saw. That is the
// only place this failure is visible from.
func (c *Client) VerifyWebhook(ctx context.Context, expectedURL string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/bot%s/getWebhookInfo", c.baseURL, c.token), nil)
	if err != nil {
		return fmt.Errorf("build webhook request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("ask telegram about the webhook: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("telegram rejected the bot token")
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram answered %d about the webhook", resp.StatusCode)
	}

	var body struct {
		OK     bool `json:"ok"`
		Result struct {
			URL              string `json:"url"`
			LastErrorMessage string `json:"last_error_message"`
			LastErrorDate    int64  `json:"last_error_date"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return fmt.Errorf("decode webhook info: %w", err)
	}
	if !body.OK {
		return fmt.Errorf("telegram refused to describe the webhook")
	}

	if body.Result.URL == "" {
		return fmt.Errorf("no webhook is set: nothing reaches the bot")
	}
	if expectedURL != "" && body.Result.URL != expectedURL {
		// Обычно это значит, что вебхук перебила другая среда: токен один, а
		// адрес у Telegram только один на бота.
		return fmt.Errorf("webhook points at %s, not at us", body.Result.URL)
	}
	if body.Result.LastErrorMessage != "" {
		return fmt.Errorf("telegram could not deliver: %s", body.Result.LastErrorMessage)
	}

	return nil
}
