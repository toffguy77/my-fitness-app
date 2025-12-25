'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { LogOut, Search, Edit, User as UserIcon, Shield, Users } from 'lucide-react'
import { isSuperAdmin, type UserProfile, type UserRole, type SubscriptionStatus, type SubscriptionTier } from '@/utils/supabase/profile'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionStatus | 'all'>('all')
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'clients' | 'coordinators' | 'premium'>('all')
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
      // Подготовка данных для обновления
      const updateData: {
        role: UserRole
        coordinator_id: string | null
        subscription_status?: SubscriptionStatus
        subscription_tier?: SubscriptionTier
        subscription_start_date?: string | null
        subscription_end_date?: string | null
        full_name: string | null
      } = {
        role: editingUser.role,
        coordinator_id: editingUser.coordinator_id || null,
        full_name: editingUser.full_name || null,
      }

      // Поля подписки только для клиентов
      if (editingUser.role === 'client') {
        updateData.subscription_status = editingUser.subscription_status
        updateData.subscription_tier = editingUser.subscription_tier
        updateData.subscription_start_date = editingUser.subscription_start_date || null
        updateData.subscription_end_date = editingUser.subscription_end_date || null
      } else {
        // Для координаторов и админов очищаем поля подписки
        updateData.subscription_status = 'free'
        updateData.subscription_tier = 'basic'
        updateData.subscription_start_date = null
        updateData.subscription_end_date = null
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
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
        toast.error('Ошибка сохранения: ' + error.message)
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
      toast.error('Произошла ошибка')
    } finally {
      setSaving(false)
    }
  }

  // Загружаем список координаторов для выбора
  const coordinators = useMemo(() => {
    return users.filter(u => u.role === 'coordinator')
  }, [users])

  if (loading) return <div className="p-8 text-center text-zinc-400">Загрузка...</div>

  return (
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-7xl md:mx-auto font-sans">
      {/* HEADER */}
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Shield size={24} />
            Панель администратора
          </h1>
          <p className="text-sm text-zinc-400">Управление пользователями и подписками</p>
        </div>
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
      </header>

      {/* STATS / FILTERS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Всего пользователей"
          value={users.length}
          icon={<Users size={20} />}
          isActive={activeStatFilter === 'all'}
          onClick={() => {
            setActiveStatFilter('all')
            setRoleFilter('all')
            setSubscriptionFilter('all')
          }}
        />
        <StatCard
          label="Клиенты"
          value={users.filter(u => u.role === 'client').length}
          icon={<UserIcon size={20} />}
          isActive={activeStatFilter === 'clients'}
          onClick={() => {
            setActiveStatFilter('clients')
            setRoleFilter('client')
            setSubscriptionFilter('all')
          }}
        />
        <StatCard
          label="Координаторы"
          value={users.filter(u => u.role === 'coordinator').length}
          icon={<Shield size={20} />}
          isActive={activeStatFilter === 'coordinators'}
          onClick={() => {
            setActiveStatFilter('coordinators')
            setRoleFilter('coordinator')
            setSubscriptionFilter('all')
          }}
        />
        <StatCard
          label="Premium подписки"
          value={users.filter(u => u.subscription_status === 'active').length}
          icon={<Shield size={20} />}
          isActive={activeStatFilter === 'premium'}
          onClick={() => {
            setActiveStatFilter('premium')
            setRoleFilter('all')
            setSubscriptionFilter('active')
          }}
        />
      </div>

      {/* FILTERS */}
      <div className="bg-zinc-900 p-4 rounded-2xl shadow-sm border border-zinc-800 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Поиск */}
          <div className="flex-1">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по email или имени..."
                className="w-full pl-10 pr-4 py-2 bg-zinc-800 rounded-xl border border-zinc-700 text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-500"
              />
            </div>
          </div>

          {/* Фильтр по роли */}
          <select
            value={roleFilter}
            onChange={(e) => {
              const newRole = e.target.value as UserRole | 'all'
              setRoleFilter(newRole)
              // Сбрасываем активный фильтр статистики, если пользователь меняет фильтр вручную
              if (newRole === 'all' && subscriptionFilter === 'all') {
                setActiveStatFilter('all')
              } else if (newRole === 'client' && subscriptionFilter === 'all') {
                setActiveStatFilter('clients')
              } else if (newRole === 'coordinator' && subscriptionFilter === 'all') {
                setActiveStatFilter('coordinators')
              } else {
                setActiveStatFilter('all') // Сбрасываем, если комбинация не соответствует ни одному фильтру
              }
            }}
            className="px-4 py-2 bg-zinc-800 rounded-xl border border-zinc-700 text-sm focus:ring-2 focus:ring-white outline-none text-zinc-100"
          >
            <option value="all">Все роли</option>
            <option value="client">Клиенты</option>
            <option value="coordinator">Координаторы</option>
            <option value="super_admin">Супер-админы</option>
          </select>

          {/* Фильтр по подписке */}
          <select
            value={subscriptionFilter}
            onChange={(e) => {
              const newSubscription = e.target.value as SubscriptionStatus | 'all'
              setSubscriptionFilter(newSubscription)
              // Сбрасываем активный фильтр статистики, если пользователь меняет фильтр вручную
              if (newSubscription === 'active' && roleFilter === 'all') {
                setActiveStatFilter('premium')
              } else if (newSubscription === 'all' && roleFilter === 'all') {
                setActiveStatFilter('all')
              } else if (newSubscription === 'all' && roleFilter === 'client') {
                setActiveStatFilter('clients')
              } else if (newSubscription === 'all' && roleFilter === 'coordinator') {
                setActiveStatFilter('coordinators')
              } else {
                setActiveStatFilter('all') // Сбрасываем, если комбинация не соответствует ни одному фильтру
              }
            }}
            className="px-4 py-2 bg-zinc-800 rounded-xl border border-zinc-700 text-sm focus:ring-2 focus:ring-white outline-none text-zinc-100"
          >
            <option value="all">Все подписки</option>
            <option value="free">Бесплатные</option>
            <option value="active">Активные</option>
            <option value="cancelled">Отмененные</option>
            <option value="past_due">Просроченные</option>
          </select>

          {/* Кнопка сброса фильтров */}
          {(searchQuery || roleFilter !== 'all' || subscriptionFilter !== 'all' || activeStatFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('')
                setRoleFilter('all')
                setSubscriptionFilter('all')
                setActiveStatFilter('all')
              }}
              className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-700 text-sm font-medium hover:bg-zinc-700 transition-colors whitespace-nowrap"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-zinc-900 rounded-2xl shadow-sm border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-zinc-800 border-b border-zinc-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">Пользователь</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">Роль</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">Подписка</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">Координатор</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">Дата регистрации</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">Действия</th>
              </tr>
            </thead>
            <tbody className="bg-zinc-900 divide-y divide-zinc-800">
              {filteredUsers.map((userProfile) => (
                <tr key={userProfile.id} className="hover:bg-zinc-800 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">
                        {userProfile.full_name || 'Без имени'}
                      </div>
                      <div className="text-sm text-zinc-400">{userProfile.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${userProfile.role === 'super_admin' ? 'bg-purple-950/30 text-purple-300 border border-purple-800/50' : userProfile.role === 'coordinator' ? 'bg-blue-950/30 text-blue-300 border border-blue-800/50' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}>
                      {userProfile.role === 'super_admin' ? 'Супер-админ' : userProfile.role === 'coordinator' ? 'Координатор' : 'Клиент'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {userProfile.role === 'client' ? (
                      <div className="text-sm">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${userProfile.subscription_status === 'active' ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-800/50' : userProfile.subscription_status === 'free' ? 'bg-zinc-800 text-zinc-300 border border-zinc-700' : 'bg-rose-950/30 text-rose-300 border border-rose-800/50'}`}>
                          {userProfile.subscription_status === 'active' ? 'Активна' : userProfile.subscription_status === 'free' ? 'Бесплатно' : userProfile.subscription_status === 'cancelled' ? 'Отменена' : 'Просрочена'}
                        </span>
                        {userProfile.subscription_tier && (
                          <div className="text-xs text-zinc-400 mt-1">
                            {userProfile.subscription_tier === 'premium' ? 'Premium' : 'Basic'}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-400">
                    {userProfile.coordinator_id ? (
                      coordinators.find(c => c.id === userProfile.coordinator_id)?.full_name ||
                      coordinators.find(c => c.id === userProfile.coordinator_id)?.email ||
                      'Неизвестен'
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-400">
                    {userProfile.created_at
                      ? new Date(userProfile.created_at).toLocaleDateString('ru-RU')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(userProfile)}
                        className="text-zinc-300 hover:text-zinc-100 flex items-center gap-1"
                      >
                        <Edit size={16} />
                        Редактировать
                      </button>
                      {userProfile.role === 'client' && (
                        <button
                          onClick={() => {
                            const updatedUser = { ...userProfile, role: 'coordinator' as UserRole, coordinator_id: null, subscription_status: 'free' as SubscriptionStatus, subscription_tier: 'basic' as SubscriptionTier, subscription_start_date: null, subscription_end_date: null }
                            setEditingUser(updatedUser)
                          }}
                          className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                          title="Быстро превратить в координатора"
                        >
                          → Координатор
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            Пользователи не найдены
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 rounded-2xl shadow-xl w-full sm:max-w-2xl sm:mx-auto max-h-[90vh] overflow-y-auto border border-zinc-800">
            <div className="p-4 sm:p-6 border-b border-zinc-800">
              <h2 className="text-xl font-bold text-zinc-100">Редактирование пользователя</h2>
              <p className="text-sm text-zinc-400 mt-1">{editingUser.email}</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Имя */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Имя</label>
                <input
                  type="text"
                  value={editingUser.full_name || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                  className="w-full p-2 bg-zinc-800 rounded-xl border border-zinc-700 text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-500"
                />
              </div>

              {/* Роль */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Роль</label>
                <select
                  value={editingUser.role}
                  onChange={(e) => {
                    const newRole = e.target.value as UserRole
                    const updatedUser = { ...editingUser, role: newRole }

                    // Если пользователь становится координатором или супер-админом, очищаем поля клиента
                    if (newRole === 'coordinator' || newRole === 'super_admin') {
                      updatedUser.coordinator_id = null
                      // Очищаем подписку при превращении в координатора
                      updatedUser.subscription_status = 'free'
                      updatedUser.subscription_tier = 'basic'
                      updatedUser.subscription_start_date = null
                      updatedUser.subscription_end_date = null
                    }

                    setEditingUser(updatedUser)
                  }}
                  className="w-full p-2 bg-zinc-800 rounded-xl border border-zinc-700 text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none"
                >
                  <option value="client">Клиент</option>
                  <option value="coordinator">Координатор</option>
                  <option value="super_admin">Супер-админ</option>
                </select>
                {editingUser.role === 'client' && (editingUser.coordinator_id || editingUser.subscription_status !== 'free') && (
                  <p className="text-xs text-zinc-400 mt-1">
                    При изменении роли на &quot;Координатор&quot; будут очищены: назначенный координатор и подписка
                  </p>
                )}
              </div>

              {/* Координатор (только для клиентов) */}
              {editingUser.role === 'client' && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Координатор</label>
                  <select
                    value={editingUser.coordinator_id || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, coordinator_id: e.target.value || null })}
                    className="w-full p-2 bg-zinc-800 rounded-xl border border-zinc-700 text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none"
                  >
                    <option value="">Не назначен</option>
                    {coordinators.map(coordinator => (
                      <option key={coordinator.id} value={coordinator.id}>
                        {coordinator.full_name || coordinator.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Статус подписки (только для клиентов) */}
              {editingUser.role === 'client' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Статус подписки</label>
                    <select
                      value={editingUser.subscription_status || 'free'}
                      onChange={(e) => setEditingUser({ ...editingUser, subscription_status: e.target.value as SubscriptionStatus })}
                      className="w-full p-2 bg-zinc-800 rounded-xl border border-zinc-700 text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none"
                    >
                      <option value="free">Бесплатно</option>
                      <option value="active">Активна</option>
                      <option value="cancelled">Отменена</option>
                      <option value="past_due">Просрочена</option>
                      <option value="expired">Истекла</option>
                    </select>
                  </div>

                  {/* Уровень подписки */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Уровень подписки</label>
                    <select
                      value={editingUser.subscription_tier || 'basic'}
                      onChange={(e) => {
                        const newTier = e.target.value as SubscriptionTier
                        const updatedUser = { ...editingUser, subscription_tier: newTier }

                        // Если выбран Premium, автоматически устанавливаем даты: начало = сегодня, окончание = +30 дней
                        if (newTier === 'premium') {
                          const today = new Date()
                          const endDate = new Date(today)
                          endDate.setDate(endDate.getDate() + 30) // +30 календарных дней

                          updatedUser.subscription_start_date = today.toISOString().split('T')[0]
                          updatedUser.subscription_end_date = endDate.toISOString().split('T')[0]
                        } else if (newTier === 'basic') {
                          // Если выбран Basic, сбрасываем даты подписки
                          updatedUser.subscription_start_date = null
                          updatedUser.subscription_end_date = null
                        }

                        setEditingUser(updatedUser)
                      }}
                      className="w-full p-2 bg-zinc-800 rounded-xl border border-zinc-700 text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none"
                    >
                      <option value="basic">Basic</option>
                      <option value="premium">Premium</option>
                    </select>
                  </div>

                  {/* Даты подписки */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">Начало подписки</label>
                      <input
                        type="date"
                        value={editingUser.subscription_start_date ? editingUser.subscription_start_date.split('T')[0] : ''}
                        onChange={(e) => setEditingUser({ ...editingUser, subscription_start_date: e.target.value || null })}
                        className="w-full p-2 bg-zinc-800 rounded-xl border border-zinc-700 text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">Окончание подписки</label>
                      <input
                        type="date"
                        value={editingUser.subscription_end_date ? editingUser.subscription_end_date.split('T')[0] : ''}
                        onChange={(e) => setEditingUser({ ...editingUser, subscription_end_date: e.target.value || null })}
                        className="w-full p-2 bg-zinc-800 rounded-xl border border-zinc-700 text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-6 border-t border-zinc-800 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 px-4 bg-white text-zinc-950 rounded-xl font-medium hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 py-2 px-4 bg-zinc-800 text-zinc-300 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
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

function StatCard({
  label,
  value,
  icon,
  isActive = false,
  onClick
}: {
  label: string
  value: number
  icon: React.ReactNode
  isActive?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-zinc-900 p-4 rounded-xl shadow-sm border-2 transition-all w-full text-left hover:shadow-md ${isActive ? 'border-white bg-zinc-800' : 'border-zinc-800 hover:border-zinc-700'}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm ${isActive ? 'text-zinc-300 font-medium' : 'text-zinc-400'}`}>{label}</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${isActive ? 'text-zinc-100' : 'text-zinc-200'}`}>{value}</p>
        </div>
        <div className={isActive ? 'text-zinc-100' : 'text-zinc-500'}>
          {icon}
        </div>
      </div>
    </button>
  )
}

