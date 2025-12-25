'use client'

import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { LogOut, BarChart3, Table, TrendingUp, Inbox, BarChart } from 'lucide-react'
import EmptyState from '@/components/EmptyState'
import { getUserProfile, hasActiveSubscription } from '@/utils/supabase/profile'
import { checkSubscriptionStatus } from '@/utils/supabase/subscription'
import Paywall from '@/components/Paywall'
import PremiumFeatureModal from '@/components/PremiumFeatureModal'
import { logger } from '@/utils/logger'
import SkeletonLoader from '@/components/SkeletonLoader'

// Lazy load heavy chart components for code splitting
const WeightChart = lazy(() => import('@/components/charts/WeightChart'))
const MacrosChart = lazy(() => import('@/components/charts/MacrosChart'))
import ExportButton from '@/components/reports/ExportButton'
import ReportFilters from '@/components/reports/ReportFilters'
import Pagination from '@/components/Pagination'
import LoadingSpinner from '@/components/LoadingSpinner'
import toast from 'react-hot-toast'
import type { DailyLog, NutritionTarget } from '@/utils/export'

type TabType = 'graphs' | 'table' | 'statistics'

export default function ReportsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [targets, setTargets] = useState<NutritionTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [isPremium, setIsPremium] = useState(false)
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('graphs')

  // Фильтры и пагинация
  const [filteredLogs, setFilteredLogs] = useState<DailyLog[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  // Период для графиков
  const [chartPeriod, setChartPeriod] = useState<'7days' | '30days' | '3months' | 'all'>('30days')

  useEffect(() => {
    const fetchData = async () => {
        logger.debug('Reports: начало загрузки данных')
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          logger.warn('Reports: пользователь не авторизован', { error: userError?.message })
          router.push('/login')
          return
        }
        logger.debug('Reports: пользователь авторизован', { userId: user.id })
        setUser(user)

        // Проверяем Premium статус с автоматическим обновлением
        const profile = await getUserProfile(user)
        const subscriptionInfo = await checkSubscriptionStatus(user.id)
        const premium = subscriptionInfo.isActive
        setIsPremium(premium)
        
        // Record report view metric
        try {
          const { metricsCollector } = require('@/utils/metrics/collector')
          metricsCollector.counter(
            'reports_viewed_total',
            'Total number of report views',
            {
              role: profile?.role || 'client',
            }
          )
        } catch {
          // Ignore metrics errors
        }
        
        logger.debug('Reports: статус Premium', {
          userId: user.id,
          isPremium: premium,
          subscriptionStatus: subscriptionInfo.status,
          isExpired: subscriptionInfo.isExpired
        })

        // Если не Premium, показываем модальное окно
        if (!premium) {
          logger.info('Reports: доступ запрещен (не Premium)', { userId: user.id })
          setShowPremiumModal(true)
          setLoading(false)
          return
        }

        logger.debug('Reports: загрузка отчетов', { userId: user.id })
        const [logsResult, targetsResult] = await Promise.all([
          supabase
            .from('daily_logs')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false }),
          supabase
            .from('nutrition_targets')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
        ])

        if (logsResult.error) {
          logger.error('Reports: ошибка загрузки отчетов', logsResult.error, { userId: user.id })
          toast.error('Ошибка загрузки данных')
        } else if (logsResult.data) {
          const logsData = logsResult.data.map(log => ({
            date: log.date,
            actual_calories: log.actual_calories || 0,
            actual_protein: log.actual_protein || 0,
            actual_fats: log.actual_fats || 0,
            actual_carbs: log.actual_carbs || 0,
            weight: log.weight || null,
            notes: log.notes || null,
          })) as DailyLog[]
          setLogs(logsData)
          setFilteredLogs(logsData)
          logger.info('Reports: отчеты успешно загружены', { userId: user.id, count: logsData.length })
        }

        if (targetsResult.data) {
          const targetsData = targetsResult.data.map(target => ({
            day_type: target.day_type,
            calories: target.calories,
            protein: target.protein,
            fats: target.fats,
            carbs: target.carbs,
          })) as NutritionTarget[]
          setTargets(targetsData)
          logger.debug('Reports: цели питания загружены', { userId: user.id, count: targetsData.length })
        }
      } catch (error) {
        logger.error('Reports: ошибка загрузки данных', error)
        toast.error('Ошибка загрузки данных')
      } finally {
        setLoading(false)
        logger.debug('Reports: загрузка данных завершена')
      }
    }

    fetchData()
  }, [router, supabase])

  // Обработчики фильтров
  const handleDateRangeChange = (start: string | null, end: string | null) => {
    let filtered = [...logs]

    if (start) {
      filtered = filtered.filter(log => log.date >= start)
    }
    if (end) {
      filtered = filtered.filter(log => log.date <= end)
    }

    setFilteredLogs(filtered)
    setCurrentPage(1)
  }

  const handleDayTypeChange = (dayType: 'training' | 'rest' | 'all') => {
    // Для фильтрации по типу дня нужно проверять target_type в daily_logs
    // Пока оставляем как есть, так как в daily_logs нет прямого поля target_type
    setCurrentPage(1)
  }

  const handleSortChange = (sortBy: 'date' | 'calories' | 'weight', order: 'asc' | 'desc') => {
    const sorted = [...filteredLogs].sort((a, b) => {
      let aVal: number | string
      let bVal: number | string

      switch (sortBy) {
        case 'date':
          aVal = a.date
          bVal = b.date
          break
        case 'calories':
          aVal = a.actual_calories
          bVal = b.actual_calories
          break
        case 'weight':
          aVal = a.weight || 0
          bVal = b.weight || 0
          break
        default:
          return 0
      }

      if (aVal < bVal) return order === 'asc' ? -1 : 1
      if (aVal > bVal) return order === 'asc' ? 1 : -1
      return 0
    })

    setFilteredLogs(sorted)
    setCurrentPage(1)
  }

  // Данные для графиков с целевыми линиями
  const chartData = useMemo(() => {
    const sortedLogs = [...logs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return sortedLogs.map(log => {
      // Определяем тип дня (если есть в логе, иначе используем дефолт)
      const dayType = 'training' // Упрощенно, можно улучшить
      const target = targets.find(t => t.day_type === dayType)

      return {
        date: log.date,
        calories: log.actual_calories,
        protein: log.actual_protein,
        fats: log.actual_fats,
        carbs: log.actual_carbs,
        targetCalories: target?.calories,
        targetProtein: target?.protein,
        targetFats: target?.fats,
        targetCarbs: target?.carbs,
      }
    })
  }, [logs, targets])

  // Данные для графика веса
  const weightData = useMemo(() => {
    return logs
      .filter(log => log.weight !== null && log.weight !== undefined)
      .map(log => ({
        date: log.date,
        weight: log.weight!,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [logs])

  // Статистика
  const statistics = useMemo(() => {
    if (filteredLogs.length === 0) return null

    const validLogs = filteredLogs.filter(log => log.actual_calories > 0)
    if (validLogs.length === 0) return null

    const totalCalories = validLogs.reduce((sum, log) => sum + log.actual_calories, 0)
    const totalProtein = validLogs.reduce((sum, log) => sum + log.actual_protein, 0)
    const totalFats = validLogs.reduce((sum, log) => sum + log.actual_fats, 0)
    const totalCarbs = validLogs.reduce((sum, log) => sum + log.actual_carbs, 0)

    const weights = filteredLogs
      .filter(log => log.weight !== null && log.weight !== undefined)
      .map(log => log.weight!)
      .sort((a, b) => a - b)

    const firstWeight = weights[0]
    const lastWeight = weights[weights.length - 1]
    const weightChange = firstWeight && lastWeight ? lastWeight - firstWeight : null

    return {
      daysLogged: validLogs.length,
      avgCalories: Math.round(totalCalories / validLogs.length),
      avgProtein: Math.round(totalProtein / validLogs.length),
      avgFats: Math.round(totalFats / validLogs.length),
      avgCarbs: Math.round(totalCarbs / validLogs.length),
      totalCalories,
      totalProtein,
      totalFats,
      totalCarbs,
      weightChange,
      firstWeight,
      lastWeight,
      minWeight: weights.length > 0 ? weights[0] : null,
      maxWeight: weights.length > 0 ? weights[weights.length - 1] : null,
    }
  }, [filteredLogs])

  // Пагинация
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredLogs.slice(startIndex, endIndex)
  }, [filteredLogs, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage)

  if (loading) {
    return (
      <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans">
        <div className="space-y-6">
          <SkeletonLoader variant="card" count={2} />
          <SkeletonLoader variant="table" count={1} />
        </div>
      </main>
    )
  }

  if (!user) return null

  // Показываем paywall или модальное окно для бесплатных пользователей
  if (!isPremium) {
    return (
      <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans">
        <header className="mb-6">
          <h1 className="text-xl font-bold text-zinc-100">Отчеты и аналитика</h1>
          <p className="text-sm text-zinc-400">История и статистика</p>
        </header>
        <Paywall
          title="Отчеты доступны с Premium подпиской"
          message="Подключите работу с координатором, чтобы получить доступ к детальным отчетам, аналитике прогресса и персональным рекомендациям."
        />
        <PremiumFeatureModal
          isOpen={showPremiumModal}
          onClose={() => {
            setShowPremiumModal(false)
            router.push('/app/dashboard')
          }}
          featureName="Отчеты и аналитика"
        />
      </main>
    )
  }

  return (
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans space-y-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-zinc-100">Отчеты и аналитика</h1>
        <p className="text-sm text-zinc-400">Детальная статистика и графики</p>
      </header>

      {/* Вкладки */}
      <div className="flex gap-2 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('graphs')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'graphs'
              ? 'border-white text-zinc-100'
              : 'border-transparent text-zinc-400 hover:text-zinc-300'
            }`}
        >
          <BarChart3 size={16} />
          Графики
        </button>
        <button
          onClick={() => setActiveTab('table')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'table'
              ? 'border-white text-zinc-100'
              : 'border-transparent text-zinc-400 hover:text-zinc-300'
            }`}
        >
          <Table size={16} />
          Таблица
        </button>
        <button
          onClick={() => setActiveTab('statistics')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'statistics'
              ? 'border-white text-zinc-100'
              : 'border-transparent text-zinc-400 hover:text-zinc-300'
            }`}
        >
          <TrendingUp size={16} />
          Статистика
        </button>
      </div>

      {/* Контент вкладок */}
      {activeTab === 'graphs' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Графики прогресса</h2>
            <ExportButton data={filteredLogs} targets={targets} filename="nutrition_report" />
          </div>

          {weightData.length > 0 && (
            <section className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
              <h3 className="text-sm font-semibold text-zinc-100 mb-4">Динамика веса</h3>
              <Suspense fallback={<SkeletonLoader variant="card" count={1} />}>
                <WeightChart data={weightData} period={chartPeriod} onPeriodChange={setChartPeriod} />
              </Suspense>
            </section>
          )}

          {chartData.length > 0 && (
            <section className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
              <h3 className="text-sm font-semibold text-zinc-100 mb-4">Калории и макронутриенты</h3>
              <Suspense fallback={<SkeletonLoader variant="card" count={1} />}>
                <MacrosChart data={chartData} period={chartPeriod} showTargets={targets.length > 0} />
              </Suspense>
            </section>
          )}

          {chartData.length === 0 && weightData.length === 0 && (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800">
              <EmptyState
                icon={BarChart}
                title="Нет данных для отображения графиков"
                description="Начните вводить данные о питании и весе, чтобы видеть графики и аналитику"
                variant="default"
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'table' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-zinc-100">Таблица данных</h2>
            <ExportButton data={filteredLogs} targets={targets} filename="nutrition_data" />
          </div>

          <ReportFilters
            onDateRangeChange={handleDateRangeChange}
            onDayTypeChange={handleDayTypeChange}
            onSortChange={handleSortChange}
          />

          {paginatedLogs.length > 0 ? (
            <>
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-800 border-b border-zinc-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-300 uppercase">Дата</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-300 uppercase">Ккал</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-300 uppercase">Б</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-300 uppercase">Ж</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-300 uppercase">У</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-300 uppercase">Вес</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {paginatedLogs.map((log) => (
                        <tr key={log.date} className="hover:bg-zinc-800 transition-colors">
                          <td className="px-4 py-3 text-sm text-zinc-100">
                            {new Date(log.date).toLocaleDateString('ru-RU', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-300 tabular-nums">{log.actual_calories}</td>
                          <td className="px-4 py-3 text-sm text-zinc-300 tabular-nums">{log.actual_protein}</td>
                          <td className="px-4 py-3 text-sm text-zinc-300 tabular-nums">{log.actual_fats}</td>
                          <td className="px-4 py-3 text-sm text-zinc-300 tabular-nums">{log.actual_carbs}</td>
                          <td className="px-4 py-3 text-sm text-zinc-300 tabular-nums">
                            {log.weight ? `${log.weight} кг` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                totalItems={filteredLogs.length}
              />
            </>
          ) : (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800">
              <EmptyState
                icon={Table}
                title="Нет данных для отображения"
                description="Начните вводить данные о питании, чтобы видеть таблицу"
                variant="default"
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'statistics' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">Статистика</h2>

          {statistics ? (
            <div className="space-y-4">
              <section className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                <h3 className="text-sm font-semibold text-zinc-100 mb-4">Общая статистика</h3>
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Дней с данными" value={statistics.daysLogged.toString()} />
                  <StatCard label="Средние калории" value={`${statistics.avgCalories} ккал`} />
                  <StatCard label="Средние белки" value={`${statistics.avgProtein} г`} />
                  <StatCard label="Средние жиры" value={`${statistics.avgFats} г`} />
                  <StatCard label="Средние углеводы" value={`${statistics.avgCarbs} г`} />
                </div>
              </section>

              {statistics.weightChange !== null && (
                <section className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <h3 className="text-sm font-semibold text-zinc-100 mb-4">Динамика веса</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <StatCard
                      label="Изменение веса"
                      value={`${statistics.weightChange > 0 ? '+' : ''}${statistics.weightChange.toFixed(1)} кг`}
                      highlight={statistics.weightChange < 0}
                    />
                    <StatCard label="Начальный вес" value={`${statistics.firstWeight?.toFixed(1)} кг`} />
                    <StatCard label="Текущий вес" value={`${statistics.lastWeight?.toFixed(1)} кг`} />
                    {statistics.minWeight !== null && statistics.maxWeight !== null && (
                      <StatCard
                        label="Диапазон"
                        value={`${statistics.minWeight.toFixed(1)} - ${statistics.maxWeight.toFixed(1)} кг`}
                      />
                    )}
                  </div>
                </section>
              )}

              <section className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                <h3 className="text-sm font-semibold text-zinc-100 mb-4">Суммарные значения</h3>
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Всего калорий" value={`${statistics.totalCalories.toLocaleString()} ккал`} />
                  <StatCard label="Всего белков" value={`${statistics.totalProtein.toLocaleString()} г`} />
                  <StatCard label="Всего жиров" value={`${statistics.totalFats.toLocaleString()} г`} />
                  <StatCard label="Всего углеводов" value={`${statistics.totalCarbs.toLocaleString()} г`} />
                </div>
              </section>
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800">
              <EmptyState
                icon={TrendingUp}
                title="Нет данных для расчета статистики"
                description="Начните вводить данные о питании и весе, чтобы видеть статистику"
                variant="default"
              />
            </div>
          )}
        </div>
      )}

      <PremiumFeatureModal
        isOpen={showPremiumModal}
        onClose={() => {
          setShowPremiumModal(false)
          router.push('/app/dashboard')
        }}
        featureName="Отчеты и аналитика"
      />
    </main>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-emerald-950/20 border border-emerald-800/50' : 'bg-zinc-800 border border-zinc-700'}`}>
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${highlight ? 'text-emerald-300' : 'text-zinc-100'}`}>{value}</p>
    </div>
  )
}
