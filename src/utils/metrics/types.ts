/**
 * Types for Prometheus metrics
 */

export type MetricType = 'counter' | 'gauge' | 'histogram'

export interface MetricLabels {
  [key: string]: string | number
}

export interface CounterMetric {
  type: 'counter'
  name: string
  help: string
  value: number
  labels: MetricLabels
}

export interface GaugeMetric {
  type: 'gauge'
  name: string
  help: string
  value: number
  labels: MetricLabels
}

export interface HistogramMetric {
  type: 'histogram'
  name: string
  help: string
  buckets: number[]
  observations: number[]
  sum: number
  count: number
  labels: MetricLabels
}

export type Metric = CounterMetric | GaugeMetric | HistogramMetric

export interface HistogramConfig {
  buckets?: number[]
}

// Default histogram buckets (in seconds)
export const DEFAULT_HISTOGRAM_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
]
