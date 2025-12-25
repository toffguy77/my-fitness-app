/**
 * Tests for /metrics endpoint
 */

// Mock NextResponse
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return {
    ...actual,
    NextResponse: class NextResponse {
      body: BodyInit | null
      init: ResponseInit | undefined
      status: number
      headers: Headers
      
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        this.body = body || null
        this.init = init
        this.status = init?.status || 200
        this.headers = new Headers(init?.headers)
      }
      
      text() {
        return Promise.resolve(this.body ? String(this.body) : '')
      }
    },
  }
})

import { GET } from '../route'
import { metricsCollector } from '@/utils/metrics/collector'

describe('/metrics endpoint', () => {
  beforeEach(() => {
    metricsCollector.clear()
  })

  it('should return metrics in Prometheus format', async () => {
    // Add some test metrics
    metricsCollector.counter('test_counter', 'Test counter', {}, 1)
    metricsCollector.gauge('test_gauge', 'Test gauge', 10, {})

    const response = await GET()
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/plain')
    expect(text).toContain('# HELP test_counter Test counter')
    expect(text).toContain('# TYPE test_counter counter')
    expect(text).toContain('test_counter 1')
    expect(text).toContain('test_gauge 10')
  })

  it('should handle empty metrics', async () => {
    const response = await GET()
    const text = await response.text()

    expect(response.status).toBe(200)
    // Should return empty or just headers
    expect(text).toBeDefined()
  })

  it('should handle errors gracefully', async () => {
    // Mock metricsCollector to throw error
    const originalGetAllMetrics = metricsCollector.getAllMetrics
    metricsCollector.getAllMetrics = jest.fn(() => {
      throw new Error('Test error')
    })

    const response = await GET()
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(text).toContain('Error exporting metrics')

    // Restore original
    metricsCollector.getAllMetrics = originalGetAllMetrics
  })
})

