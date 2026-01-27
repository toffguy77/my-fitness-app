package email

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"html/template"
	"net/smtp"
	"time"

	"github.com/burcev/api/internal/shared/logger"
)

// Service handles email sending operations
type Service struct {
	smtpHost     string
	smtpPort     int
	smtpUsername string
	smtpPassword string
	fromAddress  string
	fromName     string
	log          *logger.Logger
	templates    *template.Template
}

// Config holds email service configuration
type Config struct {
	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	FromAddress  string
	FromName     string
}

// ResetEmailData contains data for password reset email template
type ResetEmailData struct {
	UserEmail      string
	ResetURL       string
	ExpirationTime time.Time
	SupportEmail   string
}

// PasswordChangedEmailData contains data for password changed confirmation email
type PasswordChangedEmailData struct {
	UserEmail    string
	ChangedAt    time.Time
	IPAddress    string
	SupportEmail string
}

// NewService creates a new email service instance
func NewService(cfg Config, log *logger.Logger) (*Service, error) {
	if cfg.SMTPHost == "" {
		return nil, fmt.Errorf("SMTP host is required")
	}
	if cfg.SMTPUsername == "" {
		return nil, fmt.Errorf("SMTP username is required")
	}
	if cfg.SMTPPassword == "" {
		return nil, fmt.Errorf("SMTP password is required")
	}
	if cfg.FromAddress == "" {
		return nil, fmt.Errorf("from address is required")
	}

	// Parse email templates
	templates, err := parseTemplates()
	if err != nil {
		return nil, fmt.Errorf("failed to parse templates: %w", err)
	}

	return &Service{
		smtpHost:     cfg.SMTPHost,
		smtpPort:     cfg.SMTPPort,
		smtpUsername: cfg.SMTPUsername,
		smtpPassword: cfg.SMTPPassword,
		fromAddress:  cfg.FromAddress,
		fromName:     cfg.FromName,
		log:          log,
		templates:    templates,
	}, nil
}

// SendPasswordResetEmail sends a password reset email with retry logic
func (s *Service) SendPasswordResetEmail(ctx context.Context, data ResetEmailData) error {
	subject := "Запрос на сброс пароля - BURCEV"

	// Render email template
	body, err := s.renderTemplate("password_reset", data)
	if err != nil {
		s.log.WithError(err).Error("Failed to render password reset email template")
		return fmt.Errorf("failed to render template: %w", err)
	}

	// Send email with retry logic
	maxRetries := 3
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		err := s.sendEmail(ctx, data.UserEmail, subject, body)
		if err == nil {
			s.log.Info("Password reset email sent successfully",
				"email", data.UserEmail,
				"attempt", attempt,
			)
			return nil
		}

		lastErr = err
		s.log.WithError(err).Warn("Failed to send password reset email",
			"email", data.UserEmail,
			"attempt", attempt,
			"max_retries", maxRetries,
		)

		// Wait before retry (exponential backoff)
		if attempt < maxRetries {
			backoff := time.Duration(attempt) * time.Second
			time.Sleep(backoff)
		}
	}

	s.log.WithError(lastErr).Error("Failed to send password reset email after retries",
		"email", data.UserEmail,
		"attempts", maxRetries,
	)

	return fmt.Errorf("failed to send email after %d attempts: %w", maxRetries, lastErr)
}

// SendPasswordChangedEmail sends a confirmation email after password change
func (s *Service) SendPasswordChangedEmail(ctx context.Context, data PasswordChangedEmailData) error {
	subject := "Пароль изменен - BURCEV"

	// Render email template
	body, err := s.renderTemplate("password_changed", data)
	if err != nil {
		s.log.WithError(err).Error("Failed to render password changed email template")
		return fmt.Errorf("failed to render template: %w", err)
	}

	// Send email (no retry for confirmation emails)
	err = s.sendEmail(ctx, data.UserEmail, subject, body)
	if err != nil {
		s.log.WithError(err).Error("Failed to send password changed email",
			"email", data.UserEmail,
		)
		return fmt.Errorf("failed to send email: %w", err)
	}

	s.log.Info("Password changed email sent successfully",
		"email", data.UserEmail,
	)

	return nil
}

