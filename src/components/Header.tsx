'use client'

import { useRouter } from 'next/navigation'
import { User, Trophy, Settings } from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { User as SupabaseUser } from '@supabase/supabase-js'
import { getUserProfile, type UserProfile } from '@/utils/supabase/profile'
import Logo from '@/components/Logo'

export default function Header() {
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createClient()
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError) {
          console.error('Header: ошибка получения пользователя', userError)
          return
        }

        if (user) {
          setUser(user)
          // getUserProfile обрабатывает ошибки внутри и возвращает null при ошибке
          // Ошибки логируются внутри функции через logger
          const userProfile = await getUserProfile(user)
          if (userProfile) {
            setProfile(userProfile)
          }
        }
      } catch (error) {
        console.error('Header: исключение при загрузке пользователя', error)
      } finally {
        setLoading(false)
      }
    }
    fetchUser()
  }, [])

  const handleProfileClick = () => {
    if (user) {
      router.push(`/profile/${user.id}`)
    } else {
      router.push('/app/settings')
    }
  }

  const isCurator = useMemo(() => profile?.role === 'curator', [profile?.role])
  const dashboardPath = useMemo(() =>
    isCurator ? '/app/curator' : '/app/dashboard',
    [isCurator]
  )

  const handleLogoClick = () => {
    // Вычисляем путь динамически при клике, чтобы учесть актуальное состояние профиля
    const currentIsCurator = profile?.role === 'curator'
    const path = currentIsCurator ? '/app/curator' : '/app/dashboard'
    router.push(path)
  }

  return (
    <header className="fixed top-0 left-0 right-0 lg:left-64 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Логотип/Название */}
          <Logo
            width={200}
            height={60}
            className="flex items-center gap-2"
            onClick={handleLogoClick}
          />

          {/* Правые элементы */}
          <div className="flex items-center gap-3">
            {/* Кнопка лидерборда - только для клиентов */}
            {!isCurator && (
              <button
                onClick={() => router.push('/leaderboard')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Лидерборд"
              >
                <Trophy size={20} className="text-gray-700" />
                <span className="hidden sm:inline text-sm font-medium text-gray-700">Лидерборд</span>
              </button>
            )}

            {/* Кнопка настроек */}
            <button
              onClick={() => router.push('/app/settings')}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
              title="Настройки"
            >
              <Settings size={20} className="text-gray-600" />
            </button>

            {/* Иконка пользователя */}
            {!loading && (
              <button
                onClick={handleProfileClick}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
                title={profile?.full_name || 'Профиль'}
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name || 'Пользователь'}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <User size={20} className="text-gray-600" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
