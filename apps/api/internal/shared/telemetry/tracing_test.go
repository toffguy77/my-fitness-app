package telemetry

import (
	"context"
	"net/http"
	"net/http/httptest"
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
	on, shutdown, err := StartTracing(context.Background(), "", "api", "test", "test")

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

// Трассировка обязана действительно стартовать с заданным адресом.
//
// На проде она не стартовала ни разу: `resource.Merge` отказывал с
// «conflicting Schema URL: .../1.43.0 and .../1.26.0» — версия semconv,
// которой описан сервис, разошлась с той, что несёт `resource.Default()`
// внутри SDK. Разошлась она при обновлении SDK, само по себе безобидном.
//
// Отказ был записан в лог при старте и на этом кончился: приложение
// продолжило работу, а `/health` всё равно сообщал «tracing: true» —
// признак считался по наличию адреса, а не по тому, что вышло.
//
// Проверка держит именно старт, а не экспорт: адрес указывает на локальный
// приёмник, наружу ничего не уходит.
func TestStartTracingStartsWithAnEndpoint(t *testing.T) {
	received := make(chan struct{}, 1)
	collector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case received <- struct{}{}:
		default:
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer collector.Close()

	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", collector.URL)
	t.Setenv("OTEL_EXPORTER_OTLP_INSECURE", "true")

	on, stop, err := StartTracing(context.Background(), collector.URL, "burcev-api", "v0.0.0-test", "test")
	require.NoError(t, err, "трассировка не стартовала")
	require.True(t, on, "адрес задан, а трассировка считает себя выключенной")
	require.NotNil(t, stop)
	require.NoError(t, stop(context.Background()))
}
