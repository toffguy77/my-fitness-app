import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'

/**
 * API endpoint для отправки событий аналитики в Prometheus
 * 
 * События отправляются в Prometheus через pushgateway или напрямую
 * в зависимости от конфигурации
 */

const PROMETHEUS_PUSHGATEWAY_URL = process.env.PROMETHEUS_PUSHGATEWAY_URL
const PROMETHEUS_ENABLED = process.env.PROMETHEUS_ENABLED === 'true'

interface AnalyticsEvent {
  type: string
  name: string
  properties?: Record<string, any>
  userId?: string
  sessionId?: string
  timestamp?: number
}

/**
 * Отправка метрики в Prometheus через pushgateway
 */
async function pushToPrometheus(
  metricName: string,
  value: number,
  labels: Record<string, string> = {}
): Promise<void> {
  if (!PROMETHEUS_ENABLED || !PROMETHEUS_PUSHGATEWAY_URL) {
    // Если Prometheus не настроен, просто логируем
    logger.debug('Prometheus metrics disabled or not configured', {
      metricName,
      value,
      labels,
    })
    return
  }

  try {
    // Формируем метрику в формате Prometheus
    const labelString = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',')
    
    const metric = `${metricName}{${labelString}} ${value}\n`

    // Отправляем в pushgateway
    const response = await fetch(`${PROMETHEUS_PUSHGATEWAY_URL}/metrics/job/analytics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: metric,
    })

    if (!response.ok) {
      logger.warn('Failed to push metric to Prometheus', {
        status: response.status,
        statusText: response.statusText,
        metricName,
      })
    }
  } catch (error) {
    logger.error('Error pushing metric to Prometheus', error, {
      metricName,
      labels,
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const event: AnalyticsEvent = await request.json()

    // Валидация события
    if (!event.type || !event.name) {
      return NextResponse.json(
        { error: 'Invalid event: type and name are required' },
        { status: 400 }
      )
    }

    // Логируем событие
    logger.debug('Analytics event received', {
      type: event.type,
      name: event.name,
      userId: event.userId,
      sessionId: event.sessionId,
    })

    // Отправляем метрики в Prometheus в зависимости от типа события
    const labels: Record<string, string> = {
      event_type: event.type,
      event_name: event.name,
      ...(event.userId && { user_id: event.userId }),
      ...(event.sessionId && { session_id: event.sessionId }),
    }

    // Счетчик событий
    await pushToPrometheus('analytics_events_total', 1, labels)

    // Специфичные метрики для разных типов событий
    switch (event.type) {
      case 'onboarding_complete':
        if (event.properties?.duration_seconds) {
          await pushToPrometheus('onboarding_duration_seconds', event.properties.duration_seconds, labels)
        }
        if (event.properties?.completion_rate) {
          await pushToPrometheus('onboarding_completion_rate', event.properties.completion_rate, labels)
        }
        break

      case 'feature_used':
        if (event.name === 'first_value' && event.properties?.ttfv_seconds) {
          await pushToPrometheus('ttfv_seconds', event.properties.ttfv_seconds, labels)
        }
        if (event.name === 'daily_active_user') {
          await pushToPrometheus('dau_total', 1, labels)
        }
        break

      case 'page_view':
        if (event.name === 'session_end' && event.properties?.duration_seconds) {
          await pushToPrometheus('session_duration_seconds', event.properties.duration_seconds, labels)
        }
        break

      case 'error_occurred':
        await pushToPrometheus('errors_total', 1, {
          ...labels,
          error_name: event.name,
        })
        break
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error processing analytics event', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

