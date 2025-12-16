import { createClient } from './client'
import { User } from '@supabase/supabase-js'

export type UserRole = 'client' | 'coach' | 'super_admin'

export type SubscriptionStatus = 'free' | 'active' | 'cancelled' | 'past_due'
export type SubscriptionTier = 'basic' | 'premium'

export type UserProfile = {
  id: string
  email?: string | null
  full_name?: string | null
  role: UserRole
  coach_id?: string | null
  avatar_url?: string | null
  subscription_status?: SubscriptionStatus
  subscription_tier?: SubscriptionTier
  subscription_start_date?: string | null
  subscription_end_date?: string | null
  created_at?: string
  updated_at?: string
}

export async function getUserProfile(user: User): Promise<UserProfile | null> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Ошибка загрузки профиля:', error)
    return null
  }

  return data as UserProfile
}

export async function getCoachClients(coachId: string): Promise<UserProfile[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('coach_id', coachId)
    .eq('role', 'client')
    .order('full_name', { ascending: true })

  if (error) {
    console.error('Ошибка загрузки клиентов:', error)
    return []
  }

  return (data || []) as UserProfile[]
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !data) {
    return false
  }

  return data.role === 'super_admin'
}

export async function isPremium(userId: string): Promise<boolean> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_tier')
    .eq('id', userId)
    .single()

  if (error || !data) {
    return false
  }

  return data.subscription_status === 'active' && data.subscription_tier === 'premium'
}

export function hasActiveSubscription(profile: UserProfile | null): boolean {
  if (!profile) return false
  return profile.subscription_status === 'active'
}

