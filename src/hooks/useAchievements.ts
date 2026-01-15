'use client'

import { useState } from 'react'
import { checkAchievements } from '@/utils/achievements/check'
import type { AchievementWithProgress } from '@/types/achievements'
import { logger } from '@/utils/logger'

/**
 * Хук для управления достижениями и показа уведомлений
 */
export function useAchievements() {
  const [newAchievements, setNewAchievements] = useState<AchievementWithProgress[]>([])

  /**
   * Проверяет достижения и показывает уведомления о новых
   */
  const checkAndShowAchievements = async (
    triggerType: 'streak_days' | 'total_meals' | 'ocr_used' | 'weight_logged' | 'days_active',
    triggerData?: Record<string, unknown>
  ) => {
    try {
      const achievements = await checkAchievements(triggerType, triggerData)

      if (achievements.length > 0) {
        // Загружаем полную информацию о достижениях
        const response = await fetch('/api/achievements')
        if (response.ok) {
          const data = await response.json()
          const fullAchievements = achievements
            .map((a) => data.achievements?.find((fa: AchievementWithProgress) => fa.id === a.achievement_id))
            .filter(Boolean) as AchievementWithProgress[]

          setNewAchievements((prev) => [...prev, ...fullAchievements])
        }
      }
    } catch (error) {
      logger.warn('useAchievements: ошибка проверки достижений', { error })
    }
  }

  const removeAchievement = (achievementId: string) => {
    setNewAchievements((prev) => prev.filter((a) => a.id !== achievementId))
  }

  return {
    newAchievements,
    checkAndShowAchievements,
    removeAchievement,
  }
}
