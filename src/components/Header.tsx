'use client'

import { useRouter } from 'next/navigation'
import { Trophy, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getUserProfile, type UserProfile } from '@/utils/supabase/profile'

export default function Header() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const userProfile = await getUserProfile(user)
        if (userProfile) {
          setProfile(userProfile)
        }
      }
    }
    fetchProfile()
  }, [])

  const isCoordinator = profile?.role === 'coordinator'
  const dashboardPath = isCoordinator ? '/app/coordinator' : '/app/dashboard'

  return (
    <header className="fixed top-0 left-0 right-0 lg:left-64 z-50 bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Логотип/Название */}
          <button
            onClick={() => router.push(dashboardPath)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <h1 className="text-xl font-bold text-zinc-100">Fitness App</h1>
          </button>

          {/* Правые элементы */}
          <div className="flex items-center gap-3">
            {/* Кнопка лидерборда - только для клиентов */}
            {!isCoordinator && (
              <button
                onClick={() => router.push('/leaderboard')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-900 transition-colors"
                title="Лидерборд"
              >
                <Trophy size={20} className="text-zinc-400" />
                <span className="hidden sm:inline text-sm font-medium text-zinc-400">Лидерборд</span>
              </button>
            )}

            {/* Кнопка настроек */}
            <button
              onClick={() => router.push('/app/settings')}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-900 hover:bg-zinc-800 transition-colors"
              title="Настройки"
            >
              <Settings size={20} className="text-zinc-400" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

