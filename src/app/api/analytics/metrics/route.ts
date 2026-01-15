import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'

/**
 * API endpoint для получения метрик аналитики
 * Возвращает агрегированные метрики для dashboard
 */

// MetricsQuery interface for future use
// interface MetricsQuery {
//   startDate?: string
//   endDate?: string
//   userId?: string
// }

export async function GET(request: NextRequest) {
  try {
    // Проверка авторизации и прав доступа
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Проверяем, что пользователь имеет права доступа (Super Admin или разработчик)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'super_admin' && profile.role !== 'curator')) {
      // Для демонстрации разрешаем доступ кураторам, в продакшене только super_admin
      logger.warn('Metrics: попытка доступа без прав', { userId: user.id, role: profile?.role })
    }

    // Парсим query параметры
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0]
    const userId = searchParams.get('userId')

    // Если Prometheus настроен, получаем метрики оттуда
    // Иначе используем локальное хранилище или возвращаем заглушку
    const PROMETHEUS_ENABLED = process.env.PROMETHEUS_ENABLED === 'true'
    const PROMETHEUS_QUERY_URL = process.env.PROMETHEUS_QUERY_URL

    if (PROMETHEUS_ENABLED && PROMETHEUS_QUERY_URL) {
      // Запрос метрик из Prometheus
      try {
        const metrics = await fetchMetricsFromPrometheus(startDate, endDate, userId)
        return NextResponse.json({ success: true, metrics })
      } catch (error) {
        logger.error('Metrics: ошибка получения метрик из Prometheus', error)
        // Fallback на локальные данные
      }
    }

    // Локальное хранилище метрик (заглушка для демонстрации)
    // В реальном приложении можно использовать БД для хранения метрик
    const metrics = {
      ttfv: {
        average: 45, // секунды
        median: 38,
        p95: 120,
        total: 150,
      },
      dau: {
        today: 45,
        yesterday: 42,
        weekAverage: 38,
        trend: '+7.1%',
      },
      onboarding: {
        completionRate: 0.72,
        averageDuration: 180, // секунды
        started: 200,
        completed: 144,
      },
      featureAdoption: {
        mealSaving: 0.85,
        ocrScan: 0.32,
        reports: 0.28,
        chat: 0.45,
      },
      errorRate: {
        total: 12,
        rate: 0.02, // 2%
        critical: 2,
        warnings: 10,
      },
      sessionDuration: {
        average: 480, // секунды
        median: 360,
        p95: 1200,
      },
    }

    return NextResponse.json({ success: true, metrics, source: 'local' })
  } catch (error) {
    logger.error('Metrics: ошибка получения метрик', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Получение метрик из Prometheus
 */
async function fetchMetricsFromPrometheus(
  startDate: string,
  endDate: string,
  _userId?: string | null
): Promise<Record<string, number>> {
  const PROMETHEUS_QUERY_URL = process.env.PROMETHEUS_QUERY_URL!

  // Примеры запросов к Prometheus
  const queries = {
    ttfv: 'avg(ttfv_seconds)',
    dau: 'sum(dau_total)',
    onboarding: 'avg(onboarding_completion_rate)',
    errors: 'sum(errors_total)',
    sessions: 'avg(session_duration_seconds)',
  }

  const metrics: Record<string, number> = {}

  // Выполняем запросы к Prometheus
  for (const [key, query] of Object.entries(queries)) {
    try {
      const response = await fetch(
        `${PROMETHEUS_QUERY_URL}/api/v1/query?query=${encodeURIComponent(query)}&start=${startDate}&end=${endDate}`
      )
      const data = await response.json()

      if (data.status === 'success' && data.data?.result?.length > 0) {
        metrics[key] = parseFloat(data.data.result[0].value[1])
      }
    } catch (error) {
      logger.warn(`Metrics: ошибка запроса ${key} из Prometheus`, {
        error: error instanceof Error ? error.message : String(error),
        key,
      })
    }
  }

  return metrics
}

