/**
 * Prometheus format exporter
 * Converts metrics to Prometheus text format
 */

import type { Metric, CounterMetric, GaugeMetric, HistogramMetric } from './types'

/**
 * Escape label values for Prometheus format
 */
function escapeLabelValue(value: string | number): string {
  const str = String(value)
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

/**
 * Format labels for Prometheus
 */
function formatLabels(labels: Record<string, string | number>): string {
  const entries = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
  return entries.length > 0 ? `{${entries.join(',')}}` : ''
}

/**
 * Format counter metric to Prometheus format
 */
function formatCounter(metric: CounterMetric): string {
  const labels = formatLabels(metric.labels)
  return `${metric.name}${labels} ${metric.value}`
}

/**
 * Format gauge metric to Prometheus format
 */
function formatGauge(metric: GaugeMetric): string {
  const labels = formatLabels(metric.labels)
  return `${metric.name}${labels} ${metric.value}`
}

/**
 * Format histogram metric to Prometheus format
 */
function formatHistogram(metric: HistogramMetric): string {
  const labels = formatLabels(metric.labels)
  const lines: string[] = []

  // Count observations in each bucket (cumulative)
  // Each bucket should contain count of observations <= its value
  const bucketCounts = new Map<number, number>()
  const sortedBuckets = [...metric.buckets].sort((a, b) => a - b)
  sortedBuckets.forEach((bucket) => {
    bucketCounts.set(bucket, 0)
  })
  bucketCounts.set(Number.POSITIVE_INFINITY, 0)

  // For each observation, increment all buckets it falls into (cumulative)
  metric.observations.forEach((obs) => {
    sortedBuckets.forEach((bucket) => {
      if (obs <= bucket) {
        bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1)
      }
    })
    // Always increment +Inf bucket
    bucketCounts.set(Number.POSITIVE_INFINITY, (bucketCounts.get(Number.POSITIVE_INFINITY) || 0) + 1)
  })

  // Format buckets (use sorted order)
  // For histograms, we need to add le label to existing labels
  sortedBuckets.forEach((bucket) => {
    const count = bucketCounts.get(bucket) || 0
    // Add le label to existing labels
    const allLabels = { ...metric.labels, le: String(bucket) }
    const leLabelStr = formatLabels(allLabels)
    lines.push(`${metric.name}_bucket${leLabelStr} ${count}`)
  })
  // +Inf bucket
  const infCount = bucketCounts.get(Number.POSITIVE_INFINITY) || 0
  const infLabels = { ...metric.labels, le: '+Inf' }
  const infLabelStr = formatLabels(infLabels)
  lines.push(`${metric.name}_bucket${infLabelStr} ${infCount}`)

  // Sum and count
  lines.push(`${metric.name}_sum${labels} ${metric.sum}`)
  lines.push(`${metric.name}_count${labels} ${metric.count}`)

  return lines.join('\n')
}

/**
 * Format a single metric to Prometheus format
 */
function formatMetric(metric: Metric): string {
  switch (metric.type) {
    case 'counter':
      return formatCounter(metric)
    case 'gauge':
      return formatGauge(metric)
    case 'histogram':
      return formatHistogram(metric)
    default:
      return ''
  }
}

/**
 * Export all metrics to Prometheus text format
 */
export function exportToPrometheus(metrics: Metric[]): string {
  // Group metrics by name
  const metricsByName = new Map<string, Metric[]>()
  metrics.forEach((metric) => {
    const existing = metricsByName.get(metric.name) || []
    existing.push(metric)
    metricsByName.set(metric.name, existing)
  })

  const lines: string[] = []

  // Process each metric name
  for (const [name, metricList] of metricsByName.entries()) {
    const firstMetric = metricList[0]

    // Add HELP and TYPE comments
    lines.push(`# HELP ${name} ${firstMetric.help}`)
    lines.push(`# TYPE ${name} ${firstMetric.type}`)

    // Add all metric instances
    metricList.forEach((metric) => {
      const formatted = formatMetric(metric)
      if (formatted) {
        // For histograms, formatMetric returns multiple lines
        lines.push(formatted)
      }
    })

    // Add empty line between metric groups
    lines.push('')
  }

  return lines.join('\n')
}

