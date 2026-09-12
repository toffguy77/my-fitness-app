package email

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strconv"
	"time"
)

// VerifyCredentials connects and authenticates, and sends nothing.
//
// The capability flag for email means "the settings are filled in", never "they
// work". That distinction cost a real person their account: the provider had
// stopped accepting the application password (535 Invalid user or password),
// every reset and every verification code silently failed, and /ready went on
// reporting email as available. The request itself answers "if an account with
// this address exists, you will receive instructions" whatever happens — as it
// must, or the answer becomes a way to enumerate other people's addresses.
//
// So the only way to know is to ask the provider, on a schedule, without
// bothering anybody: dial, authenticate, hang up.
func (s *Service) VerifyCredentials(ctx context.Context) error {
	if s == nil {
		return fmt.Errorf("email service is not configured")
	}

	addr := net.JoinHostPort(s.smtpHost, strconv.Itoa(s.smtpPort))
	auth := smtp.PlainAuth("", s.smtpUsername, s.smtpPassword, s.smtpHost)

	dialCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	var conn net.Conn
	var err error
	if s.smtpPort == 465 {
		dialer := &tls.Dialer{Config: &tls.Config{
			ServerName: s.smtpHost,
			MinVersion: tls.VersionTLS12,
		}}
		conn, err = dialer.DialContext(dialCtx, "tcp", addr)
	} else {
		conn, err = (&net.Dialer{}).DialContext(dialCtx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("connect to %s: %w", addr, err)
	}
	defer func() { _ = conn.Close() }()

	client, err := smtp.NewClient(conn, s.smtpHost)
	if err != nil {
		return fmt.Errorf("smtp handshake: %w", err)
	}
	defer func() { _ = client.Close() }()

	// STARTTLS on the submission port: authenticating in the clear would send
	// the password across the network to prove it still works.
	if s.smtpPort != 465 {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{
				ServerName: s.smtpHost,
				MinVersion: tls.VersionTLS12,
			}); err != nil {
				return fmt.Errorf("starttls: %w", err)
			}
		}
	}

	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("authentication failed: %w", err)
	}

	return client.Quit()
}
