'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { AlertTriangle, X } from 'lucide-react'
import { checkSubscriptionStatus, SubscriptionInfo } from '@/utils/supabase/subscription'
import { logger } from '@/utils/logger'

export default function SubscriptionBanner() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
          setLoading(false)
          return
        }

        // Проверяем роль пользователя - кураторы не должны видеть баннер подписки
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        // Если пользователь - куратор или супер-админ, не показываем баннер
        if (profile?.role === 'curator' || profile?.role === 'super_admin') {
          setLoading(false)
          return
        }

        setUser(user)
        const info = await checkSubscriptionStatus(user.id)
        setSubscriptionInfo(info)
      } catch (error) {
        logger.error('SubscriptionBanner: ошибка загрузки статуса', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSubscriptionStatus()
  }, [supabase])

  // Показываем баннер только если подписка истекла или отменена (но период еще действует)
  const shouldShowBanner = subscriptionInfo && (
    subscriptionInfo.isExpired ||
    (subscriptionInfo.status === 'cancelled' && subscriptionInfo.endDate && new Date(subscriptionInfo.endDate) > new Date())
  ) && !dismissed

  if (loading || !shouldShowBanner) {
    return null
  }

  const isExpired = subscriptionInfo.isExpired
  const endDate = subscriptionInfo.endDate ? new Date(subscriptionInfo.endDate).toLocaleDateString('ru-RU') : null

  return (
    <div className="w-full bg-amber-950/30 border-b-2 border-amber-800/50 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1">
        <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-200">
            {isExpired ? (
              <>Подписка истекла{endDate && ` ${endDate}`}. Доступ к Premium функциям ограничен.</>
            ) : (
              <>Подписка отменена. Доступ действует до {endDate}.</>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push('/app/settings?tab=subscription')}
          className="px-4 py-1.5 bg-white text-zinc-950 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          Продлить
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-amber-400 hover:text-amber-300 transition-colors"
          title="Скрыть"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  )
}

