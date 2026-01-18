'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import ChatWidget from './ChatWidget'
import { getUserProfile, hasActiveSubscription, type UserProfile } from '@/utils/supabase/profile'
import { checkSubscriptionStatus } from '@/utils/supabase/subscription'
import { logger } from '@/utils/logger'
import { useAbortController } from '@/hooks/useAbortController'

/**
 * Глобальный виджет чата, который показывается на всех страницах приложения
 * для Premium клиентов с назначенным куратором
 */
export default function GlobalChatWidget() {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading] = useState(true)
  const { signal } = useAbortController()

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data: { user: authUser }, error: userError } = await supabase.auth.getUser()

        if (userError || !authUser) {
          setLoading(false)
          return
        }

        setUser(authUser)

        // Загружаем профиль
        const userProfile = await getUserProfile(authUser)
        if (userProfile) {
          setProfile(userProfile)
        }

        // Проверяем подписку
        const subscriptionStatus = await checkSubscriptionStatus(authUser.id)
        const premium = hasActiveSubscription(userProfile)
        setIsPremium(premium)

        logger.debug('GlobalChatWidget: данные пользователя загружены', {
          userId: authUser.id,
          hasCurator: !!userProfile?.curator_id,
          isPremium: premium,
        })
      } catch (error) {
        logger.error('GlobalChatWidget: ошибка загрузки данных', error, {})
      } finally {
        setLoading(false)
      }
    }

    loadUserData()
  }, [supabase])

  // Показываем виджет только для Premium клиентов с назначенным куратором
  if (loading || !isPremium || !profile?.curator_id || !user) {
    return null
  }

  return <ChatWidget userId={user.id} curatorId={profile.curator_id || null} />
}
