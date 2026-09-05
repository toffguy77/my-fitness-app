package email

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"html/template"
	"mime"
	"net/smtp"
	"time"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/telemetry"
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

// OnboardingReminderData contains data for the single reminder sent to somebody
// who worked out their numbers and did not finish registering.
type OnboardingReminderData struct {
	UserEmail      string
	Name           string
	Calories       int
	ResumeURL      string
	UnsubscribeURL string
	SupportEmail   string
}

// DigestItemData is one event, as it appears in the digest.
type DigestItemData struct {
	Title     string
	Content   string
	ActionURL string
	CreatedAt time.Time
}

// At is how the time reads in the message.
func (d DigestItemData) At() string {
	return d.CreatedAt.Format("02.01.2006 15:04")
}

// DigestEmailData contains data for the notification digest: everything that
// went unread, in one message rather than one message per event.
type DigestEmailData struct {
	UserEmail      string
	Name           string
	Items          []DigestItemData
	AppURL         string
	UnsubscribeURL string
	SupportEmail   string
}

// VerificationEmailData contains data for the email verification template
type VerificationEmailData struct {
	UserEmail string
	Code      string
	ExpiresAt time.Time
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
		cfg.FromAddress = cfg.SMTPUsername
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

// SendOnboardingReminder sends the one reminder a lead ever gets.
//
// No retry and no follow-up: a chain of chasing emails turns the product into
// spam and costs the sender reputation that the transactional mail depends on.
func (s *Service) SendOnboardingReminder(ctx context.Context, data OnboardingReminderData) error {
	subject := "Ваш расчёт КБЖУ сохранён — BURCEV"

	body, err := s.renderTemplate("onboarding_reminder", data)
	if err != nil {
		s.log.WithError(err).Error("Failed to render onboarding reminder template")
		return fmt.Errorf("failed to render template: %w", err)
	}

	if err := s.sendEmail(ctx, data.UserEmail, subject, body); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	s.log.Info("Onboarding reminder sent", "email", data.UserEmail)
	return nil
}

// SendNotificationDigest sends one message covering everything that was not
// read in the application.
//
// The signature is the one internal/modules/notifications declares: it names
// what it needs and does not depend on this package's types.
func (s *Service) SendNotificationDigest(ctx context.Context, data DigestEmailData) error {
	items := data.Items
	if len(items) == 0 {
		return nil
	}
	if data.SupportEmail == "" {
		data.SupportEmail = s.fromAddress
	}

	// "1 новое событие" / "3 новых события" — a subject line that does not
	// agree with its own number reads as machine-made.
	subject := fmt.Sprintf("%s в BURCEV", pluralEvents(len(items)))

	body, err := s.renderTemplate("notification_digest", data)
	if err != nil {
		s.log.WithError(err).Error("Failed to render notification digest template")
		return fmt.Errorf("failed to render template: %w", err)
	}

	if err := s.sendEmail(ctx, data.UserEmail, subject, body); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	s.log.Info("Notification digest sent", "email", data.UserEmail, "events", len(items))
	return nil
}

// pluralEvents agrees the noun with the number, in Russian.
func pluralEvents(n int) string {
	mod100, mod10 := n%100, n%10
	switch {
	case mod100 >= 11 && mod100 <= 14:
		return fmt.Sprintf("%d новых событий", n)
	case mod10 == 1:
		return fmt.Sprintf("%d новое событие", n)
	case mod10 >= 2 && mod10 <= 4:
		return fmt.Sprintf("%d новых события", n)
	default:
		return fmt.Sprintf("%d новых событий", n)
	}
}

// SendVerificationEmail sends a verification code email with retry logic
func (s *Service) SendVerificationEmail(ctx context.Context, data VerificationEmailData) error {
	subject := "Код подтверждения — BURCEV"

	body, err := s.renderTemplate("email_verification", data)
	if err != nil {
		s.log.WithError(err).Error("Failed to render verification email template")
		return fmt.Errorf("failed to render template: %w", err)
	}

	maxRetries := 3
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		err := s.sendEmail(ctx, data.UserEmail, subject, body)
		if err == nil {
			s.log.Info("Verification email sent successfully",
				"email", data.UserEmail,
				"attempt", attempt,
			)
			return nil
		}

		lastErr = err
		s.log.WithError(err).Warn("Failed to send verification email",
			"email", data.UserEmail,
			"attempt", attempt,
			"max_retries", maxRetries,
		)

		if attempt < maxRetries {
			backoff := time.Duration(attempt) * time.Second
			time.Sleep(backoff)
		}
	}

	return fmt.Errorf("failed to send email after %d attempts: %w", maxRetries, lastErr)
}

