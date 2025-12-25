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
    const ttfvSeconds = ttfv / 1000
    trackEvent('feature_used', 'first_value', {
      action,
      ttfv_ms: ttfv,
      ttfv_seconds: Math.round(ttfvSeconds),
    })
    
    // Record TTFV metric
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { metricsCollector } = require('../metrics/collector')
      metricsCollector.histogram(
        'ttfv_seconds',
        'Time to First Value in seconds',
        ttfvSeconds,
        { action }
      )
    } catch {
      // Ignore metrics errors
    }
    
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
  
  // Record DAU metric
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { metricsCollector } = require('../metrics/collector')
    metricsCollector.gaugeInc(
      'users_dau_gauge',
      'Daily active users gauge',
      { date: today }
    )
    metricsCollector.counter(
      'users_active_total',
      'Total number of active users',
      {}
    )
  } catch {
    // Ignore metrics errors
  }
}

/**
 * Отслеживание Completion Rate онбординга
 */
export function trackOnboardingStart() {
  onboardingStartTime = Date.now()
  trackEvent('onboarding_start', 'onboarding_started', {
    timestamp: onboardingStartTime,
  })
  
  // Record onboarding start metric
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { metricsCollector } = require('../metrics/collector')
    metricsCollector.counter(
      'onboarding_started_total',
      'Total number of onboarding starts',
      {}
    )
  } catch {
    // Ignore metrics errors
  }
}

export function trackOnboardingComplete(step: number, totalSteps: number) {
  if (onboardingStartTime) {
    const duration = Date.now() - onboardingStartTime
    const durationSeconds = duration / 1000
    trackEvent('onboarding_complete', 'onboarding_completed', {
      step,
      totalSteps,
      duration_ms: duration,
      duration_seconds: Math.round(durationSeconds),
      completion_rate: (step / totalSteps) * 100,
    })
    
    // Record onboarding metrics
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { metricsCollector } = require('../metrics/collector')
      metricsCollector.counter(
        'onboarding_completed_total',
        'Total number of completed onboardings',
        {}
      )
      metricsCollector.histogram(
        'onboarding_duration_seconds',
        'Onboarding duration in seconds',
        durationSeconds,
        {}
      )
    } catch {
      // Ignore metrics errors
    }
    
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
  
  // Record feature usage metric
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { metricsCollector } = require('../metrics/collector')
    const userType = properties?.user_type || properties?.isPremium ? 'premium' : 'free'
    metricsCollector.counter(
      'feature_usage_total',
      'Total number of feature uses',
      {
        feature: featureName,
        user_type: String(userType),
      }
    )
  } catch {
    // Ignore metrics errors
  }
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
    const durationSeconds = duration / 1000
    trackEvent('page_view', 'session_end', {
      duration_ms: duration,
      duration_seconds: Math.round(durationSeconds),
      duration_minutes: Math.round(duration / 60000),
    })
    
    // Record session duration metric
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { metricsCollector } = require('../metrics/collector')
      metricsCollector.histogram(
        'session_duration_seconds',
        'Session duration in seconds',
        durationSeconds,
        {}
      )
    } catch {
      // Ignore metrics errors
    }
    
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

