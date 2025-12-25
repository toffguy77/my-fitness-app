// Утилиты для работы с подписками
import { createClient } from './client'
import { logger } from '@/utils/logger'

export type SubscriptionStatus = 'free' | 'active' | 'cancelled' | 'past_due' | 'expired'

export interface SubscriptionInfo {
  status: SubscriptionStatus
  tier: 'basic' | 'premium'
  startDate: string | null
  endDate: string | null
  isExpired: boolean
  isActive: boolean
}

/**
 * Проверяет и обновляет статус подписки пользователя
 * Если subscription_end_date < now, обновляет статус на 'expired'
 */
export async function checkSubscriptionStatus(userId: string): Promise<SubscriptionInfo> {
  const supabase = createClient()

  logger.debug('Subscription: проверка статуса подписки', { userId })

  // Получаем текущий статус подписки
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_tier, subscription_start_date, subscription_end_date')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    logger.error('Subscription: ошибка загрузки профиля', error, { userId })
    return {
      status: 'free',
      tier: 'basic',
      startDate: null,
      endDate: null,
      isExpired: true,
      isActive: false
    }
  }

  const status = (profile.subscription_status || 'free') as SubscriptionStatus
  const tier = (profile.subscription_tier || 'basic') as 'basic' | 'premium'
  const endDate = profile.subscription_end_date

  // Проверяем, истекла ли подписка
  let isExpired = false
  let actualStatus = status

  if (endDate && new Date(endDate) < new Date()) {
    isExpired = true
    // Если статус еще не expired, обновляем его
    if (status !== 'expired') {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ subscription_status: 'expired' })
        .eq('id', userId)

      if (!updateError) {
        actualStatus = 'expired'
        logger.info('Subscription: статус обновлен на expired', { userId, endDate })
      } else {
        logger.error('Subscription: ошибка обновления статуса', updateError, { userId })
      }
    }
  }

  const isActive = actualStatus === 'active' && tier === 'premium' && !isExpired

  logger.debug('Subscription: результат проверки', {
    userId,
    status: actualStatus,
    tier,
    isExpired,
    isActive,
    endDate
  })

  // Record subscription metrics
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { metricsCollector } = require('../metrics/collector')
    metricsCollector.counter(
      'subscriptions_total',
      'Total number of subscriptions',
      {
        status: actualStatus,
        tier,
      }
    )
    
    if (isActive) {
      metricsCollector.gaugeInc(
        'subscriptions_active_gauge',
        'Number of active subscriptions',
        { tier }
      )
    }
  } catch {
    // Ignore metrics errors
  }

  return {
    status: actualStatus,
    tier,
    startDate: profile.subscription_start_date || null,
    endDate: endDate || null,
    isExpired,
    isActive
  }
}

/**
 * Проверяет, является ли пользователь Premium (активная подписка, не истекшая)
 */
export async function isPremiumUser(userId: string): Promise<boolean> {
  const subscriptionInfo = await checkSubscriptionStatus(userId)
  return subscriptionInfo.isActive
}

