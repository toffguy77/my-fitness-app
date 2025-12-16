'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { LogOut, User as UserIcon, AlertCircle, CheckCircle, Circle, Filter, ArrowUpDown } from 'lucide-react'
import type { UserProfile } from '@/utils/supabase/profile'
import { getCoachClients } from '@/utils/supabase/profile'
import { logger } from '@/utils/logger'

type ClientWithStatus = UserProfile & {
  lastCheckin?: string
  todayStatus?: 'red' | 'green' | 'grey'
  todayCalories?: number
  targetCalories?: number
}

export default function CoachDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [, setUser] = useState<User | null>(null)
  const [clients, setClients] = useState<ClientWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'red' | 'green' | 'grey'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'lastCheckin' | 'status'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    const fetchData = async () => {
      let user: User | null = null
      try {
        const { data: { user: authUser }, error: userError } = await supabase.auth.getUser()
        if (userError || !authUser) {
          router.push('/login')
          return
        }
        user = authUser
        setUser(authUser)

        // Проверяем, что пользователь - тренер
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authUser.id)
          .single()

        if (profile?.role !== 'coach') {
          router.push('/')
          return
        }

        // Загружаем клиентов
        const coachClients = await getCoachClients(authUser.id)

        // Для каждого клиента загружаем данные за сегодня
        const today = new Date().toISOString().split('T')[0]
        const clientsWithStatus = await Promise.all(
          coachClients.map(async (client) => {
            // Получаем отчет за сегодня
            const { data: todayLog } = await supabase
              .from('daily_logs')
              .select('*')
              .eq('user_id', client.id)
              .eq('date', today)
              .single()

            // Получаем цель за сегодня (используем target_type из лога или 'training' по умолчанию)
            const dayType = todayLog?.target_type || 'training'
            const { data: target } = await supabase
              .from('nutrition_targets')
              .select('*')
              .eq('user_id', client.id)
              .eq('is_active', true)
              .eq('day_type', dayType)
              .single()

            // Получаем последний чекин
            const { data: lastLog } = await supabase
              .from('daily_logs')
              .select('date')
              .eq('user_id', client.id)
              .order('date', { ascending: false })
              .limit(1)
              .single()

            // Определяем статус
            let status: 'red' | 'green' | 'grey' = 'grey'
            if (todayLog && target) {
              const diff = Math.abs((todayLog.actual_calories - target.calories) / target.calories)
              if (diff > 0.15) {
                status = 'red'
              } else {
                status = 'green'
              }
            } else if (!todayLog) {
              status = 'red' // Нет отчета за сегодня
            }

            return {
              ...client,
              lastCheckin: lastLog?.date,
              todayStatus: status,
              todayCalories: todayLog?.actual_calories,
              targetCalories: target?.calories,
            }
          })
        )

        setClients(clientsWithStatus)
        logger.info('Coach: данные клиентов успешно загружены', { coachId: user?.id || 'unknown', count: clientsWithStatus.length })
      } catch (error) {
        logger.error('Coach: ошибка загрузки данных', error, { coachId: user?.id || 'unknown' })
      } finally {
        setLoading(false)
        logger.debug('Coach: загрузка данных завершена')
      }
    }

    fetchData()
  }, [router, supabase])

  const getStatusIcon = (status: 'red' | 'green' | 'grey') => {
    switch (status) {
      case 'red':
        return <AlertCircle size={20} className="text-red-500" />
      case 'green':
        return <CheckCircle size={20} className="text-green-500" />
      case 'grey':
        return <Circle size={20} className="text-gray-400" />
    }
  }

  const getStatusText = (status: 'red' | 'green' | 'grey') => {
    switch (status) {
      case 'red':
        return 'Требует внимания'
      case 'green':
        return 'В норме'
      case 'grey':
        return 'Нет данных'
    }
  }

  // Фильтрация и сортировка клиентов
  const filteredAndSortedClients = useMemo(() => {
    let filtered = clients

    // Фильтр по статусу
    if (statusFilter !== 'all') {
      filtered = filtered.filter(client => client.todayStatus === statusFilter)
    }

    // Сортировка
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'name':
          const nameA = (a.full_name || a.email || '').toLowerCase()
          const nameB = (b.full_name || b.email || '').toLowerCase()
          comparison = nameA.localeCompare(nameB)
          break
        case 'lastCheckin':
          const dateA = a.lastCheckin ? new Date(a.lastCheckin).getTime() : 0
          const dateB = b.lastCheckin ? new Date(b.lastCheckin).getTime() : 0
          comparison = dateA - dateB
          break
        case 'status':
          const statusOrder = { 'red': 1, 'green': 2, 'grey': 3 }
          comparison = (statusOrder[a.todayStatus!] || 0) - (statusOrder[b.todayStatus!] || 0)
          break
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [clients, statusFilter, sortBy, sortOrder])

  const handleSort = (field: 'name' | 'lastCheckin' | 'status') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  if (loading) return <div className="p-8 text-center">Загрузка...</div>

  return (
    <main className="max-w-4xl mx-auto min-h-screen bg-gray-50 p-4 font-sans">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Кабинет тренера</h1>
          <p className="text-sm text-gray-500">Управление клиентами</p>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            router.push('/login')
            router.refresh()
          }}
          className="h-8 w-8 flex items-center justify-center bg-gray-200 rounded-full hover:bg-gray-300 transition-colors"
          title="Выйти"
        >
          <LogOut size={16} className="text-gray-600" />
        </button>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              Список клиентов ({filteredAndSortedClients.length} из {clients.length})
            </h2>
          </div>

          {/* Фильтры и сортировка */}
          <div className="flex flex-wrap gap-3">
            {/* Фильтр по статусу */}
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === 'all'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Все
                </button>
                <button
                  onClick={() => setStatusFilter('red')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === 'red'
                      ? 'bg-white text-red-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  🔴 Требуют внимания
                </button>
                <button
                  onClick={() => setStatusFilter('green')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === 'green'
                      ? 'bg-white text-green-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  🟢 В норме
                </button>
                <button
                  onClick={() => setStatusFilter('grey')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === 'grey'
                      ? 'bg-white text-gray-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  ⚪ Нет данных
                </button>
              </div>
            </div>

            {/* Сортировка */}
            <div className="flex items-center gap-2">
              <ArrowUpDown size={16} className="text-gray-400" />
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => handleSort('name')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${sortBy === 'name'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  По имени {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleSort('lastCheckin')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${sortBy === 'lastCheckin'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  По дате {sortBy === 'lastCheckin' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleSort('status')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${sortBy === 'status'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  По статусу {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {clients.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            У вас пока нет клиентов
          </div>
        ) : filteredAndSortedClients.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Нет клиентов, соответствующих выбранным фильтрам
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredAndSortedClients.map((client) => (
              <button
                key={client.id}
                onClick={() => router.push(`/coach/${client.id}`)}
                className="w-full p-6 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                      <UserIcon size={24} className="text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900">
                          {client.full_name || client.email || 'Без имени'}
                        </h3>
                        {getStatusIcon(client.todayStatus!)}
                      </div>
                      <div className="text-sm text-gray-500 space-y-1">
                        <p>
                          Последний чекин: {client.lastCheckin
                            ? new Date(client.lastCheckin).toLocaleDateString('ru-RU')
                            : 'Нет данных'}
                        </p>
                        {client.todayCalories && client.targetCalories && (
                          <p>
                            Сегодня: {client.todayCalories} / {client.targetCalories} ккал
                          </p>
                        )}
                        <p className="text-xs">
                          Статус: {getStatusText(client.todayStatus!)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-gray-400">
                    →
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

