/**
 * Prometheus metrics endpoint
 * Exports metrics in Prometheus text format
 */

import { NextResponse } from 'next/server'
import { metricsCollector } from '@/utils/metrics/collector'
import { exportToPrometheus } from '@/utils/metrics/prometheus'

export async function GET() {
  try {
    const metrics = metricsCollector.getAllMetrics()
    const prometheusFormat = exportToPrometheus(metrics)

    return new NextResponse(prometheusFormat, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('Error exporting metrics:', error)
    return new NextResponse(
      '# Error exporting metrics\n',
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        },
      }
    )
  }
}

