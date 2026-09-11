package middleware

import (
	"crypto/sha256"
	"encoding/hex"

	"github.com/burcev/api/internal/shared/telemetry"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

// RequestIDHeader is what a client sends and what comes back.
const RequestIDHeader = "X-Request-Id"

// Tracing opens a span for each request and gives the request one identifier
// that everything else uses.
//
// The identifier is derived from what the client sent rather than invented
// alongside it: a person reporting "request 4f2a… failed" must be findable, and
// two identifiers for one request means looking in two places and believing
// they line up.
func Tracing() gin.HandlerFunc {
	tracer := otel.Tracer("burcev/api")

	return func(c *gin.Context) {
		requested := c.GetHeader(RequestIDHeader)
		if requested == "" {
			requested = uuid.New().String()
		}

		ctx, span := tracer.Start(c.Request.Context(), c.FullPath(),
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithNewRoot(),
		)
		defer span.End()

		// The trace identifier when tracing is on, the client's value when it
		// is off. Either way there is exactly one, and it is what the logs and
		// the response header carry.
		id := telemetry.TraceIDFrom(ctx)
		if id == "" {
			id = traceIDFor(requested)
		}

		c.Set("request_id", id)
		c.Set("client_request_id", requested)
		c.Header(RequestIDHeader, id)
		c.Request = c.Request.WithContext(ctx)

		c.Next()

		if status := c.Writer.Status(); status >= 500 {
			telemetry.MarkError(ctx, nil, status)
		}
	}
}

// traceIDFor turns any client-supplied value into the shape of a trace id, so
// that a request looks the same in the logs whether or not a collector is
// configured. Hashed rather than used directly: the value comes from outside
// and must not decide what a log line looks like.
func traceIDFor(requested string) string {
	sum := sha256.Sum256([]byte(requested))
	return hex.EncodeToString(sum[:16])
}
