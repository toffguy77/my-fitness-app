/**
 * Утилиты для prefetching данных
 */

import { createClient } from '@/utils/supabase/client'

/**
 * Prefetch данных для страницы dashboard
 */
export async function prefetchDashboardData(userId: string) {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoStr = weekAgo.toISOString().split('T')[0]

  // Prefetch целей питания
  Promise.all([
    supabase
      .from('nutrition_targets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('day_type', 'training')
      .single(),
    supabase
      .from('nutrition_targets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('day_type', 'rest')
      .single(),
  ]).catch(() => {
    // Игнорируем ошибки prefetch
  })

  // Prefetch логов за неделю
  Promise.resolve(
    supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', weekAgoStr)
      .lte('date', today)
      .order('date', { ascending: false })
  ).then(() => {
    // Игнорируем результат prefetch
  }).catch(() => {
    // Игнорируем ошибки prefetch
  })
}

/**
 * Prefetch данных для страницы nutrition
 */
export async function prefetchNutritionData(userId: string, date: string) {
  const supabase = createClient()

  // Prefetch целей
  Promise.all([
    supabase
      .from('nutrition_targets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('day_type', 'training')
      .single(),
    supabase
      .from('nutrition_targets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('day_type', 'rest')
      .single(),
  ]).catch(() => {
    // Игнорируем ошибки prefetch
  })

  // Prefetch лога за дату
  Promise.resolve(
    supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .single()
  ).then(() => {
    // Игнорируем результат prefetch
  }).catch(() => {
    // Игнорируем ошибки prefetch
  })
}

/**
 * Prefetch данных для страницы reports
 */
export async function prefetchReportsData(userId: string) {
  const supabase = createClient()
  const monthAgo = new Date()
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  const monthAgoStr = monthAgo.toISOString().split('T')[0]

  // Prefetch логов за месяц
  Promise.resolve(
    supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', monthAgoStr)
      .order('date', { ascending: false })
      .limit(100)
  ).then(() => {
    // Игнорируем результат prefetch
  }).catch(() => {
    // Игнорируем ошибки prefetch
  })
}
