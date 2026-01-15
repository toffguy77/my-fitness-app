/**
 * Типы для системы достижений
 */

export interface Achievement {
  id: string
  code: string
  name: string
  description: string | null
  category: 'nutrition' | 'weight' | 'activity' | 'accuracy'
  icon_name: string | null
  condition_type: string
  condition_value: number
  is_active: boolean
  created_at: string
}

export interface UserAchievement {
  id: string
  user_id: string
  achievement_id: string
  unlocked_at: string | null
  progress: number
  achievement?: Achievement
}

export interface AchievementWithProgress extends Achievement {
  isUnlocked: boolean
  unlockedAt?: string
  progress: number
}

export type AchievementCategory = 'nutrition' | 'weight' | 'activity' | 'accuracy'

export type AchievementTriggerType =
  | 'streak_days'
  | 'total_meals'
  | 'ocr_used'
  | 'weight_logged'
  | 'days_active'
