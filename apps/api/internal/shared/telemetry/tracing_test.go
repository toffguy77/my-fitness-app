package telemetry

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

// Without a collector the application runs exactly as before, and says so once
// rather than failing or pretending to trace.
func TestTracingIsOffWithoutAnEndpoint(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")

	on, shutdown, err := StartTracing(context.Background(), "api", "test", "test")

	require.NoError(t, err)
	assert.False(t, on)
	assert.NoError(t, shutdown(context.Background()))
}

func TestSuccessRatio(t *testing.T) {
	t.Run("defaults when unset", func(t *testing.T) {
		t.Setenv("OTEL_TRACES_SAMPLE_RATIO", "")
		assert.Equal(t, DefaultSuccessRatio, successRatio())
	})

	t.Run("reads the setting", func(t *testing.T) {
		t.Setenv("OTEL_TRACES_SAMPLE_RATIO", "0.5")
		assert.Equal(t, 0.5, successRatio())
	})

	// A nonsense value must not silently mean "trace nothing": that is the
	// failure nobody notices until they need a trace.
	t.Run("falls back for a value that is not a ratio", func(t *testing.T) {
		for _, bad := range []string{"loads", "-1", "2", ""} {
			os.Setenv("OTEL_TRACES_SAMPLE_RATIO", bad)
			assert.Equal(t, DefaultSuccessRatio, successRatio(), "for %q", bad)
		}
		os.Unsetenv("OTEL_TRACES_SAMPLE_RATIO")
	})
}

// Whether a request failed is not known when it starts, so the decision is made
// when the span ends.
func TestEveryFailureIsExported(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithSpanProcessor(&errorsAlways{next: recorder, ratio: 0}),
	)
	tracer := provider.Tracer("test")

	for i := 0; i < 20; i++ {
		_, span := tracer.Start(context.Background(), "failed")
		span.SetStatus(codes.Error, "boom")
		span.End()
	}
	for i := 0; i < 20; i++ {
		_, span := tracer.Start(context.Background(), "fine")
		span.End()
	}

	ended := recorder.Ended()
	assert.Len(t, ended, 20, "every failure and, at ratio 0, no successes")
	for _, span := range ended {
		assert.Equal(t, codes.Error, span.Status().Code)
	}
}

func TestSuccessesAreExportedAtRatioOne(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithSpanProcessor(&errorsAlways{next: recorder, ratio: 1}),
	)
	tracer := provider.Tracer("test")

	for i := 0; i < 10; i++ {
		_, span := tracer.Start(context.Background(), "fine")
		span.End()
	}

	assert.Len(t, recorder.Ended(), 10)
}

func TestTraceIDFromIsEmptyWithoutASpan(t *testing.T) {
	assert.Empty(t, TraceIDFrom(context.Background()))
}
