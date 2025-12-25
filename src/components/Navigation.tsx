'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Home, UtensilsCrossed, TrendingUp, Settings, Trophy, Users, UserPlus, BarChart3 } from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getUserProfile, type UserProfile } from '@/utils/supabase/profile'

const clientNavigationItems = [
  { path: '/app/dashboard', icon: Home, label: 'Дашборд', id: 'nav-item-dashboard' },
  { path: '/app/nutrition', icon: UtensilsCrossed, label: 'Питание', id: 'nav-item-nutrition' },
  { path: '/app/reports', icon: TrendingUp, label: 'Отчеты', id: 'nav-item-reports' },
  { path: '/app/achievements', icon: Trophy, label: 'Достижения', id: 'nav-item-achievements' },
  { path: '/app/settings', icon: Settings, label: 'Настройки', id: 'nav-item-settings' },
]

const coordinatorNavigationItems = [
  { path: '/app/coordinator', icon: Users, label: 'Клиенты', id: 'nav-item-coordinator-clients' },
  { path: '/app/coordinator/invites', icon: UserPlus, label: 'Инвайт-коды', id: 'nav-item-invites' },
  { path: '/app/admin/metrics', icon: BarChart3, label: 'Метрики', id: 'nav-item-metrics' },
  { path: '/app/settings', icon: Settings, label: 'Настройки', id: 'nav-item-settings' },
]

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [isDesktop, setIsDesktop] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

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
      setLoading(false)
    }
    fetchProfile()
  }, [])

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])

  const isCoordinator = profile?.role === 'coordinator'
  const navigationItems = useMemo(
    () => isCoordinator ? coordinatorNavigationItems : clientNavigationItems,
    [isCoordinator]
  )

  // Prefetch navigation routes on hover/focus for better perceived performance
  useEffect(() => {
    navigationItems.forEach((item) => {
      if (item.path !== pathname) {
        router.prefetch(item.path)
      }
    })
  }, [pathname, router, navigationItems])

  // Desktop: Sidebar
  if (isDesktop) {
    return (
      <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 z-40 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Fitness App</h2>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {!loading && navigationItems.map((item) => {
            const Icon = item.icon
            // Для координатора: /app/coordinator/[clientId] должен подсвечивать "Клиенты"
            // Для координатора: /app/admin/metrics должен подсвечивать "Метрики"
            let isActive = pathname === item.path || pathname?.startsWith(item.path + '/')
            if (isCoordinator) {
              if (item.path === '/app/coordinator' && pathname?.startsWith('/app/coordinator/')) {
                isActive = true
              }
            }
            return (
              <button
                key={item.path}
                id={item.id}
                onClick={() => router.push(item.path)}
                onMouseEnter={() => router.prefetch(item.path)}
                onFocus={() => router.prefetch(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>
    )
  }

  // Mobile: Bottom Navigation
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {!loading && navigationItems.map((item) => {
          const Icon = item.icon
          let isActive = pathname === item.path || pathname?.startsWith(item.path + '/')
          if (isCoordinator) {
            if (item.path === '/app/coordinator' && pathname?.startsWith('/app/coordinator/')) {
              isActive = true
            }
          }
          return (
            <button
              key={item.path}
              id={item.id}
              onClick={() => router.push(item.path)}
              onTouchStart={() => router.prefetch(item.path)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
                isActive ? 'text-black' : 'text-gray-500'
              }`}
            >
              <Icon size={22} />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

