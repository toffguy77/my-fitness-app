// Package httpx builds the HTTP clients this service uses to call the outside
// world.
//
// Единственная причина, по которой пакет существует: на этом хосте нет
// маршрута в IPv6. Адреса по IPv6 разрешаются, соединение не устанавливается —
// `connect: network is unreachable`. Это уже стоило двух молчаливых поломок:
// бот поддержки принимал сообщения и не мог ответить, а сборки падали на
// Docker Hub.
//
// Go пробует адреса по очереди и должен откатываться на IPv4, но при
// недостижимой сети откат срабатывает не всегда и не сразу — а «не сразу»
// здесь означает таймаут и отказ, неотличимый для вызывающего от неисправного
// собеседника.
package httpx

import (
	"context"
	"net"
	"net/http"
	"time"
)

// dialer is shared: the settings are the same everywhere, and having one of
// them means there is one place to revisit when IPv6 starts working.
var dialer = &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}

// DialContext dials over IPv4 whatever network it is asked for.
//
// Exported because HTTP is not the only thing on this host that leaves it. SMTP
// dials its own socket, and smtp.yandex.ru publishes an AAAA record — so the
// mail path had the same defect as the bot, waiting for the same conditions.
func DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	switch network {
	case "tcp", "tcp6":
		network = "tcp4"
	}
	return dialer.DialContext(ctx, network, addr)
}

// NewClient returns an HTTP client that talks IPv4.
//
// Не «предпочитает», а именно только IPv4: предпочтение здесь уже пробовали —
// им занимается сам Go, и на этом хосте оно подводит. Когда появится рабочий
// IPv6, это место придётся вспомнить; ради этого оно и собрано в одном пакете,
// а не рассыпано по клиентам.
func NewClient(timeout time.Duration) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = DialContext

	return &http.Client{Timeout: timeout, Transport: transport}
}
