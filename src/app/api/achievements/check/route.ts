import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'
import type { AchievementTriggerType } from '@/types/achievements'

/**
 * Проверяет и присваивает достижения пользователю
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { triggerType, triggerData }: { triggerType: AchievementTriggerType; triggerData?: Record<string, unknown> } = body

    if (!triggerType) {
      return NextResponse.json({ error: 'triggerType обязателен' }, { status: 400 })
    }

    // Вызываем функцию БД для проверки достижений
    const { data: newAchievements, error } = await supabase.rpc('check_achievements', {
      user_id_param: user.id,
      trigger_type_param: triggerType,
      trigger_data_param: triggerData || {},
    })

    if (error) {
      // Преобразуем ошибку Supabase в Error для корректного логирования
      const errorMessage = error.message || JSON.stringify(error)
      const dbError = new Error(`Database error: ${errorMessage}`)
      logger.error('Achievements check: ошибка проверки достижений', dbError, {
        userId: user.id,
        triggerType,
        errorDetails: error,
      })
      // Не возвращаем ошибку клиенту, чтобы не блокировать основной процесс
      // Достижения - это дополнительная функция, её ошибка не должна влиять на сохранение данных
      return NextResponse.json({ 
        success: false,
        error: 'Ошибка проверки достижений',
        newAchievements: []
      }, { status: 200 }) // Возвращаем 200, чтобы не ломать основной flow
    }

    logger.debug('Achievements check: проверка завершена', {
      userId: user.id,
      triggerType,
      newAchievementsCount: newAchievements?.length || 0,
    })

    return NextResponse.json({
      success: true,
      newAchievements: newAchievements || [],
    })
  } catch (error) {
    // Преобразуем любую ошибку в Error для корректного логирования
    const errorObj = error instanceof Error ? error : new Error(String(error))
    logger.error('Achievements check: неожиданная ошибка', errorObj, {
      errorDetails: error
    })
    // Возвращаем успешный ответ, чтобы не блокировать основной процесс
    return NextResponse.json({ 
      success: false,
      error: 'Внутренняя ошибка сервера',
      newAchievements: []
    }, { status: 200 })
  }
}

