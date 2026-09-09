package telemetry

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/getsentry/sentry-go"
	"github.com/gin-gonic/gin"
)

// Reporting the failures nobody was watching for.
//
// Off unless SENTRY_DSN is set, like every other optional capability here.
//
// What is deliberately not sent matters as much as what is: no request bodies,
// no chat messages, no headers carrying credentials. An error report is read by
// whoever is on call, which is a wider audience than the person whose data it
// would contain.

// StartErrorReporting connects to Sentry when a DSN is configured, and reports
// whether it did.
func StartErrorReporting(dsn, version, environment string) (bool, error) {
	if dsn == "" {
		return false, nil
	}

	err := sentry.Init(sentry.ClientOptions{
		Dsn:         dsn,
		Release:     version,
		Environment: environment,
		// The bodies are where the personal data is: what somebody wrote to
		// their curator, what they ate, the password they were changing.
		SendDefaultPII: false,
		BeforeSend:     scrub,
	})
	if err != nil {
		return false, fmt.Errorf("connect to Sentry: %w", err)
	}
	return true, nil
}

// FlushErrors waits briefly for anything queued. Always safe to call.
func FlushErrors() {
	sentry.Flush(2 * time.Second)
}

// headersWorthKeeping is the whole list. Everything else is dropped rather
// than filtered, because a list of what to remove has to be kept in step with
// every header anybody adds, and it will not be.
var headersWorthKeeping = map[string]bool{
	"X-Request-Id":      true,
	"User-Agent":        true,
	"Accept-Language":   true,
	"Content-Type":      true,
	"X-Forwarded-Proto": true,
}

// scrub removes everything an error report does not need in order to be
// actionable.
func scrub(event *sentry.Event, _ *sentry.EventHint) *sentry.Event {
	if event.Request != nil {
		// The body is the request's personal half: chat messages, food
		// entries, passwords in flight.
		event.Request.Data = ""
		// A query string carries tokens (reset links, unsubscribe links) —
		// dropped whole rather than picked through.
		event.Request.QueryString = ""
		event.Request.Cookies = ""

		kept := map[string]string{}
		for name, value := range event.Request.Headers {
			if headersWorthKeeping[http.CanonicalHeaderKey(name)] {
				kept[name] = value
			}
		}
		event.Request.Headers = kept
	}

	// Breadcrumbs record what happened before the failure, including request
	// bodies the SDK captured on the way.
	for i := range event.Breadcrumbs {
		delete(event.Breadcrumbs[i].Data, "body")
		delete(event.Breadcrumbs[i].Data, "content")
	}

	return event
}

// ReportPanic sends a panic with the version and the trace identifier, so the
// report can be read next to the request that caused it.
func ReportPanic(c *gin.Context, recovered any) {
	if sentry.CurrentHub().Client() == nil {
		return
	}

	hub := sentry.CurrentHub().Clone()
	hub.Scope().SetRequest(c.Request)
	if id, ok := c.Get("request_id"); ok {
		hub.Scope().SetTag("trace_id", fmt.Sprint(id))
	}
	hub.Scope().SetTag("route", c.FullPath())
	if userID, ok := c.Get("user_id"); ok {
		// The identifier, never the address or the name: enough to see that one
		// account is affected, not enough to say who they are.
		hub.Scope().SetUser(sentry.User{ID: fmt.Sprint(userID)})
	}

	hub.RecoverWithContext(c.Request.Context(), recovered)
}

// Recovery turns a panic into a 500 and a report, in that order: the person
// waiting gets an answer whether or not the reporting works.
func Recovery(onPanic func(c *gin.Context, recovered any)) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			recovered := recover()
			if recovered == nil {
				return
			}

			if onPanic != nil {
				onPanic(c, recovered)
			}
			ReportPanic(c, recovered)
			MarkError(c.Request.Context(), fmt.Errorf("panic: %v", recovered), http.StatusInternalServerError)

			if !c.Writer.Written() {
				// Та же форма, что у всех остальных ошибок. Паника — не повод
				// отвечать чем-то, чего клиент не умеет разбирать: именно
				// здесь ему особенно нечего показать человеку.
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
					"status":  "error",
					"code":    apperrors.CodeInternal,
					"message": "Внутренняя ошибка сервера",
				})
				return
			}
			c.Abort()
		}()

		c.Next()
	}
}

// DSNHost is the host an error report is sent to, for the frontend's
// content-security policy. Empty when reporting is off.
func DSNHost(dsn string) string {
	if dsn == "" {
		return ""
	}
	at := strings.LastIndex(dsn, "@")
	if at < 0 {
		return ""
	}
	rest := dsn[at+1:]
	if slash := strings.Index(rest, "/"); slash > 0 {
		return rest[:slash]
	}
	return rest
}

// BrowserError forwards a failure that happened in somebody's browser.
//
// The browser does not talk to the error tracker directly. It reports to this
// application, which already receives its logs, and this forwards what is worth
// forwarding. That keeps one credential on the server, keeps the tracker's host
// out of the content-security policy, and means the browser ships no second
// reporting SDK — the page a person waits for stays the size it was.
//
// Only the message, the stack and where it happened travel. Whatever the page
// was showing does not.
func BrowserError(message, stack, url, release, traceID, userID string) {
	if sentry.CurrentHub().Client() == nil {
		return
	}

	hub := sentry.CurrentHub().Clone()
	hub.Scope().SetTag("source", "browser")
	hub.Scope().SetTag("url", url)
	if release != "" {
		hub.Scope().SetTag("release", release)
	}
	if traceID != "" {
		hub.Scope().SetTag("trace_id", traceID)
	}
	if userID != "" {
		hub.Scope().SetUser(sentry.User{ID: userID})
	}
	if stack != "" {
		hub.Scope().SetContext("browser", sentry.Context{"stack": stack})
	}

	hub.CaptureMessage(message)
}
