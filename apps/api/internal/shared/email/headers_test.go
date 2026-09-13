package email

import (
	"bufio"
	"context"
	"net"
	"strings"
	"sync"
	"testing"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeSMTP speaks just enough SMTP to accept one letter and hand it back.
//
// Раньше заголовки письма не проверялись вовсе: их собирали и сразу отдавали в
// сеть, так что «письмо ушло» и «письмо ушло правильным» были одним вопросом.
// Reply-To — первый заголовок, у которого есть последствия: без него ответ
// человека уходит на noreply@ и не читается никем.
func fakeSMTP(t *testing.T) (addr string, received func() string) {
	t.Helper()

	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })

	var mu sync.Mutex
	var data strings.Builder

	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()

		reader := bufio.NewReader(conn)
		write := func(s string) { _, _ = conn.Write([]byte(s + "\r\n")) }

		write("220 fake ESMTP")
		inData := false
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				return
			}
			line = strings.TrimRight(line, "\r\n")

			if inData {
				if line == "." {
					inData = false
					write("250 Ok")
					continue
				}
				mu.Lock()
				data.WriteString(line + "\n")
				mu.Unlock()
				continue
			}

			switch {
			case strings.HasPrefix(line, "EHLO"), strings.HasPrefix(line, "HELO"):
				write("250-fake")
				write("250 AUTH PLAIN")
			case strings.HasPrefix(line, "AUTH"):
				write("235 Ok")
			case strings.HasPrefix(line, "MAIL FROM"), strings.HasPrefix(line, "RCPT TO"):
				write("250 Ok")
			case line == "DATA":
				inData = true
				write("354 End with .")
			case line == "QUIT":
				write("221 Bye")
				return
			default:
				write("250 Ok")
			}
		}
	}()

	return listener.Addr().String(), func() string {
		mu.Lock()
		defer mu.Unlock()
		return data.String()
	}
}

func serviceTalkingTo(t *testing.T, addr, replyTo string) *Service {
	t.Helper()
	host, portText, err := net.SplitHostPort(addr)
	require.NoError(t, err)

	port := 0
	for _, r := range portText {
		port = port*10 + int(r-'0')
	}

	service, err := NewService(Config{
		SMTPHost:     host,
		SMTPPort:     port,
		SMTPUsername: "noreply@burcev.team",
		SMTPPassword: "пароль",
		FromAddress:  "noreply@burcev.team",
		FromName:     "BURCEV",
		ReplyTo:      replyTo,
	}, logger.New())
	require.NoError(t, err)
	return service
}

// Ответ человека должен попадать к людям.
func TestLetterCarriesReplyTo(t *testing.T) {
	addr, received := fakeSMTP(t)
	service := serviceTalkingTo(t, addr, "support@burcev.team")

	require.NoError(t, service.sendEmail(context.Background(),
		"человек@example.com", "Тема", "<p>тело</p>"))

	assert.Contains(t, received(), "Reply-To: support@burcev.team")
}

// Пусто — заголовка нет: пустой Reply-To хуже отсутствующего, письмо с ним
// часть получателей считает подозрительным.
func TestEmptyReplyToAddsNoHeader(t *testing.T) {
	addr, received := fakeSMTP(t)
	service := serviceTalkingTo(t, addr, "")

	require.NoError(t, service.sendEmail(context.Background(),
		"человек@example.com", "Тема", "<p>тело</p>"))

	assert.NotContains(t, received(), "Reply-To:")
}

// Заодно: тема на кириллице обязана быть закодирована, иначе письмо приходит
// с темой из вопросительных знаков.
func TestSubjectIsEncoded(t *testing.T) {
	addr, received := fakeSMTP(t)
	service := serviceTalkingTo(t, addr, "support@burcev.team")

	require.NoError(t, service.sendEmail(context.Background(),
		"человек@example.com", "Восстановление пароля", "<p>тело</p>"))

	body := received()
	assert.Contains(t, body, "Subject: =?utf-8?")
	assert.NotContains(t, body, "Subject: Восстановление")
}
