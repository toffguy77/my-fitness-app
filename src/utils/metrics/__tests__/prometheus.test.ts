/**
 * Tests for Prometheus formatter
 */

import { exportToPrometheus } from '../prometheus'
import type { CounterMetric, GaugeMetric, HistogramMetric } from '../types'

describe('Prometheus Formatter', () => {
  describe('Counter formatting', () => {
    it('should format counter metric', () => {
      const metric: CounterMetric = {
        type: 'counter',
        name: 'test_counter',
        help: 'Test counter',
        value: 123,
        labels: {},
      }

      const output = exportToPrometheus([metric])
      expect(output).toContain('# HELP test_counter Test counter')
      expect(output).toContain('# TYPE test_counter counter')
      expect(output).toContain('test_counter 123')
    })

    it('should format counter with labels', () => {
      const metric: CounterMetric = {
        type: 'counter',
        name: 'test_counter',
        help: 'Test counter',
        value: 456,
        labels: { method: 'GET', status: '200' },
      }

      const output = exportToPrometheus([metric])
      expect(output).toContain('test_counter{method="GET",status="200"} 456')
    })
  })

  describe('Gauge formatting', () => {
    it('should format gauge metric', () => {
      const metric: GaugeMetric = {
        type: 'gauge',
        name: 'test_gauge',
        help: 'Test gauge',
        value: 789,
        labels: {},
      }

      const output = exportToPrometheus([metric])
      expect(output).toContain('# HELP test_gauge Test gauge')
      expect(output).toContain('# TYPE test_gauge gauge')
      expect(output).toContain('test_gauge 789')
    })
  })

  describe('Histogram formatting', () => {
    it('should format histogram metric', () => {
      const metric: HistogramMetric = {
        type: 'histogram',
        name: 'test_histogram',
        help: 'Test histogram',
        buckets: [0.1, 0.5, 1.0],
        observations: [0.05, 0.3, 0.7, 1.5],
        sum: 2.55,
        count: 4,
        labels: {},
      }

      const output = exportToPrometheus([metric])
      expect(output).toContain('# HELP test_histogram Test histogram')
      expect(output).toContain('# TYPE test_histogram histogram')
      expect(output).toContain('test_histogram_bucket{le="0.1"}')
      expect(output).toContain('test_histogram_bucket{le="0.5"}')
      expect(output).toMatch(/test_histogram_bucket\{le="1(\.0)?"\}/)
      expect(output).toContain('test_histogram_bucket{le="+Inf"}')
      expect(output).toContain('test_histogram_sum 2.55')
      expect(output).toContain('test_histogram_count 4')
    })

    it('should calculate bucket counts correctly', () => {
      const metric: HistogramMetric = {
        type: 'histogram',
        name: 'test_histogram',
        help: 'Test histogram',
        buckets: [0.1, 0.5, 1.0],
        observations: [0.05, 0.3, 0.7, 1.5],
        sum: 2.55,
        count: 4,
        labels: {},
      }

      const output = exportToPrometheus([metric])
      // Buckets are cumulative: each bucket includes all observations <= its value
      // 0.05 <= 0.1 (1), 0.05,0.3 <= 0.5 (2), 0.05,0.3,0.7 <= 1.0 (3), all <= +Inf (4)
      expect(output).toContain('test_histogram_bucket{le="0.1"} 1')
      expect(output).toContain('test_histogram_bucket{le="0.5"} 2')
      expect(output).toMatch(/test_histogram_bucket\{le="1(\.0)?"\} 3/)
      expect(output).toContain('test_histogram_bucket{le="+Inf"} 4')
    })
  })

  describe('Label escaping', () => {
    it('should escape special characters in labels', () => {
      const metric: CounterMetric = {
        type: 'counter',
        name: 'test_counter',
        help: 'Test counter',
        value: 1,
        labels: { path: '/app/dashboard\n' },
      }

      const output = exportToPrometheus([metric])
      expect(output).toContain('path="/app/dashboard\\n"')
    })
  })

  describe('Multiple metrics', () => {
    it('should format multiple metrics', () => {
      const metrics = [
        {
          type: 'counter' as const,
          name: 'counter1',
          help: 'Counter 1',
          value: 1,
          labels: {},
        },
        {
          type: 'gauge' as const,
          name: 'gauge1',
          help: 'Gauge 1',
          value: 2,
          labels: {},
        },
      ]

      const output = exportToPrometheus(metrics)
      expect(output).toContain('counter1')
      expect(output).toContain('gauge1')
    })
  })
})