// sendEmail sends an email via SMTP
func (s *Service) sendEmail(ctx context.Context, to, subject, body string) error {
	// Build email message
	from := fmt.Sprintf("%s <%s>", s.fromName, s.fromAddress)

	headers := make(map[string]string)
	headers["From"] = from
	headers["To"] = to
	headers["Subject"] = subject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/html; charset=UTF-8"
	headers["Date"] = time.Now().Format(time.RFC1123Z)

	message := ""
	for k, v := range headers {
		message += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	message += "\r\n" + body

	// Connect to SMTP server
	addr := fmt.Sprintf("%s:%d", s.smtpHost, s.smtpPort)

	// Setup authentication
	auth := smtp.PlainAuth("", s.smtpUsername, s.smtpPassword, s.smtpHost)

	// For port 465 (SSL/TLS), use TLS connection
	if s.smtpPort == 465 {
		return s.sendEmailTLS(addr, auth, to, []byte(message))
	}

	// For port 587 (STARTTLS), use standard SMTP with STARTTLS
	return smtp.SendMail(addr, auth, s.fromAddress, []string{to}, []byte(message))
}

// sendEmailTLS sends email using TLS connection (for port 465)
func (s *Service) sendEmailTLS(addr string, auth smtp.Auth, to string, message []byte) error {
	// Setup TLS config
	tlsConfig := &tls.Config{
		ServerName: s.smtpHost,
		MinVersion: tls.VersionTLS12,
	}

	// Connect with TLS
	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	defer conn.Close()

	// Create SMTP client
	client, err := smtp.NewClient(conn, s.smtpHost)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer client.Close()

	// Authenticate
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("authentication failed: %w", err)
	}

	// Set sender
	if err := client.Mail(s.fromAddress); err != nil {
		return fmt.Errorf("failed to set sender: %w", err)
	}

	// Set recipient
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("failed to set recipient: %w", err)
	}

	// Send message
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("failed to get data writer: %w", err)
	}

	_, err = w.Write(message)
	if err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}

	err = w.Close()
	if err != nil {
		return fmt.Errorf("failed to close writer: %w", err)
	}

	return client.Quit()
}

// renderTemplate renders an email template with data
func (s *Service) renderTemplate(templateName string, data interface{}) (string, error) {
	var buf bytes.Buffer
	err := s.templates.ExecuteTemplate(&buf, templateName, data)
	if err != nil {
		return "", err
	}
	return buf.String(), nil
}

// parseTemplates parses email templates
func parseTemplates() (*template.Template, error) {
	tmpl := template.New("email")

	// Password reset email template
	_, err := tmpl.New("password_reset").Parse(passwordResetTemplate)
	if err != nil {
		return nil, err
	}

	// Password changed email template
	_, err = tmpl.New("password_changed").Parse(passwordChangedTemplate)
	if err != nil {
		return nil, err
	}

	return tmpl, nil
}

// Email templates
const passwordResetTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Запрос на сброс пароля</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
        <h2 style="color: #2c3e50; margin-top: 0;">Запрос на сброс пароля</h2>

        <p>Здравствуйте,</p>

        <p>Мы получили запрос на сброс пароля для вашего аккаунта BURCEV, связанного с <strong>{{.UserEmail}}</strong>.</p>

        <p>Чтобы сбросить пароль, нажмите на кнопку ниже:</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="{{.ResetURL}}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Сбросить пароль</a>
        </div>

        <p>Или скопируйте и вставьте эту ссылку в браузер:</p>
        <p style="word-break: break-all; color: #007bff;">{{.ResetURL}}</p>

        <p><strong>Срок действия ссылки истекает {{.ExpirationTime.Format "02.01.2006 в 15:04 MST"}}.</strong></p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
            <strong>Уведомление о безопасности:</strong> Если вы не запрашивали сброс пароля, проигнорируйте это письмо. Ваш пароль останется без изменений. По вопросам безопасности свяжитесь с нами по адресу {{.SupportEmail}}.
        </p>

        <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Это автоматическое сообщение от BURCEV. Пожалуйста, не отвечайте на это письмо.
        </p>
    </div>
</body>
</html>
`

const passwordChangedTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Пароль изменен</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
        <h2 style="color: #28a745; margin-top: 0;">✓ Пароль успешно изменен</h2>

        <p>Здравствуйте,</p>

        <p>Это письмо подтверждает, что пароль для вашего аккаунта BURCEV <strong>{{.UserEmail}}</strong> был успешно изменен.</p>

        <div style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Изменено:</strong> {{.ChangedAt.Format "02.01.2006 в 15:04 MST"}}</p>
            <p style="margin: 5px 0;"><strong>IP адрес:</strong> {{.IPAddress}}</p>
        </div>

        <p>Теперь вы можете использовать новый пароль для входа в аккаунт.</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #dc3545; font-size: 14px;">
            <strong>⚠ Это были не вы?</strong><br>
            Если вы не меняли пароль, ваш аккаунт может быть скомпрометирован. Пожалуйста, немедленно свяжитесь с нами по адресу {{.SupportEmail}} и измените пароль как можно скорее.
        </p>

        <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Это автоматическое сообщение от BURCEV. Пожалуйста, не отвечайте на это письмо.
        </p>
    </div>
</body>
</html>
`
