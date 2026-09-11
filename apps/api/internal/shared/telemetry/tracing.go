package telemetry

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

// Tracing, when there is somewhere to send it.
//
// Like every other optional capability here, this is decided by the presence of
// a credential: without an endpoint the application runs exactly as before and
// says so once at startup, rather than failing or pretending.

// DefaultSuccessRatio is the share of successful requests exported when
// OTEL_TRACES_SAMPLE_RATIO is unset. Failures are always exported, whatever
// this says.
const DefaultSuccessRatio = 0.1

// Shutdown flushes anything buffered. Always safe to call.
type Shutdown func(context.Context) error

// StartTracing wires OpenTelemetry if an endpoint is configured, and reports
// whether it did.
func StartTracing(ctx context.Context, endpoint, serviceName, version, environment string) (bool, Shutdown, error) {
	if endpoint == "" {
		return false, func(context.Context) error { return nil }, nil
	}

	exporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return false, nil, fmt.Errorf("create trace exporter: %w", err)
	}

	res, err := resource.Merge(resource.Default(), resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(serviceName),
		semconv.ServiceVersion(version),
		semconv.DeploymentEnvironment(environment),
	))
	if err != nil {
		return false, nil, fmt.Errorf("describe service: %w", err)
	}

	provider := sdktrace.NewTracerProvider(
		sdktrace.WithResource(res),
		// Every span is recorded; what leaves is decided when it ends, by the
		// processor below. Head sampling cannot do that: whether a request
		// failed is not known when it starts.
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithSpanProcessor(&errorsAlways{
			next:  sdktrace.NewBatchSpanProcessor(exporter),
			ratio: successRatio(),
		}),
	)

	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{}, propagation.Baggage{},
	))

	return true, func(ctx context.Context) error {
		shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		return provider.Shutdown(shutdownCtx)
	}, nil
}

func successRatio() float64 {
	raw := os.Getenv("OTEL_TRACES_SAMPLE_RATIO")
	if raw == "" {
		return DefaultSuccessRatio
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value < 0 || value > 1 {
		return DefaultSuccessRatio
	}
	return value
}

// errorsAlways exports every failed span and a share of the successful ones.
//
// A trace is worth keeping when something went wrong, and a tenth of the rest
// is enough to see what normal looks like. Deciding at the end rather than the
// start is the only way to know which is which.
type errorsAlways struct {
	next  sdktrace.SpanProcessor
	ratio float64
}

func (p *errorsAlways) OnStart(parent context.Context, s sdktrace.ReadWriteSpan) {
	p.next.OnStart(parent, s)
}

func (p *errorsAlways) OnEnd(s sdktrace.ReadOnlySpan) {
	if s.Status().Code == codes.Error {
		p.next.OnEnd(s)
		return
	}
	// The trace id is already random; using its low bits keeps every span of
	// one trace on the same side of the decision.
	id := s.SpanContext().TraceID()
	threshold := uint64(p.ratio * float64(1<<56))
	var low uint64
	for _, b := range id[8:15] {
		low = low<<8 | uint64(b)
	}
	if low < threshold {
		p.next.OnEnd(s)
	}
}

func (p *errorsAlways) Shutdown(ctx context.Context) error   { return p.next.Shutdown(ctx) }
func (p *errorsAlways) ForceFlush(ctx context.Context) error { return p.next.ForceFlush(ctx) }

// TraceIDFrom returns the trace identifier for a context, or an empty string
// when nothing is being traced.
func TraceIDFrom(ctx context.Context) string {
	span := trace.SpanContextFromContext(ctx)
	if !span.HasTraceID() {
		return ""
	}
	return span.TraceID().String()
}

// MarkError records a failure on the current span, so the processor above
// keeps it.
func MarkError(ctx context.Context, err error, status int) {
	span := trace.SpanFromContext(ctx)
	if !span.IsRecording() {
		return
	}
	span.SetAttributes(attribute.Int("http.response.status_code", status))
	if err != nil {
		span.RecordError(err)
	}
	span.SetStatus(codes.Error, fmt.Sprintf("status %d", status))
}
