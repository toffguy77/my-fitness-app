/**
 * Tests for Metrics Collector
 */

import { metricsCollector } from '../collector'

describe('MetricsCollector', () => {
  beforeEach(() => {
    metricsCollector.clear()
  })

  describe('Counter', () => {
    it('should increment counter', () => {
      metricsCollector.counter('test_counter', 'Test counter', {}, 1)
      const metrics = metricsCollector.getAllMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].type).toBe('counter')
      expect(metrics[0].name).toBe('test_counter')
      if (metrics[0].type === 'counter') {
        expect(metrics[0].value).toBe(1)
      }
    })

    it('should increment counter with labels', () => {
      metricsCollector.counter('test_counter', 'Test counter', { method: 'GET' }, 1)
      const metrics = metricsCollector.getMetricsByName('test_counter')
      expect(metrics).toHaveLength(1)
      if (metrics[0].type === 'counter') {
        expect(metrics[0].value).toBe(1)
        expect(metrics[0].labels.method).toBe('GET')
      }
    })

    it('should accumulate counter values', () => {
      metricsCollector.counter('test_counter', 'Test counter', {}, 1)
      metricsCollector.counter('test_counter', 'Test counter', {}, 2)
      const metrics = metricsCollector.getMetricsByName('test_counter')
      expect(metrics).toHaveLength(1)
      if (metrics[0].type === 'counter') {
        expect(metrics[0].value).toBe(3)
      }
    })
  })

  describe('Gauge', () => {
    it('should set gauge value', () => {
      metricsCollector.gauge('test_gauge', 'Test gauge', 10, {})
      const metrics = metricsCollector.getAllMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].type).toBe('gauge')
      if (metrics[0].type === 'gauge') {
        expect(metrics[0].value).toBe(10)
      }
    })

    it('should increment gauge', () => {
      metricsCollector.gauge('test_gauge', 'Test gauge', 5, {})
      metricsCollector.gaugeInc('test_gauge', 'Test gauge', {}, 3)
      const metrics = metricsCollector.getMetricsByName('test_gauge')
      expect(metrics).toHaveLength(1)
      if (metrics[0].type === 'gauge') {
        expect(metrics[0].value).toBe(8)
      }
    })

    it('should decrement gauge', () => {
      metricsCollector.gauge('test_gauge', 'Test gauge', 10, {})
      metricsCollector.gaugeDec('test_gauge', 'Test gauge', {}, 3)
      const metrics = metricsCollector.getMetricsByName('test_gauge')
      expect(metrics).toHaveLength(1)
      if (metrics[0].type === 'gauge') {
        expect(metrics[0].value).toBe(7)
      }
    })
  })

  describe('Histogram', () => {
    it('should record histogram observation', () => {
      metricsCollector.histogram('test_histogram', 'Test histogram', 0.5, {})
      const metrics = metricsCollector.getAllMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].type).toBe('histogram')
      if (metrics[0].type === 'histogram') {
        expect(metrics[0].count).toBe(1)
        expect(metrics[0].sum).toBe(0.5)
        expect(metrics[0].observations).toHaveLength(1)
      }
    })

    it('should accumulate histogram observations', () => {
      metricsCollector.histogram('test_histogram', 'Test histogram', 0.5, {})
      metricsCollector.histogram('test_histogram', 'Test histogram', 1.0, {})
      const metrics = metricsCollector.getMetricsByName('test_histogram')
      expect(metrics).toHaveLength(1)
      if (metrics[0].type === 'histogram') {
        expect(metrics[0].count).toBe(2)
        expect(metrics[0].sum).toBe(1.5)
        expect(metrics[0].observations).toHaveLength(2)
      }
    })

    it('should use custom buckets', () => {
      const customBuckets = [0.1, 0.5, 1.0]
      metricsCollector.histogram('test_histogram', 'Test histogram', 0.3, {}, { buckets: customBuckets })
      const metrics = metricsCollector.getMetricsByName('test_histogram')
      expect(metrics).toHaveLength(1)
      if (metrics[0].type === 'histogram') {
        expect(metrics[0].buckets).toEqual(customBuckets)
      }
    })
  })

  describe('Multiple metrics', () => {
    it('should handle multiple different metrics', () => {
      metricsCollector.counter('counter1', 'Counter 1', {}, 1)
      metricsCollector.gauge('gauge1', 'Gauge 1', 10, {})
      metricsCollector.histogram('histogram1', 'Histogram 1', 0.5, {})

      const metrics = metricsCollector.getAllMetrics()
      expect(metrics).toHaveLength(3)
    })

    it('should handle metrics with same name but different labels', () => {
      metricsCollector.counter('test_counter', 'Test counter', { method: 'GET' }, 1)
      metricsCollector.counter('test_counter', 'Test counter', { method: 'POST' }, 1)

      const metrics = metricsCollector.getAllMetrics()
      expect(metrics).toHaveLength(2)
    })
  })
})
