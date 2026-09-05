package notifications

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
)

// The push endpoint is a URL supplied by the browser — which means, from the
// server's point of view, a URL supplied by whoever is using the browser. The
// server then makes requests to it on a schedule, from inside the network.
//
// Left unchecked that is server-side request forgery: subscribe with
// `http://169.254.169.254/…` or `http://localhost:4000/…` and the service will
// dutifully POST there every time a notification is created. The response body
// never reaches the attacker, but a POST to an internal address is damage on
// its own, and the delivery status leaks a coarse signal about what answered.
//
// Two guards, because either alone is defeatable:
//
//  1. The endpoint is validated when it is stored: https only, standard port,
//     and not an address literal inside the network.
//  2. The dialler refuses to connect to a private, loopback or link-local
//     address whatever DNS says at the moment of connection. A hostname that
//     resolves to a public address at subscribe time and a private one at send
//     time — DNS rebinding — gets no further than the socket.

// validatePushEndpoint rejects an endpoint that has no business being one.
func validatePushEndpoint(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("push endpoint is not a URL: %w", apperrors.ErrValidation)
	}

	// https only: a push service that speaks plain http does not exist, and
	// allowing it would let an endpoint downgrade the request.
	if parsed.Scheme != "https" {
		return fmt.Errorf("push endpoint must be https: %w", apperrors.ErrValidation)
	}

	host := parsed.Hostname()
	if host == "" {
		return fmt.Errorf("push endpoint has no host: %w", apperrors.ErrValidation)
	}

	// A non-standard port is how an internal service on the same host gets
	// reached; no push service uses one.
	if port := parsed.Port(); port != "" && port != "443" {
		return fmt.Errorf("push endpoint must use the standard port: %w", apperrors.ErrValidation)
	}

	// An address literal skips DNS entirely, so check it here as well as in the
	// dialler.
	if ip := net.ParseIP(host); ip != nil && !isPublicIP(ip) {
		return fmt.Errorf("push endpoint addresses the internal network: %w", apperrors.ErrValidation)
	}

	return nil
}

// isPublicIP reports whether an address is one the outside world could route
// to — anything else is inside our network or the host itself.
func isPublicIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() {
		return false
	}
	// Carrier-grade NAT (100.64.0.0/10) is not covered by IsPrivate and is
	// where a cloud provider's internal services often live.
	if v4 := ip.To4(); v4 != nil && v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
		return false
	}
	// IPv4-mapped IPv6 (::ffff:127.0.0.1) would otherwise slip past the checks
	// above on the v6 path.
	if v4 := ip.To4(); v4 != nil && ip.To16() != nil && len(ip) == net.IPv6len {
		return isPublicIP(v4)
	}
	return true
}

// outboundPushClient is the HTTP client used to reach push services. Its
// dialler is the guard that DNS rebinding cannot get around.
func outboundPushClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}

	return &http.Client{
		Timeout: 20 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
				host, _, err := net.SplitHostPort(address)
				if err != nil {
					return nil, err
				}
				addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
				if err != nil {
					return nil, err
				}
				for _, candidate := range addresses {
					if !isPublicIP(candidate.IP) {
						return nil, fmt.Errorf("refusing to connect to %s: not a public address", candidate.IP)
					}
				}
				return dialer.DialContext(ctx, network, address)
			},
			// A push service that redirects is not something we follow into;
			// the client below refuses redirects for the same reason.
			MaxIdleConnsPerHost: 4,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			// A redirect is a second URL the endpoint chose, and it would not
			// pass the checks the first one did.
			return http.ErrUseLastResponse
		},
	}
}
