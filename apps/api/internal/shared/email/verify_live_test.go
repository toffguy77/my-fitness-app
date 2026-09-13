//go:build live

// Живая проверка учётных данных SMTP: подключиться, представиться, положить
// трубку. Ничего не отправляет.
//
// Отдельный тег сборки, потому что это обращение к настоящему почтовому
// серверу. Компилируется в CI, запускается руками:
//
//	SMTP_HOST=smtp.yandex.ru SMTP_PORT=465 \
//	SMTP_USERNAME=… SMTP_PASSWORD=… \
//		go test -tags=live ./internal/shared/email/ -run TestLiveCredentials -v
//
// Существует потому, что «настройки заполнены» и «настройки работают» — разные
// вопросы, и один раз они разошлись так, что вся почта умерла молча в обеих
// средах, а /ready продолжал докладывать, что всё хорошо.
package email

import (
	"context"
	"os"
	"strconv"
	"testing"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/require"
)

func TestLiveCredentials(t *testing.T) {
	user := os.Getenv("SMTP_USERNAME")
	pass := os.Getenv("SMTP_PASSWORD")
	if user == "" || pass == "" {
		t.Skip("нет SMTP_USERNAME/SMTP_PASSWORD — живая проверка пропущена")
	}

	host := os.Getenv("SMTP_HOST")
	if host == "" {
		host = "smtp.yandex.ru"
	}
	port := 465
	if text := os.Getenv("SMTP_PORT"); text != "" {
		parsed, err := strconv.Atoi(text)
		require.NoError(t, err)
		port = parsed
	}

	service, err := NewService(Config{
		SMTPHost: host, SMTPPort: port,
		SMTPUsername: user, SMTPPassword: pass,
		FromAddress: os.Getenv("SMTP_FROM_ADDRESS"), FromName: "BURCEV",
	}, logger.New())
	require.NoError(t, err)

	require.NoError(t, service.VerifyCredentials(context.Background()),
		"сервер не принял учётные данные")
	t.Logf("%s@%s:%d — соединение установлено, пароль принят", user, host, port)
}
