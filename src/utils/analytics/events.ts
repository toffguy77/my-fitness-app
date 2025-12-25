/**
 * Система отслеживания событий для аналитики
 * События отправляются на сервер для записи в Prometheus
 */

export type EventType =
  | 'page_view'
  | 'button_click'
  | 'form_submit'
  | 'onboarding_start'
  | 'onboarding_complete'
  | 'meal_added'
  | 'meal_saved'
  | 'weight_logged'
  | 'report_viewed'
  | 'achievement_unlocked'
  | 'error_occurred'
  | 'feature_used'

export interface AnalyticsEvent {
  type: EventType
  name: string
  properties?: Record<string, any>
  userId?: string
  sessionId?: string
  timestamp?: number
}

let sessionId: string | null = null
let userId: string | null = null

/**
 * Инициализация сессии
 */
export function initSession(userIdParam?: string) {
  sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  userId = userIdParam || null
  
  // Сохраняем sessionId в localStorage для отслеживания между перезагрузками
  if (typeof window !== 'undefined') {
    const storedSessionId = localStorage.getItem('analytics_session_id')
    if (storedSessionId) {
      sessionId = storedSessionId
    } else {
      localStorage.setItem('analytics_session_id', sessionId)
    }
  }
}

/**
 * Установка userId
 */
export function setUserId(newUserId: string | null) {
  userId = newUserId
}

/**
 * Получение sessionId
 */
export function getSessionId(): string | null {
  return sessionId
}

/**
 * Отправка события на сервер
 */
async function sendEventToServer(event: AnalyticsEvent): Promise<void> {
  try {
    const response = await fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...event,
        sessionId: sessionId || getSessionId(),
        userId: userId,
        timestamp: event.timestamp || Date.now(),
      }),
    })

    if (!response.ok) {
      console.warn('Failed to send analytics event:', response.statusText)
    }
  } catch (error) {
    // Не блокируем выполнение при ошибках отправки метрик
    console.warn('Error sending analytics event:', error)
  }
}

/**
 * Трекинг события
 */
export function trackEvent(
  type: EventType,
  name: string,
  properties?: Record<string, any>
): void {
  const event: AnalyticsEvent = {
    type,
    name,
    properties,
    userId: userId || undefined,
    sessionId: sessionId || getSessionId() || undefined,
    timestamp: Date.now(),
  }

  // Record metrics
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { metricsCollector } = require('../metrics/collector')
    const role = properties?.role || 'unknown'
    
    // Track page views
    if (type === 'page_view') {
      metricsCollector.counter(
        'page_views_total',
        'Total number of page views',
        {
          page: name,
          role: String(role),
        }
      )
    }
    
    // Track user actions
    if (type === 'feature_used' || type === 'button_click' || type === 'form_submit') {
      metricsCollector.counter(
        'user_actions_total',
        'Total number of user actions',
        {
          action: name,
          role: String(role),
          feature: properties?.feature || 'unknown',
        }
      )
    }
    
    // Track sessions
    if (type === 'page_view' && name === 'app_loaded') {
      metricsCollector.counter(
        'sessions_total',
        'Total number of sessions',
        {
          role: String(role),
        }
      )
    }
  } catch {
    // Ignore metrics errors
  }

  // Отправляем на сервер
  sendEventToServer(event).catch(() => {
    // Ошибки уже обработаны в sendEventToServer
  })
}

/**
 * Трекинг просмотра страницы
 */
export function trackPageView(pageName: string, properties?: Record<string, any>): void {
  trackEvent('page_view', pageName, properties)
}

/**
 * Трекинг клика по кнопке
 */
export function trackButtonClick(buttonName: string, properties?: Record<string, any>): void {
  trackEvent('button_click', buttonName, properties)
}

/**
 * Трекинг отправки формы
 */
export function trackFormSubmit(formName: string, properties?: Record<string, any>): void {
  trackEvent('form_submit', formName, properties)
}

/**
 * Трекинг ошибки
 */
export function trackError(errorName: string, error: Error | string, properties?: Record<string, any>): void {
  const errorMessage = error instanceof Error ? error.message : error
  trackEvent('error_occurred', errorName, {
    ...properties,
    error: errorMessage,
  })
}

/**
 * Трекинг использования функции
 */
export function trackFeatureUse(featureName: string, properties?: Record<string, any>): void {
  trackEvent('feature_used', featureName, properties)
}

