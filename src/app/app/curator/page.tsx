'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { LogOut, User as UserIcon, AlertCircle, CheckCircle, Circle, Filter, ArrowUpDown, MessageSquare, UserPlus } from 'lucide-react'
import Link from 'next/link'
import type { UserProfile } from '@/utils/supabase/profile'
import { getCoordinatorClients } from '@/utils/supabase/profile'
import { logger } from '@/utils/logger'
import { playNotificationSound } from '@/utils/chat/sound'
import { subscribeToMessages, unsubscribeFromChannel, type Message } from '@/utils/chat/realtime'
import { showNotification, isNotificationSupported } from '@/utils/chat/notifications'

type ClientWithStatus = UserProfile & {
  lastCheckin?: string
  todayStatus?: 'red' | 'green' | 'yellow' | 'grey'
  todayCalories?: number
  targetCalories?: number
  isCompleted?: boolean
  isExpired?: boolean
  unreadMessagesCount?: number
}

export default function CuratorDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [, setUser] = useState<User | null>(null)
  const [clients, setClients] = useState<ClientWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'red' | 'green' | 'yellow' | 'grey'>('all')
  const [unreadFilter, setUnreadFilter] = useState<boolean>(false) // Фильтр по непрочитанным сообщениям
  const [sortBy, setSortBy] = useState<'name' | 'lastCheckin' | 'status' | 'unread'>('status') // По умолчанию сортировка по статусу
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc') // По умолчанию Red (1) сверху
  const [curatorUserId, setCuratorUserId] = useState<string | null>(null)
  const messageChannelsRef = useRef<any[]>([])

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
        setCuratorUserId(authUser.id)

        // Проверяем, что пользователь - куратор
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authUser.id)
          .single()

        if (profile?.role !== 'curator') {
          router.push('/')
          return
        }

        // Загружаем клиентов
        const curatorClients = await getCoordinatorClients(authUser.id)

        // Для каждого клиента загружаем данные за сегодня
        const today = new Date().toISOString().split('T')[0]
        const clientsWithStatus = await Promise.all(
          curatorClients.map(async (client: UserProfile) => {
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

            // Определяем статус (Traffic Light System v2)
            let status: 'red' | 'green' | 'yellow' | 'grey' = 'grey'

            // Проверяем, есть ли отчет за последние 24 часа
            const now = new Date()
            const lastCheckinDate = lastLog?.date ? new Date(lastLog.date) : null
            const hoursSinceLastCheckin = lastCheckinDate
              ? (now.getTime() - lastCheckinDate.getTime()) / (1000 * 60 * 60)
              : null

            if (todayLog && target) {
              // Есть данные за сегодня
              const isCompleted = todayLog.is_completed === true
              // Защита от деления на ноль
              const diff = target.calories > 0
                ? Math.abs((todayLog.actual_calories - target.calories) / target.calories)
                : todayLog.actual_calories > 0 ? 1 : 0

              if (isCompleted && diff <= 0.15) {
                // День закрыт, попадание в цели
                status = 'green'
              } else if (isCompleted && diff > 0.15) {
                // День закрыт, но отклонение > 15%
                status = 'yellow'
              } else if (!isCompleted && diff > 0.15) {
                // День не закрыт, отклонение > 15%
                status = 'red'
              } else if (!isCompleted) {
                // День не закрыт, но в пределах нормы
                status = 'yellow'
              } else {
                status = 'green'
              }
            } else if (!todayLog) {
              // Нет отчета за сегодня
              if (hoursSinceLastCheckin === null) {
                // Никогда не было чекина - нет данных
                status = 'grey'
              } else if (hoursSinceLastCheckin > 48) {
                // Нет отчета > 48 часов
                status = 'red'
              } else if (hoursSinceLastCheckin > 24) {
                // Нет отчета > 24 часов
                status = 'yellow'
              } else {
                // Нет данных, но недавно был чекин
                status = 'grey'
              }
            } else {
              // Нет данных вообще
              status = 'grey'
            }

            // Проверяем статус подписки клиента
            const { data: clientProfile } = await supabase
              .from('profiles')
              .select('subscription_status, subscription_end_date')
              .eq('id', client.id)
              .single()

            const isExpired = clientProfile?.subscription_status === 'expired' ||
              (clientProfile?.subscription_end_date && new Date(clientProfile.subscription_end_date) < new Date())

            // Загружаем количество непрочитанных сообщений от клиента
            const { count: unreadCount } = await supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('sender_id', client.id)
              .eq('receiver_id', authUser.id)
              .is('read_at', null)
              .eq('is_deleted', false)

            return {
              ...client,
              lastCheckin: lastLog?.date,
              unreadMessagesCount: unreadCount || 0,
              todayStatus: status,
              todayCalories: todayLog?.actual_calories,
              targetCalories: target?.calories,
              isCompleted: todayLog?.is_completed || false,
              subscription_status: clientProfile?.subscription_status,
              isExpired: isExpired || false,
            }
          })
        )

        setClients(clientsWithStatus)
        logger.info('Curator: данные клиентов успешно загружены', { curatorId: user?.id || 'unknown', count: clientsWithStatus.length })
      } catch (error) {
        logger.error('Curator: ошибка загрузки данных', error, { curatorId: user?.id || 'unknown' })
      } finally {
        setLoading(false)
        logger.debug('Curator: загрузка данных завершена')
      }
    }

    fetchData()
  }, [router, supabase])

  // Подписка на новые сообщения от всех клиентов для звуковых уведомлений
  useEffect(() => {
    if (!curatorUserId || clients.length === 0) return

    // Очищаем предыдущие подписки
    messageChannelsRef.current.forEach((channel) => {
      unsubscribeFromChannel(channel)
    })
    messageChannelsRef.current = []

    // Подписываемся на сообщения от каждого клиента
    clients.forEach((client) => {
      const channel = subscribeToMessages(
        curatorUserId,
        client.id,
        (message: Message) => {
          // Воспроизводим звук при получении нового сообщения
          playNotificationSound()

          // Показываем браузерное уведомление, если страница не в фокусе
          if (isNotificationSupported() && document.hidden) {
            const clientName = client.full_name || client.email || 'Клиент'
            showNotification(`Новое сообщение от ${clientName}`, {
              body: message.content.length > 100
                ? message.content.substring(0, 100) + '...'
                : message.content,
              tag: `curator-message-${client.id}`,
              requireInteraction: false,
            }).catch((error) => {
              logger.warn('Curator: ошибка показа браузерного уведомления', { error })
            })
          }

          // Обновляем счетчик непрочитанных для этого клиента
          setClients((prevClients) =>
            prevClients.map((c) =>
              c.id === client.id
                ? { ...c, unreadMessagesCount: (c.unreadMessagesCount || 0) + 1 }
                : c
            )
          )
        }
      )
      messageChannelsRef.current.push(channel)
    })

    return () => {
      // Отписываемся от всех каналов при размонтировании
      messageChannelsRef.current.forEach((channel) => {
        unsubscribeFromChannel(channel)
      })
      messageChannelsRef.current = []
    }
  }, [curatorUserId, clients])

  const getStatusIcon = (status: 'red' | 'green' | 'yellow' | 'grey') => {
    switch (status) {
      case 'red':
        return <AlertCircle size={20} className="text-rose-400" />
      case 'yellow':
        return <Circle size={20} className="text-amber-400 fill-amber-400" />
      case 'green':
        return <CheckCircle size={20} className="text-emerald-400" />
      case 'grey':
        return <Circle size={20} className="text-zinc-500" />
    }
  }

  const getStatusText = (status: 'red' | 'green' | 'yellow' | 'grey') => {
    switch (status) {
      case 'red':
        return 'Требует внимания'
      case 'yellow':
        return 'В процессе'
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

    // Фильтр по непрочитанным сообщениям
    if (unreadFilter) {
      filtered = filtered.filter(client => (client.unreadMessagesCount || 0) > 0)
    }

    // Сортировка с приоритетом по статусу
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
          // Приоритетная сортировка: Red (1) > Yellow (2) > Grey (3) > Green (4)
          const statusOrder = { 'red': 1, 'yellow': 2, 'grey': 3, 'green': 4 }
          comparison = (statusOrder[a.todayStatus!] || 0) - (statusOrder[b.todayStatus!] || 0)
          break
        case 'unread':
          // Сортировка по количеству непрочитанных сообщений (больше = выше)
          const unreadA = a.unreadMessagesCount || 0
          const unreadB = b.unreadMessagesCount || 0
          comparison = unreadB - unreadA // По убыванию (больше непрочитанных сверху)
          break
      }

      // Если сортировка по статусу или непрочитанным, всегда по возрастанию/убыванию соответственно
      if (sortBy === 'status') {
        return comparison
      }
      if (sortBy === 'unread') {
        return comparison // Уже по убыванию
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [clients, statusFilter, unreadFilter, sortBy, sortOrder])

  const handleSort = (field: 'name' | 'lastCheckin' | 'status' | 'unread') => {
    if (sortBy === field) {
      // Для непрочитанных всегда по убыванию, для остальных переключаем
      if (field === 'unread') {
        return // Не переключаем порядок для непрочитанных
      }
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder(field === 'unread' ? 'desc' : 'asc')
    }
  }

  if (loading) return <div className="p-8 text-center text-zinc-400">Загрузка...</div>

  return (
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-4xl md:mx-auto font-sans">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Кабинет куратора</h1>
          <p className="text-sm text-zinc-400">Управление клиентами</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/curator/invites"
            className="px-4 py-2 bg-white text-zinc-950 rounded-lg font-medium hover:bg-zinc-200 transition-colors flex items-center gap-2 text-sm"
          >
            <UserPlus size={16} />
            Инвайт-коды
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              router.push('/login')
              router.refresh()
            }}
            className="h-8 w-8 flex items-center justify-center bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors"
            title="Выйти"
          >
            <LogOut size={16} className="text-zinc-400" />
          </button>
        </div>
      </header>

      <div className="bg-zinc-900 rounded-2xl shadow-sm border border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-100 tabular-nums">
              Список клиентов ({filteredAndSortedClients.length} из {clients.length})
            </h2>
          </div>

          {/* Фильтры и сортировка */}
          <div className="flex flex-wrap gap-3">
            {/* Фильтр по статусу */}
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-zinc-500" />
              <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === 'all'
                    ? 'bg-white text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  Все
                </button>
                <button
                  onClick={() => setStatusFilter('red')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === 'red'
                    ? 'bg-white text-rose-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  🔴 Требуют внимания
                </button>
                <button
                  onClick={() => setStatusFilter('yellow')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === 'yellow'
                    ? 'bg-white text-amber-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  🟡 В процессе
                </button>
                <button
                  onClick={() => setStatusFilter('green')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === 'green'
                    ? 'bg-white text-emerald-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  🟢 В норме
                </button>
                <button
                  onClick={() => setStatusFilter('grey')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === 'grey'
                    ? 'bg-white text-zinc-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  ⚪ Нет данных
                </button>
              </div>
            </div>

            {/* Фильтр по непрочитанным сообщениям */}
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-zinc-500" />
              <button
                onClick={() => setUnreadFilter(!unreadFilter)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${unreadFilter
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
              >
                С непрочитанными
              </button>
            </div>

            {/* Сортировка */}
            <div className="flex items-center gap-2">
              <ArrowUpDown size={16} className="text-zinc-500" />
              <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
                <button
                  onClick={() => handleSort('name')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${sortBy === 'name'
                    ? 'bg-white text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  По имени {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleSort('lastCheckin')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${sortBy === 'lastCheckin'
                    ? 'bg-white text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  По дате {sortBy === 'lastCheckin' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleSort('status')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${sortBy === 'status'
                    ? 'bg-white text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  По статусу {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleSort('unread')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${sortBy === 'unread'
                    ? 'bg-white text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  По сообщениям {sortBy === 'unread' && '↓'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {clients.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            У вас пока нет клиентов
          </div>
        ) : filteredAndSortedClients.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            Нет клиентов, соответствующих выбранным фильтрам
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filteredAndSortedClients.map((client) => (
              <button
                key={client.id}
                onClick={() => router.push(`/app/curator/${client.id}`)}
                className="w-full p-6 hover:bg-zinc-800 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center">
                      <UserIcon size={24} className="text-zinc-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className={`font-semibold ${client.isExpired ? 'text-zinc-500' : 'text-zinc-100'}`}>
                          {client.full_name || client.email || 'Без имени'}
                        </h3>
                        {client.isExpired && (
                          <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded font-medium">
                            Expired
                          </span>
                        )}
                        {client.unreadMessagesCount && client.unreadMessagesCount > 0 && (
                          <span className="px-2 py-0.5 bg-white text-zinc-950 text-xs rounded-full font-bold min-w-[20px] text-center tabular-nums">
                            {client.unreadMessagesCount > 9 ? '9+' : client.unreadMessagesCount}
                          </span>
                        )}
                        {getStatusIcon(client.todayStatus!)}
                      </div>
                      <div className="text-sm text-zinc-400 space-y-1">
                        <p>
                          Последний чекин: {client.lastCheckin
                            ? new Date(client.lastCheckin).toLocaleDateString('ru-RU')
                            : 'Нет данных'}
                        </p>
                        {client.todayCalories && client.targetCalories && (
                          <p className="tabular-nums">
                            Сегодня: {client.todayCalories} / {client.targetCalories} ккал
                            {client.isCompleted && <span className="ml-2 text-emerald-400">✅</span>}
                          </p>
                        )}
                        <p className="text-xs">
                          Статус: {getStatusText(client.todayStatus!)}
                          {client.isCompleted && <span className="ml-1 text-emerald-400">(День завершен)</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-zinc-500">
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