// sendEmail sends an email via SMTP.
//
// Counted here rather than at each call site: "did the mail actually go out" is
// one question, not seven — and it is counted on success only, so the number
// means delivered rather than attempted.
func (s *Service) sendEmail(ctx context.Context, to, subject, body string) error {
	// Build email message
	from := fmt.Sprintf("%s <%s>", s.fromName, s.fromAddress)

	headers := make(map[string]string)
	headers["From"] = from
	headers["To"] = to
	headers["Subject"] = mime.QEncoding.Encode("utf-8", subject)
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
		if err := s.sendEmailTLS(addr, auth, to, []byte(message)); err != nil {
			return err
		}
		telemetry.Record(telemetry.EventEmailSent)
		return nil
	}

	// For port 587 (STARTTLS), use standard SMTP with STARTTLS
	if err := smtp.SendMail(addr, auth, s.fromAddress, []string{to}, []byte(message)); err != nil {
		return err
	}
	telemetry.Record(telemetry.EventEmailSent)
	return nil
}

// sendEmailTLS sends email using TLS connection (for port 465)
func (s *Service) sendEmailTLS(addr string, auth smtp.Auth, to string, message []byte) error {
	// Setup TLS config
	tlsConfig := &tls.Config{
		ServerName: s.smtpHost,
		MinVersion: tls.VersionTLS12,
	}

	// Connect with TLS under a deadline: a hung SMTP host must not hold the
	// calling goroutine indefinitely.
	dialCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	dialer := &tls.Dialer{Config: tlsConfig}
	netConn, err := dialer.DialContext(dialCtx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	conn := netConn.(*tls.Conn)
	defer func() { _ = conn.Close() }()

	// Create SMTP client
	client, err := smtp.NewClient(conn, s.smtpHost)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer func() { _ = client.Close() }()

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

	_, err = tmpl.New("onboarding_reminder").Parse(onboardingReminderTemplate)
	if err != nil {
		return nil, err
	}

	_, err = tmpl.New("email_verification").Parse(emailVerificationTemplate)
	if err != nil {
		return nil, err
	}

	_, err = tmpl.New("notification_digest").Parse(notificationDigestTemplate)
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

const emailVerificationTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Код подтверждения</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
        <h2 style="color: #2c3e50; margin-top: 0;">Код подтверждения</h2>

        <p>Здравствуйте,</p>

        <p>Ваш код подтверждения для аккаунта BURCEV:</p>

        <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2c3e50; background-color: #e9ecef; padding: 15px 30px; border-radius: 8px; display: inline-block;">{{.Code}}</span>
        </div>

        <p>Код действителен в течение 10 минут.</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
            Если вы не запрашивали этот код, проигнорируйте это письмо.
        </p>

        <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Это автоматическое сообщение от BURCEV. Пожалуйста, не отвечайте на это письмо.
        </p>
    </div>
</body>
</html>
`

const onboardingReminderTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ваш расчёт сохранён</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
        <h2 style="color: #2c3e50; margin-top: 0;">Ваш расчёт сохранён</h2>

        <p>{{if .Name}}{{.Name}}, здравствуйте!{{else}}Здравствуйте!{{end}}</p>

        <p>
            Вы рассчитывали свою суточную норму на BURCEV{{if .Calories}} — получилось
            <strong>{{.Calories}} ккал в день</strong>{{end}}. Расчёт сохранён: чтобы начать вести
            дневник питания по нему, осталось завести аккаунт — вводить параметры заново не придётся.
        </p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="{{.ResumeURL}}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; display: inline-block; font-weight: bold;">Вернуться к расчёту</a>
        </div>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
            Это единственное напоминание — больше писем об этом не будет.
            <a href="{{.UnsubscribeURL}}" style="color: #666;">Отписаться и удалить мои данные</a>.
        </p>

        <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Вопросы: <a href="mailto:{{.SupportEmail}}" style="color: #999;">{{.SupportEmail}}</a>
        </p>
    </div>
</body>
</html>
`

const notificationDigestTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Новые события в BURCEV</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
        <h2 style="color: #2c3e50; margin-top: 0;">Пока вас не было</h2>

        <p>{{if .Name}}{{.Name}}, здравствуйте!{{else}}Здравствуйте!{{end}}</p>

        <p>Вот что произошло в вашем аккаунте:</p>

        {{range .Items}}
        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
            <p style="margin: 0 0 4px 0; font-weight: bold; color: #111827;">{{.Title}}</p>
            <p style="margin: 0 0 8px 0; color: #4b5563;">{{.Content}}</p>
            <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{.At}}</p>
            {{if .ActionURL}}
            <p style="margin: 8px 0 0 0;">
                <a href="{{.ActionURL}}" style="color: #2563eb;">Открыть</a>
            </p>
            {{end}}
        </div>
        {{end}}

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
            Письмо приходит только о том, что вы не прочитали в приложении.
            Настроить, о чём писать, можно в
            <a href="{{.AppURL}}/settings/notifications" style="color: #666;">настройках уведомлений</a>,
            а <a href="{{.UnsubscribeURL}}" style="color: #666;">здесь</a> — отписаться от писем совсем.
        </p>

        <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Вопросы: <a href="mailto:{{.SupportEmail}}" style="color: #999;">{{.SupportEmail}}</a>
        </p>
    </div>
</body>
</html>
`
