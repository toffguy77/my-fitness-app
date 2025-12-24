/**
 * Расчет метрик для аналитики
 * Метрики отправляются в Prometheus через API
 */

import { trackEvent, initSession, setUserId, getSessionId } from './events'

let sessionStartTime: number | null = null
let firstValueTime: number | null = null
let onboardingStartTime: number | null = null

/**
 * Инициализация метрик при загрузке приложения
 */
export function initMetrics(userId?: string) {
  initSession(userId)
  sessionStartTime = Date.now()
  
  // Отслеживаем начало сессии
  trackEvent('page_view', 'app_loaded', {
    timestamp: sessionStartTime,
  })
}

/**
 * Установка userId для метрик
 */
export function setMetricsUserId(newUserId: string | null) {
  setUserId(newUserId)
}

/**
 * Отслеживание Time to First Value (TTFV)
 * Время от регистрации до первого сохранения данных
 */
export function trackTTFVStart() {
  if (!firstValueTime) {
    firstValueTime = Date.now()
  }
}

export function trackTTFVComplete(action: string) {
  if (firstValueTime) {
    const ttfv = Date.now() - firstValueTime
    trackEvent('feature_used', 'first_value', {
      action,
      ttfv_ms: ttfv,
      ttfv_seconds: Math.round(ttfv / 1000),
    })
    firstValueTime = null
  }
}

/**
 * Отслеживание Daily Active Users (DAU)
 */
export function trackDAU() {
  const today = new Date().toISOString().split('T')[0]
  trackEvent('feature_used', 'daily_active_user', {
    date: today,
  })
}

/**
 * Отслеживание Completion Rate онбординга
 */
export function trackOnboardingStart() {
  onboardingStartTime = Date.now()
  trackEvent('onboarding_start', 'onboarding_started', {
    timestamp: onboardingStartTime,
  })
}

export function trackOnboardingComplete(step: number, totalSteps: number) {
  if (onboardingStartTime) {
    const duration = Date.now() - onboardingStartTime
    trackEvent('onboarding_complete', 'onboarding_completed', {
      step,
      totalSteps,
      duration_ms: duration,
      duration_seconds: Math.round(duration / 1000),
      completion_rate: (step / totalSteps) * 100,
    })
    onboardingStartTime = null
  }
}

/**
 * Отслеживание Feature Adoption
 */
export function trackFeatureAdoption(featureName: string, properties?: Record<string, any>) {
  trackEvent('feature_used', featureName, {
    ...properties,
    feature_adoption: true,
  })
}

/**
 * Отслеживание Error Rate
 */
export function trackErrorRate(errorName: string, error: Error | string, context?: Record<string, any>) {
  trackEvent('error_occurred', errorName, {
    ...context,
    error: error instanceof Error ? error.message : error,
    error_type: error instanceof Error ? error.constructor.name : 'string',
  })
}

/**
 * Отслеживание просмотра страницы
 */
export function trackPageView(pageName: string, properties?: Record<string, any>) {
  trackEvent('page_view', pageName, {
    ...properties,
    timestamp: Date.now(),
  })
}

/**
 * Отслеживание Session Duration
 */
export function trackSessionEnd() {
  if (sessionStartTime) {
    const duration = Date.now() - sessionStartTime
    trackEvent('page_view', 'session_end', {
      duration_ms: duration,
      duration_seconds: Math.round(duration / 1000),
      duration_minutes: Math.round(duration / 60000),
    })
    sessionStartTime = null
  }
}

/**
 * Отслеживание при размонтировании компонента или закрытии страницы
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    trackSessionEnd()
  })
  
  // Также отслеживаем при скрытии страницы
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      trackSessionEnd()
    }
  })
}

