/**
 * Metrics Collector for Prometheus
 * In-memory storage for metrics collection
 */

import type {
  Metric,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  MetricLabels,
  HistogramConfig,
} from './types'
import { DEFAULT_HISTOGRAM_BUCKETS } from './types'

/**
 * Generate a unique key for a metric with labels
 */
function getMetricKey(name: string, labels: MetricLabels): string {
  const labelStr = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(',')
  return labelStr ? `${name}{${labelStr}}` : name
}

/**
 * Metrics Collector class
 * Thread-safe operations for Next.js serverless environment
 */
class MetricsCollector {
  private metrics: Map<string, Metric> = new Map()

  /**
   * Increment a counter metric
   */
  counter(
    name: string,
    help: string,
    labels: MetricLabels = {},
    value: number = 1
  ): void {
    const key = getMetricKey(name, labels)
    const existing = this.metrics.get(key)

    if (existing && existing.type === 'counter') {
      existing.value += value
    } else {
      this.metrics.set(key, {
        type: 'counter',
        name,
        help,
        value,
        labels,
      })
    }
  }

  /**
   * Set a gauge metric value
   */
  gauge(
    name: string,
    help: string,
    value: number,
    labels: MetricLabels = {}
  ): void {
    const key = getMetricKey(name, labels)
    this.metrics.set(key, {
      type: 'gauge',
      name,
      help,
      value,
      labels,
    })
  }

  /**
   * Increment a gauge metric
   */
  gaugeInc(name: string, help: string, labels: MetricLabels = {}, value: number = 1): void {
    const key = getMetricKey(name, labels)
    const existing = this.metrics.get(key)

    if (existing && existing.type === 'gauge') {
      existing.value += value
    } else {
      this.gauge(name, help, value, labels)
    }
  }

  /**
   * Decrement a gauge metric
   */
  gaugeDec(name: string, help: string, labels: MetricLabels = {}, value: number = 1): void {
    const key = getMetricKey(name, labels)
    const existing = this.metrics.get(key)

    if (existing && existing.type === 'gauge') {
      existing.value -= value
    } else {
      this.gauge(name, help, -value, labels)
    }
  }

  /**
   * Record a histogram observation
   */
  histogram(
    name: string,
    help: string,
    value: number,
    labels: MetricLabels = {},
    config: HistogramConfig = {}
  ): void {
    const buckets = config.buckets || DEFAULT_HISTOGRAM_BUCKETS
    const key = getMetricKey(name, labels)
    const existing = this.metrics.get(key)

    if (existing && existing.type === 'histogram') {
      // Add observation to appropriate buckets
      existing.observations.push(value)
      existing.sum += value
      existing.count += 1
    } else {
      this.metrics.set(key, {
        type: 'histogram',
        name,
        help,
        buckets,
        observations: [value],
        sum: value,
        count: 1,
        labels,
      })
    }
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Metric[] {
    return Array.from(this.metrics.values())
  }

  /**
   * Get metrics by name
   */
  getMetricsByName(name: string): Metric[] {
    return Array.from(this.metrics.values()).filter((m) => m.name === name)
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clear(): void {
    this.metrics.clear()
  }

  /**
   * Get metric by key
   */
  getMetric(key: string): Metric | undefined {
    return this.metrics.get(key)
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector()
