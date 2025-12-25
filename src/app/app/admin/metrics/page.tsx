'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { BarChart3, ArrowLeft } from 'lucide-react'
import MetricsDashboard from '@/components/metrics/MetricsDashboard'
import SkeletonLoader from '@/components/SkeletonLoader'
import { logger } from '@/utils/logger'

export default function MetricsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        if (userError || !user) {
          logger.warn('Metrics: пользователь не авторизован')
          router.push('/login')
          return
        }

        setUser(user)

        // Проверяем права доступа
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        // Разрешаем доступ super_admin и coordinator (для демонстрации)
        if (profile && (profile.role === 'super_admin' || profile.role === 'coordinator')) {
          setHasAccess(true)
        } else {
          logger.warn('Metrics: доступ запрещен', { userId: user.id, role: profile?.role })
          router.push('/app/dashboard')
        }
      } catch (error) {
        logger.error('Metrics: ошибка проверки доступа', error)
        router.push('/app/dashboard')
      } finally {
        setLoading(false)
      }
    }

    checkAccess()
  }, [supabase, router])

  if (loading) {
    return (
      <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 lg:max-w-6xl lg:mx-auto font-sans">
        <SkeletonLoader variant="card" count={2} />
      </main>
    )
  }

  if (!hasAccess || !user) {
    return null
  }

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 lg:max-w-6xl lg:mx-auto font-sans">
      <header className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.push('/app/dashboard')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Назад"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            <BarChart3 size={24} className="text-gray-900" />
            <h1 className="text-2xl font-bold text-gray-900">Метрики и аналитика</h1>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          Просмотр ключевых метрик приложения: TTFV, DAU, Completion Rate, Feature Adoption и другие
        </p>
      </header>

      <MetricsDashboard />
    </main>
  )
}

