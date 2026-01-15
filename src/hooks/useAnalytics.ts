'use client'

import { useEffect } from 'react'
import { initMetrics, setMetricsUserId, trackPageView, trackDAU } from '@/utils/analytics/metrics'
import { trackEvent, trackFeatureUse, trackError } from '@/utils/analytics/events'

/**
 * Хук для инициализации аналитики
 */
export function useAnalytics(userId?: string) {
  useEffect(() => {
    initMetrics(userId)
    if (userId) {
      setMetricsUserId(userId)
    }

    // Отслеживаем DAU при загрузке
    trackDAU()
  }, [userId])
}

/**
 * Хук для отслеживания просмотра страницы
 */
export function usePageView(pageName: string, properties?: Record<string, any>) {
  useEffect(() => {
    trackPageView(pageName, properties)
  }, [pageName, properties])
}

/**
 * Хук для отслеживания использования функции
 */
export function useFeatureTracking(featureName: string, enabled: boolean = true) {
  const track = (properties?: Record<string, any>) => {
    if (enabled) {
      trackFeatureUse(featureName, properties)
    }
  }

  return { track }
}

/**
 * Хук для отслеживания ошибок
 */
export function useErrorTracking() {
  const track = (errorName: string, error: Error | string, properties?: Record<string, any>) => {
    trackError(errorName, error, properties)
  }

  return { track }
}

/**
 * Хук для отслеживания событий
 */
export function useEventTracking() {
  return {
    trackEvent,
    trackFeatureUse,
    trackError,
  }
}
