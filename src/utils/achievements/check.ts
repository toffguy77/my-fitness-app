/**
 * Утилиты для проверки достижений
 */

import { createClient } from '@/utils/supabase/client'
import type { AchievementTriggerType } from '@/types/achievements'
import { logger } from '@/utils/logger'

/**
 * Проверяет достижения пользователя на основе триггера
 * Возвращает список новых достижений, которые были только что получены
 */
export async function checkAchievements(
  triggerType: AchievementTriggerType,
  triggerData?: Record<string, unknown>
): Promise<Array<{ achievement_id: string; achievement_code: string; achievement_name: string }>> {
  try {
    const response = await fetch('/api/achievements/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        triggerType,
        triggerData,
      }),
    })

    const data = await response.json()

    // Если ответ не успешен, но это не критично - просто возвращаем пустой массив
    if (!response.ok) {
      logger.warn('Achievements check: ошибка ответа от API', {
        status: response.status,
        error: data.error,
        triggerType,
      })
      return []
    }

    return data.newAchievements || []
  } catch (error) {
    logger.error('Achievements check: ошибка проверки достижений', error, {
      triggerType,
    })
    return []
  }
}

/**
 * Проверяет достижения после сохранения данных о питании
 */
export async function checkAchievementsAfterMealSave(userId: string): Promise<void> {
  try {
    // Проверяем достижения для streak_days и total_meals
    await Promise.all([
      checkAchievements('streak_days'),
      checkAchievements('total_meals'),
      checkAchievements('days_active'),
    ])
  } catch (error) {
    logger.warn('Achievements: ошибка проверки после сохранения приема пищи', { error })
  }
}

/**
 * Проверяет достижения после использования OCR
 */
export async function checkAchievementsAfterOCR(): Promise<void> {
  try {
    await checkAchievements('ocr_used')
  } catch (error) {
    logger.warn('Achievements: ошибка проверки после OCR', { error })
  }
}

/**
 * Проверяет достижения после записи веса
 */
export async function checkAchievementsAfterWeightLog(): Promise<void> {
  try {
    await checkAchievements('weight_logged')
    await checkAchievements('days_active')
  } catch (error) {
    logger.warn('Achievements: ошибка проверки после записи веса', { error })
  }
}
