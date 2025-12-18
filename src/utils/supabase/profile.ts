import { createClient } from './client'
import { User } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

export type UserRole = 'client' | 'coach' | 'super_admin'

export type SubscriptionStatus = 'free' | 'active' | 'cancelled' | 'past_due' | 'expired'
export type SubscriptionTier = 'basic' | 'premium'

export type UserProfile = {
  id: string
  email?: string | null
  full_name?: string | null
  phone?: string | null
  role: UserRole
  coach_id?: string | null
  avatar_url?: string | null
  subscription_status?: SubscriptionStatus
  subscription_tier?: SubscriptionTier
  subscription_start_date?: string | null
  subscription_end_date?: string | null
  gender?: 'male' | 'female' | 'other' | null
  birth_date?: string | null
  height?: number | null
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null
  created_at?: string
  updated_at?: string
}

export async function getUserProfile(user: User): Promise<UserProfile | null> {
  const supabase = createClient()

  logger.debug('Profile: загрузка профиля пользователя', { userId: user.id })

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    logger.error('Profile: ошибка загрузки профиля', error, { userId: user.id })
    return null
  }

  logger.debug('Profile: профиль успешно загружен', { userId: user.id, role: data?.role })
  return data as UserProfile
}

export async function getCoachClients(coachId: string): Promise<UserProfile[]> {
  const supabase = createClient()

  logger.debug('Profile: загрузка клиентов тренера', { coachId })

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('coach_id', coachId)
    .eq('role', 'client')
    .order('full_name', { ascending: true })

  if (error) {
    logger.error('Profile: ошибка загрузки клиентов', error, { coachId })
    return []
  }

  logger.info('Profile: клиенты успешно загружены', { coachId, count: data?.length || 0 })
  return (data || []) as UserProfile[]
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const supabase = createClient()

  logger.debug('Profile: проверка прав super_admin', { userId })

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !data) {
    logger.warn('Profile: ошибка проверки прав super_admin', { userId, error: error?.message })
    return false
  }

  const isAdmin = data.role === 'super_admin'
  logger.debug('Profile: результат проверки super_admin', { userId, isAdmin })
  return isAdmin
}

export async function isPremium(userId: string): Promise<boolean> {
  const supabase = createClient()

  logger.debug('Profile: проверка Premium статуса', { userId })

  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_tier, subscription_end_date')
    .eq('id', userId)
    .single()

  if (error || !data) {
    logger.warn('Profile: ошибка проверки Premium статуса', { userId, error: error?.message })
    return false
  }

  const isActive = data.subscription_status === 'active'
  const isPremiumTier = data.subscription_tier === 'premium'
  const isNotExpired = !data.subscription_end_date || 
    new Date(data.subscription_end_date) > new Date()
  
  const isPremiumUser = isActive && isPremiumTier && isNotExpired
  logger.debug('Profile: результат проверки Premium', { 
    userId, 
    isPremium: isPremiumUser,
    subscription_status: data.subscription_status,
    subscription_tier: data.subscription_tier,
    subscription_end_date: data.subscription_end_date,
    isNotExpired
  })
  return isPremiumUser
}

export function hasActiveSubscription(profile: UserProfile | null): boolean {
  if (!profile) {
    logger.debug('Profile: проверка подписки - профиль отсутствует')
    return false
  }
  
  const isActive = profile.subscription_status === 'active'
  const isNotExpired = !profile.subscription_end_date || 
    new Date(profile.subscription_end_date) > new Date()
  
  const hasActive = isActive && isNotExpired
  logger.debug('Profile: проверка активной подписки', { 
    userId: profile.id, 
    hasActive,
    subscription_status: profile.subscription_status,
    subscription_end_date: profile.subscription_end_date,
    isNotExpired
  })
  return hasActive
}

