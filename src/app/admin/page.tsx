'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { LogOut, Search, Edit, User as UserIcon, Shield, Users } from 'lucide-react'
import { isSuperAdmin, type UserProfile, type UserRole, type SubscriptionStatus, type SubscriptionTier } from '@/utils/supabase/profile'
import { logger } from '@/utils/logger'

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionStatus | 'all'>('all')
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      logger.debug('Admin: начало загрузки данных')
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          logger.warn('Admin: пользователь не авторизован', { error: userError?.message })
          router.push('/login')
          return
        }
        logger.debug('Admin: пользователь авторизован', { userId: user.id })

        // Проверяем, что пользователь - супер-админ
        const isAdmin = await isSuperAdmin(user.id)
        if (!isAdmin) {
          logger.warn('Admin: попытка доступа без прав super_admin', { userId: user.id })
          router.push('/app/dashboard')
          return
        }
        logger.info('Admin: доступ разрешен (super_admin)', { userId: user.id })

        // Загружаем всех пользователей
        logger.debug('Admin: загрузка списка пользователей')
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false })

        if (usersError) {
          logger.error('Admin: ошибка загрузки пользователей', usersError, { userId: user.id })
        } else if (usersData) {
          setUsers(usersData as UserProfile[])
          logger.info('Admin: пользователи успешно загружены', { userId: user.id, count: usersData.length })
        }
      } catch (error) {
        logger.error('Admin: ошибка загрузки данных', error)
      } finally {
        setLoading(false)
        logger.debug('Admin: загрузка данных завершена')
      }
    }

    fetchData()
  }, [router, supabase])

  // Фильтрация и поиск пользователей
  const filteredUsers = useMemo(() => {
    let filtered = users

    // Поиск по email и имени
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(u =>
        u.email?.toLowerCase().includes(query) ||
        u.full_name?.toLowerCase().includes(query)
      )
    }

    // Фильтр по роли
    if (roleFilter !== 'all') {
      filtered = filtered.filter(u => u.role === roleFilter)
    }

    // Фильтр по статусу подписки
    if (subscriptionFilter !== 'all') {
      filtered = filtered.filter(u => u.subscription_status === subscriptionFilter)
    }

    return filtered
  }, [users, searchQuery, roleFilter, subscriptionFilter])

  const handleEdit = (userProfile: UserProfile) => {
    setEditingUser({ ...userProfile })
  }

  const handleSave = async () => {
    if (!editingUser) return

    logger.info('Admin: начало сохранения пользователя', { userId: editingUser.id })
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          role: editingUser.role,
          coach_id: editingUser.coach_id || null,
          subscription_status: editingUser.subscription_status,
          subscription_tier: editingUser.subscription_tier,
          subscription_start_date: editingUser.subscription_start_date || null,
          subscription_end_date: editingUser.subscription_end_date || null,
          full_name: editingUser.full_name || null,
        })
        .eq('id', editingUser.id)

      if (error) {
        logger.error('Admin: ошибка сохранения пользователя', error, {
          userId: editingUser.id,
          updates: {
            role: editingUser.role,
            subscription_status: editingUser.subscription_status,
            subscription_tier: editingUser.subscription_tier,
          },
        })
        alert('Ошибка сохранения: ' + error.message)
      } else {
        logger.info('Admin: пользователь успешно обновлен', {
          userId: editingUser.id,
          updates: {
            role: editingUser.role,
            subscription_status: editingUser.subscription_status,
            subscription_tier: editingUser.subscription_tier,
          },
        })
        // Обновляем локальное состояние
        setUsers(users.map(u => u.id === editingUser.id ? editingUser : u))
        setEditingUser(null)
      }
    } catch (error) {
      logger.error('Admin: исключение при сохранении пользователя', error, { userId: editingUser.id })
      alert('Произошла ошибка')
    } finally {
      setSaving(false)
    }
  }

  // Загружаем список тренеров для выбора
  const coaches = useMemo(() => {
    return users.filter(u => u.role === 'coach')
  }, [users])

  if (loading) return <div className="p-8 text-center">Загрузка...</div>

  return (
    <main className="max-w-7xl mx-auto min-h-screen bg-gray-50 p-4 font-sans">
      {/* HEADER */}
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield size={24} />
            Панель администратора
          </h1>
          <p className="text-sm text-gray-500">Управление пользователями и подписками</p>
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

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Всего пользователей" value={users.length} icon={<Users size={20} />} />
        <StatCard label="Клиенты" value={users.filter(u => u.role === 'client').length} icon={<UserIcon size={20} />} />
        <StatCard label="Тренеры" value={users.filter(u => u.role === 'coach').length} icon={<Shield size={20} />} />
        <StatCard label="Premium подписки" value={users.filter(u => u.subscription_status === 'active').length} icon={<Shield size={20} />} />
      </div>

      {/* FILTERS */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Поиск */}
          <div className="flex-1">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по email или имени..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
              />
            </div>
          </div>

          {/* Фильтр по роли */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
            className="px-4 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-black outline-none"
          >
            <option value="all">Все роли</option>
            <option value="client">Клиенты</option>
            <option value="coach">Тренеры</option>
            <option value="super_admin">Супер-админы</option>
          </select>

          {/* Фильтр по подписке */}
          <select
            value={subscriptionFilter}
            onChange={(e) => setSubscriptionFilter(e.target.value as SubscriptionStatus | 'all')}
            className="px-4 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-black outline-none"
          >
            <option value="all">Все подписки</option>
            <option value="free">Бесплатные</option>
            <option value="active">Активные</option>
            <option value="cancelled">Отмененные</option>
            <option value="past_due">Просроченные</option>
          </select>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Пользователь</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Роль</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Подписка</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тренер</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата регистрации</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((userProfile) => (
                <tr key={userProfile.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {userProfile.full_name || 'Без имени'}
                      </div>
                      <div className="text-sm text-gray-500">{userProfile.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${userProfile.role === 'super_admin' ? 'bg-purple-100 text-purple-700' :
                      userProfile.role === 'coach' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                      {userProfile.role === 'super_admin' ? 'Супер-админ' :
                        userProfile.role === 'coach' ? 'Тренер' : 'Клиент'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${userProfile.subscription_status === 'active' ? 'bg-green-100 text-green-700' :
                        userProfile.subscription_status === 'free' ? 'bg-gray-100 text-gray-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                        {userProfile.subscription_status === 'active' ? 'Активна' :
                          userProfile.subscription_status === 'free' ? 'Бесплатно' :
                            userProfile.subscription_status === 'cancelled' ? 'Отменена' : 'Просрочена'}
                      </span>
                      {userProfile.subscription_tier && (
                        <div className="text-xs text-gray-500 mt-1">
                          {userProfile.subscription_tier === 'premium' ? 'Premium' : 'Basic'}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {userProfile.coach_id ? (
                      coaches.find(c => c.id === userProfile.coach_id)?.full_name ||
                      coaches.find(c => c.id === userProfile.coach_id)?.email ||
                      'Неизвестен'
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {userProfile.created_at
                      ? new Date(userProfile.created_at).toLocaleDateString('ru-RU')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleEdit(userProfile)}
                      className="text-black hover:text-gray-700 flex items-center gap-1"
                    >
                      <Edit size={16} />
                      Редактировать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            Пользователи не найдены
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Редактирование пользователя</h2>
              <p className="text-sm text-gray-500 mt-1">{editingUser.email}</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Имя */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
                <input
                  type="text"
                  value={editingUser.full_name || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                  className="w-full p-2 bg-gray-50 rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
                />
              </div>

              {/* Роль */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Роль</label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                  className="w-full p-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-black outline-none"
                >
                  <option value="client">Клиент</option>
                  <option value="coach">Тренер</option>
                  <option value="super_admin">Супер-админ</option>
                </select>
              </div>

              {/* Тренер (только для клиентов) */}
              {editingUser.role === 'client' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Тренер</label>
                  <select
                    value={editingUser.coach_id || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, coach_id: e.target.value || null })}
                    className="w-full p-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-black outline-none"
                  >
                    <option value="">Не назначен</option>
                    {coaches.map(coach => (
                      <option key={coach.id} value={coach.id}>
                        {coach.full_name || coach.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Статус подписки */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус подписки</label>
                <select
                  value={editingUser.subscription_status || 'free'}
                  onChange={(e) => setEditingUser({ ...editingUser, subscription_status: e.target.value as SubscriptionStatus })}
                  className="w-full p-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-black outline-none"
                >
                  <option value="free">Бесплатно</option>
                  <option value="active">Активна</option>
                  <option value="cancelled">Отменена</option>
                  <option value="past_due">Просрочена</option>
                </select>
              </div>

              {/* Уровень подписки */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Уровень подписки</label>
                <select
                  value={editingUser.subscription_tier || 'basic'}
                  onChange={(e) => setEditingUser({ ...editingUser, subscription_tier: e.target.value as SubscriptionTier })}
                  className="w-full p-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-black outline-none"
                >
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              {/* Даты подписки */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Начало подписки</label>
                  <input
                    type="date"
                    value={editingUser.subscription_start_date ? editingUser.subscription_start_date.split('T')[0] : ''}
                    onChange={(e) => setEditingUser({ ...editingUser, subscription_start_date: e.target.value || null })}
                    className="w-full p-2 bg-gray-50 rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Окончание подписки</label>
                  <input
                    type="date"
                    value={editingUser.subscription_end_date ? editingUser.subscription_end_date.split('T')[0] : ''}
                    onChange={(e) => setEditingUser({ ...editingUser, subscription_end_date: e.target.value || null })}
                    className="w-full p-2 bg-gray-50 rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 px-4 bg-black text-white rounded-xl font-medium hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 py-2 px-4 bg-gray-200 text-gray-900 rounded-xl font-medium hover:bg-gray-300 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className="text-gray-400">
          {icon}
        </div>
      </div>
    </div>
  )
}

