import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'
import type { AchievementWithProgress } from '@/types/achievements'

/**
 * Получает список достижений пользователя с прогрессом
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Проверка авторизации
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }

    // Получаем все активные достижения
    const { data: achievements, error: achievementsError } = await supabase
      .from('achievements')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('condition_value', { ascending: true })

    if (achievementsError) {
      logger.error('Achievements: ошибка получения достижений', achievementsError)
      return NextResponse.json({ error: 'Ошибка получения достижений' }, { status: 500 })
    }

    // Получаем прогресс пользователя по всем достижениям
    const { data: userAchievements, error: userAchievementsError } = await supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', user.id)

    if (userAchievementsError) {
      logger.error('Achievements: ошибка получения прогресса', userAchievementsError)
      return NextResponse.json({ error: 'Ошибка получения прогресса' }, { status: 500 })
    }

    // Объединяем достижения с прогрессом пользователя
    const achievementsWithProgress: AchievementWithProgress[] = (achievements || []).map((achievement) => {
      const userAchievement = userAchievements?.find((ua) => ua.achievement_id === achievement.id)
      
      return {
        ...achievement,
        isUnlocked: userAchievement?.progress === 100 || false,
        unlockedAt: userAchievement?.unlocked_at || undefined,
        progress: userAchievement?.progress || 0,
      }
    })

    logger.debug('Achievements: список получен', {
      userId: user.id,
      totalAchievements: achievementsWithProgress.length,
      unlockedCount: achievementsWithProgress.filter((a) => a.isUnlocked).length,
    })

    return NextResponse.json({
      achievements: achievementsWithProgress,
    })
  } catch (error) {
    logger.error('Achievements: неожиданная ошибка', error)
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 })
  }
}

