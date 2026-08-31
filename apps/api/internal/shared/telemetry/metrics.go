// Package telemetry publishes what the service is doing.
//
// Before this the only signal was log lines in a container: there were no
// latencies, no error rate, and no alerts. Problems were reported by users.
package telemetry

import (
	"database/sql"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics holds every collector this service publishes.
type Metrics struct {
	registry *prometheus.Registry

	httpDuration *prometheus.HistogramVec
	httpTotal    *prometheus.CounterVec

	dbDuration   *prometheus.HistogramVec
	dbConnsOpen  prometheus.GaugeFunc
	dbConnsInUse prometheus.GaugeFunc
	dbConnsIdle  prometheus.GaugeFunc
	dbWaitCount  prometheus.CounterFunc

	jobDuration *prometheus.HistogramVec
	jobTotal    *prometheus.CounterVec

	domainEvents *prometheus.CounterVec
}

// DBStatsFunc reports pool statistics on demand. Taking a function rather than
// a snapshot matters: the gauges must read current values at scrape time, not
// whatever the pool looked like at startup.
type DBStatsFunc func() sql.DBStats

// New builds the metric set. The registry is private rather than the global
// default so tests can build an isolated instance.
func New(namespace string, stats DBStatsFunc) *Metrics {
	m := &Metrics{registry: prometheus.NewRegistry()}

	m.httpDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: namespace,
		Name:      "http_request_duration_seconds",
		Help:      "HTTP request latency by route template.",
		// Buckets chosen around what matters here: sub-100ms is fine, past a
		// second a user notices, past ten the request is effectively lost.
		Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
	}, []string{"method", "route", "status"})

	m.httpTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "http_requests_total",
		Help:      "HTTP requests by route template and status.",
	}, []string{"method", "route", "status"})

	m.dbDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: namespace,
		Name:      "db_query_duration_seconds",
		Help:      "Database query latency by operation.",
		Buckets:   []float64{0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5},
	}, []string{"operation"})

	m.jobDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: namespace,
		Name:      "job_duration_seconds",
		Help:      "Background job execution time.",
		Buckets:   []float64{0.1, 1, 5, 30, 60, 300},
	}, []string{"job"})

	m.jobTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "job_runs_total",
		Help:      "Background job executions by outcome.",
	}, []string{"job", "status"})

	// A deliberately small set: these are the events that show the product is
	// alive and are the first to drop when something breaks. A metric nobody
	// reads is storage cost and noise.
	m.domainEvents = prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "domain_events_total",
		Help:      "Key product events.",
	}, []string{"event"})

	m.registry.MustRegister(
		m.httpDuration, m.httpTotal, m.dbDuration,
		m.jobDuration, m.jobTotal, m.domainEvents,
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)

	if stats != nil {
		m.dbConnsOpen = gauge(namespace, "db_connections_open", "Open database connections.",
			func() float64 { return float64(stats().OpenConnections) })
		m.dbConnsInUse = gauge(namespace, "db_connections_in_use", "Database connections in use.",
			func() float64 { return float64(stats().InUse) })
		m.dbConnsIdle = gauge(namespace, "db_connections_idle", "Idle database connections.",
			func() float64 { return float64(stats().Idle) })
		m.dbWaitCount = prometheus.NewCounterFunc(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "db_connection_waits_total",
			Help:      "Times a caller waited for a connection — the signal that the pool is too small.",
		}, func() float64 { return float64(stats().WaitCount) })
		m.registry.MustRegister(m.dbConnsOpen, m.dbConnsInUse, m.dbConnsIdle, m.dbWaitCount)
	}

	return m
}

func gauge(namespace, name, help string, fn func() float64) prometheus.GaugeFunc {
	return prometheus.NewGaugeFunc(prometheus.GaugeOpts{
		Namespace: namespace, Name: name, Help: help,
	}, fn)
}

// Handler serves the metrics endpoint.
func (m *Metrics) Handler() gin.HandlerFunc {
	h := promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
	return func(c *gin.Context) { h.ServeHTTP(c.Writer, c.Request) }
}

// Middleware records latency and outcome for every request.
//
// The route label is the gin route *template*, not the concrete path: labelling
// by path would create one time series per id and make the metric useless.
func (m *Metrics) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		route := c.FullPath()
		if route == "" {
			// No route matched; bucket these together rather than by URL.
			route = "unmatched"
		}
		status := strconv.Itoa(c.Writer.Status())
		labels := prometheus.Labels{"method": c.Request.Method, "route": route, "status": status}

		m.httpDuration.With(labels).Observe(time.Since(start).Seconds())
		m.httpTotal.With(labels).Inc()
	}
}

// ObserveQuery records a database query.
func (m *Metrics) ObserveQuery(operation string, d time.Duration) {
	m.dbDuration.WithLabelValues(operation).Observe(d.Seconds())
}

// ObserveJob records a background job execution.
func (m *Metrics) ObserveJob(job, status string, d time.Duration) {
	m.jobDuration.WithLabelValues(job).Observe(d.Seconds())
	m.jobTotal.WithLabelValues(job, status).Inc()
}

// Domain event names.
const (
	EventUserRegistered  = "user_registered"
	EventLoginSucceeded  = "login_succeeded"
	EventLoginFailed     = "login_failed"
	EventFoodEntryLogged = "food_entry_logged"
	EventMessageSent     = "message_sent"
	EventFoodRecognized  = "food_recognized"
	EventEmailSent       = "email_sent"
)

// RecordEvent counts a product event.
func (m *Metrics) RecordEvent(event string) {
	m.domainEvents.WithLabelValues(event).Inc()
}
