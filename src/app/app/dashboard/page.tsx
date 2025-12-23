// Дашборд клиента
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { Settings, UtensilsCrossed, TrendingUp, Calendar, Info, ArrowRight, ChevronLeft, ChevronRight, CheckCircle, Trophy } from 'lucide-react'
import DayToggle from '@/components/DayToggle'
import ValidationWarning from '@/components/ValidationWarning'
import ProgressBar from '@/components/ProgressBar'
import { getUserProfile, hasActiveSubscription, type UserProfile } from '@/utils/supabase/profile'
import { checkSubscriptionStatus } from '@/utils/supabase/subscription'
import { validateMeal } from '@/utils/validation/nutrition'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import ChatWidget from '@/components/chat/ChatWidget'
import { checkAchievementsAfterWeightLog } from '@/utils/achievements/check'

type Meal = {
  id: string
  title: string
  weight: number
  calories: number
  protein: number
  fats: number
  carbs: number
  mealDate?: string
  createdAt?: string
}

type DailyLog = {
  date: string
  actual_calories: number
  actual_protein: number
  actual_fats: number
  actual_carbs: number
  weight?: number | null
  meals?: Meal[]
  target_type?: 'training' | 'rest'
  is_completed?: boolean
  completed_at?: string | null
}

type NutritionTarget = {
  calories: number
  protein: number
  fats: number
  carbs: number
  day_type: string
}

export default function ClientDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [dayType, setDayType] = useState<'training' | 'rest'>('training')
  const [targetsTraining, setTargetsTraining] = useState<NutritionTarget | null>(null)
  const [targetsRest, setTargetsRest] = useState<NutritionTarget | null>(null)
  const [weekLogs, setWeekLogs] = useState<DailyLog[]>([])
  const [isPremium, setIsPremium] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null)
  const [editingWeight, setEditingWeight] = useState<boolean>(false)
  const [showAddMealModal, setShowAddMealModal] = useState<boolean>(false)
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]) // Навигация по датам
  const [coachNote, setCoachNote] = useState<{ content: string; date: string } | null>(null) // Заметка тренера
  const [completingDay, setCompletingDay] = useState<boolean>(false) // Состояние завершения дня
  const [reloadKey, setReloadKey] = useState<number>(0) // Триггер перезагрузки данных при возврате на страницу

  // Перезагружаем данные, когда пользователь возвращается на вкладку/страницу
  useEffect(() => {
    const handleFocus = () => setReloadKey((k) => k + 1)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus)
      }
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      logger.debug('Dashboard: начало загрузки данных')
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          logger.warn('Dashboard: пользователь не авторизован', { error: userError?.message })
          router.push('/login')
          return
        }
        logger.debug('Dashboard: пользователь авторизован', { userId: user.id })
        setUser(user)

        // Проверяем Premium статус с автоматическим обновлением
        const userProfile = await getUserProfile(user)
        if (userProfile) {
          // Автоматически проверяем и обновляем статус подписки
          const subscriptionInfo = await checkSubscriptionStatus(user.id)
          // Обновляем профиль с актуальным статусом
          const updatedProfile = { ...userProfile, subscription_status: subscriptionInfo.status }
          setProfile(updatedProfile)
          const premiumStatus = subscriptionInfo.isActive
          setIsPremium(premiumStatus)
          logger.debug('Dashboard: статус Premium', {
            userId: user.id,
            isPremium: premiumStatus,
            subscriptionStatus: subscriptionInfo.status,
            isExpired: subscriptionInfo.isExpired
          })
        }

        // Получаем активные цели питания для обоих типов дней
        logger.debug('Dashboard: загрузка целей питания', { userId: user.id })
        const [trainingResult, restResult] = await Promise.all([
          supabase
            .from('nutrition_targets')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .eq('day_type', 'training')
            .single(),
          supabase
            .from('nutrition_targets')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .eq('day_type', 'rest')
            .single(),
        ])

        if (trainingResult.error && trainingResult.error.code !== 'PGRST116') {
          const error = new Error(trainingResult.error.message || 'Ошибка загрузки целей тренировок')
          logger.error('Dashboard: ошибка загрузки целей тренировок', error, { userId: user.id, code: trainingResult.error.code })
        }
        if (restResult.error && restResult.error.code !== 'PGRST116') {
          const error = new Error(restResult.error.message || 'Ошибка загрузки целей отдыха')
          logger.error('Dashboard: ошибка загрузки целей отдыха', error, { userId: user.id, code: restResult.error.code })
        }

        if (trainingResult.data) {
          setTargetsTraining(trainingResult.data as NutritionTarget)
          logger.debug('Dashboard: цели тренировок загружены', { userId: user.id })
        }
        if (restResult.data) {
          setTargetsRest(restResult.data as NutritionTarget)
          logger.debug('Dashboard: цели отдыха загружены', { userId: user.id })
        }

        // Проверяем, есть ли хотя бы одна цель - если нет, редиректим на onboarding
        if (!trainingResult.data && !restResult.data) {
          logger.info('Dashboard: цели не найдены, редирект на onboarding', { userId: user.id })
          router.push('/onboarding')
          return
        }

        // Устанавливаем дефолтный тип дня на основе наличия данных
        if (trainingResult.data && !restResult.data) {
          setDayType('training')
        } else if (restResult.data && !trainingResult.data) {
          setDayType('rest')
        }

        // Получаем логи за последние 7 дней
        const today = new Date()
        const weekAgo = new Date(today)
        weekAgo.setDate(today.getDate() - 7)
        const todayStr = today.toISOString().split('T')[0]

        logger.debug('Dashboard: загрузка логов за неделю', { userId: user.id })
        const { data: logsData, error: logsError } = await supabase
          .from('daily_logs')
          .select('*, meals') // Явно указываем meals для корректной загрузки JSONB
          .eq('user_id', user.id)
          .gte('date', weekAgo.toISOString().split('T')[0])
          .lte('date', todayStr)
          .order('date', { ascending: false })

        if (logsError) {
          // Если ошибка связана с отсутствием колонки meals, продолжаем работу без неё
          const errorMessage = (logsError as { message?: string })?.message || ''
          if (errorMessage.includes('column daily_logs.meals does not exist')) {
            logger.warn('Dashboard: колонка meals не существует, загружаем данные без meals', { userId: user.id })
            // Повторяем запрос без meals
            const { data: logsDataWithoutMeals, error: logsErrorRetry } = await supabase
              .from('daily_logs')
              .select('date, actual_calories, actual_protein, actual_fats, actual_carbs, weight, hunger_level, energy_level, notes, target_type')
              .eq('user_id', user.id)
              .gte('date', weekAgo.toISOString().split('T')[0])
              .lte('date', todayStr)
              .order('date', { ascending: false })

            if (logsErrorRetry) {
              const error = logsErrorRetry instanceof Error
                ? logsErrorRetry
                : new Error((logsErrorRetry as { message?: string })?.message || 'Ошибка загрузки логов')
              logger.error('Dashboard: ошибка загрузки логов (повторная попытка)', error, { userId: user.id, code: (logsErrorRetry as { code?: string })?.code })
            } else if (logsDataWithoutMeals) {
              // Добавляем пустой массив meals к каждому логу
              const logsWithEmptyMeals = logsDataWithoutMeals.map(log => ({ ...log, meals: [] }))
              setWeekLogs(logsWithEmptyMeals as DailyLog[])
              const todayData = logsWithEmptyMeals.find(log => log.date === selectedDate)
              if (todayData) {
                setTodayLog({ ...todayData, meals: [] } as DailyLog)
              } else {
                setTodayLog(null)
              }
              logger.info('Dashboard: логи загружены без meals (колонка не существует)', { userId: user.id, count: logsWithEmptyMeals.length })
            }
          } else {
            const error = logsError instanceof Error
              ? logsError
              : new Error(errorMessage)
            logger.error('Dashboard: ошибка загрузки логов', error, { userId: user.id, code: (logsError as { code?: string })?.code })
          }
        } else if (logsData) {
          setWeekLogs(logsData as DailyLog[])
          // Находим лог за выбранную дату
          const todayData = logsData.find(log => log.date === selectedDate)
          if (todayData) {
            // Убеждаемся, что meals всегда массив (не null/undefined)
            // Обрабатываем разные случаи: null, undefined, массив, строка JSON
            let mealsArray: Meal[] = []
            if (todayData.meals !== null && todayData.meals !== undefined) {
              if (Array.isArray(todayData.meals)) {
                mealsArray = todayData.meals
              } else if (typeof todayData.meals === 'string') {
                // Если meals пришло как строка (JSON), парсим
                try {
                  mealsArray = JSON.parse(todayData.meals)
                } catch (e) {
                  logger.warn('Dashboard: ошибка парсинга meals', { error: e, meals: todayData.meals })
                  mealsArray = []
                }
              }
            }

            const todayLogData: DailyLog = {
              ...todayData,
              meals: mealsArray
            } as DailyLog
            setTodayLog(todayLogData)
            logger.debug('Dashboard: лог за выбранную дату загружен', {
              userId: user.id,
              date: selectedDate,
              mealsCount: mealsArray.length,
              hasMeals: mealsArray.length > 0,
              mealsType: typeof todayData.meals,
              mealsIsArray: Array.isArray(todayData.meals),
              actualCalories: todayData.actual_calories,
              actualProtein: todayData.actual_protein
            })
          } else {
            // Если нет лога за выбранную дату, не создаем пустой - секция просто не покажется
            setTodayLog(null)
            logger.debug('Dashboard: лог за выбранную дату не найден', { userId: user.id, date: selectedDate })
          }
          logger.info('Dashboard: логи успешно загружены', { userId: user.id, count: logsData.length })
        }
      } catch (error) {
        const errorObj = error instanceof Error
          ? error
          : new Error(String(error))
        logger.error('Dashboard: ошибка загрузки данных', errorObj)
      } finally {
        setLoading(false)
        logger.debug('Dashboard: загрузка данных завершена')
      }
    }

    fetchData()
  }, [router, supabase, selectedDate, reloadKey]) // reloadKey перезагружает данные при возврате на страницу

  // Функция для загрузки данных за выбранную дату
  useEffect(() => {
    const fetchDateData = async () => {
      if (!user) return

      try {
        // Загружаем профиль для проверки Premium и coach_id
        const profile = await getUserProfile(user)
        const isPremiumUser = hasActiveSubscription(profile)

        const { data: logData, error: logError } = await supabase
          .from('daily_logs')
          .select('*, meals')
          .eq('user_id', user.id)
          .eq('date', selectedDate)
          .single()

        if (logError && logError.code !== 'PGRST116') {
          logger.error('Dashboard: ошибка загрузки лога за дату', logError, { userId: user.id, date: selectedDate })
          setTodayLog(null)
          setCoachNote(null)
          return
        }

        if (logData) {
          let mealsArray: Meal[] = []
          if (logData.meals !== null && logData.meals !== undefined) {
            if (Array.isArray(logData.meals)) {
              mealsArray = logData.meals
            } else if (typeof logData.meals === 'string') {
              try {
                mealsArray = JSON.parse(logData.meals)
              } catch (e) {
                logger.warn('Dashboard: ошибка парсинга meals', { error: e })
                mealsArray = []
              }
            }
          }

          setTodayLog({
            ...logData,
            meals: mealsArray
          } as DailyLog)

          // Загружаем заметку тренера для выбранной даты (только для Premium)
          if (isPremiumUser && profile?.coach_id) {
            const { data: noteData } = await supabase
              .from('coach_notes')
              .select('content, date')
              .eq('client_id', user.id)
              .eq('coach_id', profile.coach_id)
              .eq('date', selectedDate)
              .single()

            if (noteData) {
              setCoachNote({ content: noteData.content, date: noteData.date })
            } else {
              setCoachNote(null)
            }
          } else {
            setCoachNote(null)
          }
        } else {
          setTodayLog(null)
          setCoachNote(null)
        }
      } catch (error) {
        logger.error('Dashboard: ошибка загрузки данных за дату', error, { userId: user.id, date: selectedDate })
        setTodayLog(null)
        setCoachNote(null)
      }
    }

    fetchDateData()
  }, [user, selectedDate, supabase, isPremium, reloadKey])

  // Текущие цели в зависимости от выбранного типа дня
  const currentTargets = useMemo(() => {
    return dayType === 'training' ? targetsTraining : targetsRest
  }, [dayType, targetsTraining, targetsRest])

  // Расчет сводки по питанию за неделю
  const nutritionSummary = useMemo(() => {
    if (!currentTargets || weekLogs.length === 0) return null

    const daysLogged = weekLogs.length
    if (daysLogged === 0) return null

    const totalCalories = weekLogs.reduce((sum, log) => sum + (log.actual_calories || 0), 0)
    const totalProtein = weekLogs.reduce((sum, log) => sum + (log.actual_protein || 0), 0)
    const totalFats = weekLogs.reduce((sum, log) => sum + (log.actual_fats || 0), 0)
    const totalCarbs = weekLogs.reduce((sum, log) => sum + (log.actual_carbs || 0), 0)

    const targetCalories = currentTargets.calories * daysLogged
    const targetProtein = currentTargets.protein * daysLogged
    const targetFats = currentTargets.fats * daysLogged
    const targetCarbs = currentTargets.carbs * daysLogged

    return {
      calories: { actual: totalCalories, target: targetCalories, diff: totalCalories - targetCalories },
      protein: { actual: totalProtein, target: targetProtein, diff: totalProtein - targetProtein },
      fats: { actual: totalFats, target: targetFats, diff: totalFats - targetFats },
      carbs: { actual: totalCarbs, target: targetCarbs, diff: totalCarbs - targetCarbs },
      daysLogged
    }
  }, [currentTargets, weekLogs])

  // Removed unused workoutSummary

  if (loading) return <div className="p-8 text-center">Загрузка...</div>

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans space-y-6">

      {/* HEADER */}
      <header className="flex justify-between items-center">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
          {/* Date Navigation */}
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => {
                const date = new Date(selectedDate)
                date.setDate(date.getDate() - 1)
                setSelectedDate(date.toISOString().split('T')[0])
              }}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
              title="Предыдущий день"
            >
              <ChevronLeft size={16} className="text-gray-600" />
            </button>
            <button
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'date'
                input.max = new Date().toISOString().split('T')[0]
                input.value = selectedDate
                input.onchange = (e) => {
                  const target = e.target as HTMLInputElement
                  if (target.value) {
                    setSelectedDate(target.value)
                  }
                }
                input.click()
              }}
              className="text-sm text-gray-700 hover:text-gray-900 font-medium flex items-center gap-1"
            >
              <Calendar size={14} />
              {selectedDate === new Date().toISOString().split('T')[0] ? (
                <span>Сегодня, {new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>
              ) : (
                <span>{new Date(selectedDate).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}</span>
              )}
            </button>
            <button
              onClick={() => {
                const today = new Date().toISOString().split('T')[0]
                const date = new Date(selectedDate)
                date.setDate(date.getDate() + 1)
                const nextDate = date.toISOString().split('T')[0]
                if (nextDate <= today) {
                  setSelectedDate(nextDate)
                }
              }}
              disabled={selectedDate >= new Date().toISOString().split('T')[0]}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Следующий день"
            >
              <ChevronRight size={16} className="text-gray-600" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/app/achievements')}
            className="h-8 w-8 flex items-center justify-center bg-yellow-100 rounded-full hover:bg-yellow-200 transition-colors"
            title="Достижения"
          >
            <Trophy size={16} className="text-yellow-700" />
          </button>
          <button
            onClick={() => router.push('/app/settings')}
            className="h-8 w-8 flex items-center justify-center bg-gray-200 rounded-full hover:bg-gray-300 transition-colors"
            title="Настройки"
          >
            <Settings size={16} className="text-gray-600" />
          </button>
        </div>
      </header>

      {/* DAY TYPE TOGGLE */}
      {(targetsTraining || targetsRest) && (
        <div>
          <DayToggle value={dayType} onChange={setDayType} />
        </div>
      )}

      {/* СВОДКА ЗА ВЫБРАННУЮ ДАТУ */}
      {todayLog && (
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <UtensilsCrossed size={20} />
              {selectedDate === new Date().toISOString().split('T')[0] ? 'Сегодня' : new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
            </h2>
            {!todayLog.is_completed ? (
              <button
                onClick={() => router.push(`/app/nutrition?date=${selectedDate}`)}
                className="text-sm text-black underline decoration-dotted"
              >
                Редактировать
              </button>
            ) : (
              <span className="text-xs text-gray-500">День завершен</span>
            )}
          </div>

          {/* КБЖУ за сегодня */}
          {(() => {
            // Определяем текущие цели в зависимости от типа дня
            const currentTargets = todayLog.target_type === 'rest' ? targetsRest : targetsTraining
            const showTargets = isPremium && currentTargets

            if (showTargets && currentTargets) {
              return (
                <div className="space-y-3 mb-4">
                  <ProgressBar
                    label="Калории"
                    current={todayLog.actual_calories || 0}
                    target={currentTargets.calories}
                    unit="ккал"
                  />
                  <ProgressBar
                    label="Белки"
                    current={todayLog.actual_protein || 0}
                    target={currentTargets.protein}
                    unit="г"
                  />
                  <ProgressBar
                    label="Жиры"
                    current={todayLog.actual_fats || 0}
                    target={currentTargets.fats}
                    unit="г"
                  />
                  <ProgressBar
                    label="Углеводы"
                    current={todayLog.actual_carbs || 0}
                    target={currentTargets.carbs}
                    unit="г"
                  />
                </div>
              )
            }

            // Если нет целей, показываем просто значения
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500 mb-1">Калории</div>
                  <div className="text-lg font-bold text-gray-900">
                    {todayLog.actual_calories || 0} ккал
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500 mb-1">Белки</div>
                  <div className="text-lg font-bold text-gray-900">
                    {todayLog.actual_protein || 0} г
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500 mb-1">Жиры</div>
                  <div className="text-lg font-bold text-gray-900">
                    {todayLog.actual_fats || 0} г
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500 mb-1">Углеводы</div>
                  <div className="text-lg font-bold text-gray-900">
                    {todayLog.actual_carbs || 0} г
                  </div>
                </div>
              </div>
            )
          })()}

          {/* БЫСТРЫЕ ДЕЙСТВИЯ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {/* Вес - кликабельный блок */}
            {(() => {
              const lastWeightLog = weekLogs
                .filter(log => log.date === selectedDate && log.weight !== null)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

              const currentWeight = todayLog.weight || lastWeightLog?.weight || null

              return (
                <div
                  className="rounded-lg border-2 border-dashed border-gray-300 p-4 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
                  onClick={() => setEditingWeight(true)}
                >
                  <div className="text-xs text-gray-500 mb-1">Вес тела</div>
                  {editingWeight ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        defaultValue={currentWeight || ''}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={async (e) => {
                          const newWeight = e.target.value ? parseFloat(e.target.value) : null
                          if (newWeight !== null && newWeight !== currentWeight) {
                            const { data: existingLog } = await supabase
                              .from('daily_logs')
                              .select('*')
                              .eq('user_id', user?.id)
                              .eq('date', selectedDate)
                              .single()

                            if (existingLog) {
                              const { error } = await supabase
                                .from('daily_logs')
                                .update({ weight: newWeight })
                                .eq('user_id', user?.id)
                                .eq('date', selectedDate)

                              if (!error) {
                                // Проверяем достижения после успешного сохранения веса
                                checkAchievementsAfterWeightLog().catch((err) => {
                                  logger.warn('Dashboard: ошибка проверки достижений после записи веса', { error: err })
                                })
                              }
                            } else {
                              const { error } = await supabase
                                .from('daily_logs')
                                .insert({
                                  user_id: user?.id,
                                  date: selectedDate,
                                  weight: newWeight,
                                  actual_calories: todayLog?.actual_calories || 0,
                                  actual_protein: todayLog?.actual_protein || 0,
                                  actual_fats: todayLog?.actual_fats || 0,
                                  actual_carbs: todayLog?.actual_carbs || 0,
                                  meals: todayLog?.meals || []
                                })

                              if (!error) {
                                // Проверяем достижения после успешного сохранения веса
                                checkAchievementsAfterWeightLog().catch((err) => {
                                  logger.warn('Dashboard: ошибка проверки достижений после записи веса', { error: err })
                                })
                              }
                            }
                            router.refresh()
                          }
                          setEditingWeight(false)
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const newWeight = (e.target as HTMLInputElement).value ? parseFloat((e.target as HTMLInputElement).value) : null
                            if (newWeight !== null && newWeight !== currentWeight) {
                              const { data: existingLog } = await supabase
                                .from('daily_logs')
                                .select('*')
                                .eq('user_id', user?.id)
                                .eq('date', selectedDate)
                                .single()

                              if (existingLog) {
                                const { error } = await supabase
                                  .from('daily_logs')
                                  .update({ weight: newWeight })
                                  .eq('user_id', user?.id)
                                  .eq('date', selectedDate)

                                if (!error) {
                                  // Проверяем достижения после успешного сохранения веса
                                  checkAchievementsAfterWeightLog().catch((err) => {
                                    logger.warn('Dashboard: ошибка проверки достижений после записи веса', { error: err })
                                  })
                                }
                              } else {
                                const { error } = await supabase
                                  .from('daily_logs')
                                  .insert({
                                    user_id: user?.id,
                                    date: selectedDate,
                                    weight: newWeight,
                                    actual_calories: todayLog?.actual_calories || 0,
                                    actual_protein: todayLog?.actual_protein || 0,
                                    actual_fats: todayLog?.actual_fats || 0,
                                    actual_carbs: todayLog?.actual_carbs || 0,
                                    meals: todayLog?.meals || []
                                  })

                                if (!error) {
                                  // Проверяем достижения после успешного сохранения веса
                                  checkAchievementsAfterWeightLog().catch((err) => {
                                    logger.warn('Dashboard: ошибка проверки достижений после записи веса', { error: err })
                                  })
                                }
                              }
                              router.refresh()
                            }
                            setEditingWeight(false)
                          }
                        }}
                        className="w-full p-2 border border-gray-300 rounded text-base font-bold text-black focus:ring-2 focus:ring-black outline-none"
                        autoFocus
                        placeholder="Введите вес"
                      />
                      <span className="text-sm text-gray-600 font-medium">кг</span>
                    </div>
                  ) : (
                    <div className="text-lg font-bold text-gray-900">
                      {currentWeight ? `${currentWeight} кг` : 'Нажмите, чтобы добавить'}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Кнопка "Ввести питание" */}
            {!todayLog.is_completed ? (
              <button
                onClick={() => {
                  router.push(`/app/nutrition?date=${selectedDate}`)
                }}
                className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-left hover:border-gray-400 hover:bg-gray-50 transition-colors"
                title="Ввести питание"
              >
                <div className="text-xs text-gray-500 mb-1">Ввести питание</div>
                <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <UtensilsCrossed size={18} />
                  <span>Открыть</span>
                </div>
              </button>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 bg-gray-50 text-left opacity-50">
                <div className="text-xs text-gray-500 mb-1">Ввести питание</div>
                <div className="text-lg font-bold text-gray-600">
                  Недоступно
                </div>
              </div>
            )}
          </div>

          {/* Приемы пищи за сегодня */}
          <div className="pt-4 border-t border-gray-100 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">
                Приемы пищи за сегодня ({Array.isArray(todayLog.meals) ? todayLog.meals.length : 0})
              </h3>
            </div>

            {/* Показываем предупреждение, если есть данные КБЖУ, но нет детализации по приемам */}
            {(!Array.isArray(todayLog.meals) || todayLog.meals.length === 0) &&
              (todayLog.actual_calories > 0 || todayLog.actual_protein > 0 || todayLog.actual_fats > 0 || todayLog.actual_carbs > 0) && (
                <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm font-medium text-yellow-800 mb-1">⚠️ Данные сохранены без детализации</p>
                  <p className="text-xs text-yellow-700">
                    У вас есть данные о питании за сегодня ({todayLog.actual_calories} ккал), но приемы пищи не детализированы.
                    Добавьте приемы пищи для более точного учета.
                  </p>
                </div>
              )}

            {Array.isArray(todayLog.meals) && todayLog.meals.length > 0 ? (
              <div className="space-y-2">
                {todayLog.meals.map((meal, index) => (
                  <div
                    key={meal.id}
                    className="flex items-start justify-between p-4 bg-gray-50 rounded-lg gap-3 hover:bg-gray-100 transition-colors cursor-pointer border border-transparent hover:border-gray-200"
                    onClick={() => {
                      if (!todayLog.is_completed) {
                        router.push(`/app/nutrition?edit=${meal.id}&date=${selectedDate}`)
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-gray-400 bg-white px-2 py-0.5 rounded">
                          #{index + 1}
                        </span>
                        <div className="text-sm font-semibold text-gray-900">{meal.title}</div>
                      </div>
                      {meal.mealDate && meal.mealDate !== new Date().toISOString().split('T')[0] && (
                        <div className="text-xs text-gray-400 mb-1">
                          Дата: {new Date(meal.mealDate).toLocaleDateString('ru-RU')}
                        </div>
                      )}
                      <div className="text-xs text-gray-600 space-y-0.5">
                        <div className="font-medium">{meal.calories} ккал</div>
                        <div>Белки: {meal.protein}г • Жиры: {meal.fats}г • Углеводы: {meal.carbs}г</div>
                        {meal.weight > 0 && (
                          <div className="text-gray-500">Вес порции: {meal.weight}г</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!todayLog.is_completed) {
                            router.push(`/app/nutrition?edit=${meal.id}&date=${selectedDate}`)
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                        title="Редактировать прием пищи"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (todayLog.is_completed) {
                            toast.error('День завершен. Редактирование недоступно.')
                            return
                          }
                          if (!confirm('Удалить этот прием пищи?')) return

                          const updatedMeals = (todayLog.meals || []).filter(m => m.id !== meal.id)

                          // Пересчитываем totals из оставшихся meals за выбранную дату
                          const dateMeals = updatedMeals.filter(m => (m.mealDate || selectedDate) === selectedDate)
                          const newTotals = dateMeals.reduce(
                            (acc, m) => ({
                              calories: acc.calories + (m.calories || 0),
                              protein: acc.protein + (m.protein || 0),
                              fats: acc.fats + (m.fats || 0),
                              carbs: acc.carbs + (m.carbs || 0)
                            }),
                            { calories: 0, protein: 0, fats: 0, carbs: 0 }
                          )

                          const { data: existingLog } = await supabase
                            .from('daily_logs')
                            .select('*')
                            .eq('user_id', user?.id)
                            .eq('date', selectedDate)
                            .single()

                          if (existingLog) {
                            await supabase
                              .from('daily_logs')
                              .update({
                                meals: updatedMeals,
                                actual_calories: newTotals.calories,
                                actual_protein: newTotals.protein,
                                actual_fats: newTotals.fats,
                                actual_carbs: newTotals.carbs
                              })
                              .eq('user_id', user?.id)
                              .eq('date', selectedDate)
                          }
                          router.refresh()
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
                        title="Удалить прием пищи"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                {!todayLog.is_completed && (
                  <div className="pt-2 text-center">
                    <button
                      onClick={() => setShowAddMealModal(true)}
                      className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
                    >
                      + Добавить еще один прием пищи
                    </button>
                  </div>
                )}
              </div>
            ) : (
              !todayLog.is_completed ? (
                <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">
                  <p className="text-gray-500 text-sm mb-3">Нет приемов пищи за сегодня</p>
                  <button
                    onClick={() => setShowAddMealModal(true)}
                    className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                  >
                    + Добавить первый прием пищи
                  </button>
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">
                  <p className="text-gray-500 text-sm">День завершен. Редактирование недоступно.</p>
                </div>
              )
            )}
          </div>

          {/* БЛОК ЗАВЕРШЕНИЯ ДНЯ - показываем только для сегодняшней даты */}
          {selectedDate <= new Date().toISOString().split('T')[0] && (() => {
            // Проверяем условия для блокировки кнопки
            const hasWeight = todayLog.weight !== null && todayLog.weight !== undefined
            const hasMeals = Array.isArray(todayLog.meals) && todayLog.meals.length > 0
            const hasCalories = todayLog.actual_calories > 0
            const canComplete = hasWeight && (hasMeals || hasCalories)

            return (
              <div className="pt-4 border-t border-gray-100 mt-4">
                {todayLog.is_completed ? (
                  <div className="text-center py-4">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium mb-2">
                      <CheckCircle size={16} />
                      День завершен
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {todayLog.completed_at && `Завершен: ${new Date(todayLog.completed_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={async () => {
                        if (!user) return

                        if (!hasWeight) {
                          toast.error('Пожалуйста, введите вес перед завершением дня')
                          return
                        }

                        if (!hasMeals && !hasCalories) {
                          toast.error('Пожалуйста, добавьте хотя бы один прием пищи перед завершением дня')
                          return
                        }

                        setCompletingDay(true)
                        try {
                          const { error } = await supabase
                            .from('daily_logs')
                            .update({
                              is_completed: true,
                              completed_at: new Date().toISOString()
                            })
                            .eq('user_id', user.id)
                            .eq('date', selectedDate)

                          if (error) {
                            throw error
                          }

                          // Обновляем локальное состояние
                          setTodayLog(prev => prev ? { ...prev, is_completed: true, completed_at: new Date().toISOString() } : null)

                          // Показываем сообщение
                          if (isPremium) {
                            toast.success('День завершен! Тренер получит уведомление.')
                          } else {
                            // Подсчитываем стрик (дни подряд)
                            const completedDates = weekLogs
                              .filter(log => log.is_completed)
                              .map(log => log.date)
                              .sort()
                              .reverse()

                            let streak = 1
                            const today = new Date().toISOString().split('T')[0]
                            for (let i = 0; i < completedDates.length; i++) {
                              const date = new Date(completedDates[i])
                              date.setDate(date.getDate() + 1)
                              const nextDate = date.toISOString().split('T')[0]
                              if (nextDate === (i === 0 ? today : completedDates[i - 1])) {
                                streak++
                              } else {
                                break
                              }
                            }

                            toast.success(`День завершен! Вы молодец! 🎉 Стрик: ${streak} ${streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'}`)
                          }

                          router.refresh()
                        } catch (error) {
                          logger.error('Dashboard: ошибка завершения дня', error, { userId: user.id, date: selectedDate })
                          toast.error('Ошибка при завершении дня. Попробуйте еще раз.')
                        } finally {
                          setCompletingDay(false)
                        }
                      }}
                      disabled={completingDay || todayLog.is_completed || !canComplete}
                      className="w-full py-4 bg-black text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {completingDay ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          Завершение...
                        </>
                      ) : (
                        <>
                          <CheckCircle size={20} />
                          Завершить день
                        </>
                      )}
                    </button>
                    {!canComplete && !todayLog.is_completed && (
                      <div className="mt-3 text-center">
                        <p className="text-sm text-gray-500">
                          {!hasWeight && !hasMeals && !hasCalories && (
                            <>Введите вес и добавьте хотя бы один прием пищи для завершения дня</>
                          )}
                          {hasWeight && !hasMeals && !hasCalories && (
                            <>Добавьте хотя бы один прием пищи для завершения дня</>
                          )}
                          {!hasWeight && (hasMeals || hasCalories) && (
                            <>Введите вес для завершения дня</>
                          )}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })()}
        </section>
      )}

      {/* ЗАМЕТКА ТРЕНЕРА (Premium) */}
      {isPremium && coachNote && (
        <section className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl">💬</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">Сообщение от тренера</h3>
              <p className="text-sm text-blue-800 whitespace-pre-line">{coachNote.content}</p>
              <p className="text-xs text-blue-600 mt-2">
                {new Date(coachNote.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ЗАГЛУШКА ДЛЯ ИСТЕКШЕЙ ПОДПИСКИ */}
      {!isPremium && profile?.subscription_status === 'expired' && (
        <section className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl">🔒</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Заметки от тренера</h3>
              <p className="text-sm text-gray-600 mb-3">
                Эта функция доступна только с активной Premium подпиской.
              </p>
              <button
                onClick={() => router.push('/app/settings?tab=subscription')}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Продлить подписку
              </button>
            </div>
          </div>
        </section>
      )}

      {/* МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ ПРИЕМА ПИЩИ */}
      {showAddMealModal && (
        <AddMealModal
          onClose={() => setShowAddMealModal(false)}
          selectedDate={selectedDate}
          userId={user?.id}
          onSave={async (mealData) => {
            const mealDate = mealData.mealDate || selectedDate

            // Получаем существующие meals для выбранной даты
            const { data: existingLog } = await supabase
              .from('daily_logs')
              .select('meals')
              .eq('user_id', user?.id)
              .eq('date', mealDate)
              .single()

            const existingMeals: Meal[] = (existingLog?.meals as Meal[]) || []
            const newMeal: Meal = {
              id: crypto.randomUUID(),
              title: mealData.title,
              weight: mealData.weight,
              calories: mealData.calories,
              protein: mealData.protein,
              fats: mealData.fats,
              carbs: mealData.carbs,
              mealDate: mealDate,
              createdAt: new Date().toISOString()
            }

            const allMeals = [...existingMeals, newMeal]

            // Пересчитываем totals для выбранной даты
            const dateMeals = allMeals.filter(m => (m.mealDate || mealDate) === mealDate)
            const totals = dateMeals.reduce(
              (acc, m) => ({
                calories: acc.calories + (m.calories || 0),
                protein: acc.protein + (m.protein || 0),
                fats: acc.fats + (m.fats || 0),
                carbs: acc.carbs + (m.carbs || 0)
              }),
              { calories: 0, protein: 0, fats: 0, carbs: 0 }
            )

            // Проверяем, существует ли лог за эту дату
            const { data: dateLog } = await supabase
              .from('daily_logs')
              .select('*')
              .eq('user_id', user?.id)
              .eq('date', mealDate)
              .single()

            if (dateLog) {
              await supabase
                .from('daily_logs')
                .update({
                  meals: allMeals,
                  actual_calories: totals.calories,
                  actual_protein: totals.protein,
                  actual_fats: totals.fats,
                  actual_carbs: totals.carbs
                })
                .eq('user_id', user?.id)
                .eq('date', mealDate)
            } else {
              await supabase
                .from('daily_logs')
                .insert({
                  user_id: user?.id,
                  date: mealDate,
                  meals: allMeals,
                  actual_calories: totals.calories,
                  actual_protein: totals.protein,
                  actual_fats: totals.fats,
                  actual_carbs: totals.carbs,
                  weight: null,
                  hunger_level: 3,
                  energy_level: 5,
                  notes: ''
                })
            }

            setShowAddMealModal(false)
            router.refresh()
          }}
        />
      )}

      {/* ВЕС */}
      {(() => {
        const weightLogs = weekLogs
          .filter(log => log.weight)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        if (weightLogs.length === 0) return null

        const firstWeight = weightLogs[0].weight!
        const lastWeight = weightLogs[weightLogs.length - 1].weight!
        const weightDiff = lastWeight - firstWeight

        return (
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Вес</h2>
            <div className="space-y-3">
              {weightLogs.slice(-7).map(log => (
                <div key={log.date} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-600">
                    {new Date(log.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-lg font-bold text-gray-900">{log.weight} кг</span>
                </div>
              ))}
              {weightLogs.length >= 2 && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Изменение:</span>
                    <span className={`text-sm font-semibold ${weightDiff < 0 ? 'text-green-600' : weightDiff > 0 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                      {weightDiff !== 0 ? `${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)} кг` : '0 кг'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )
      })()}

      {/* СВОДКА ПО ПИТАНИЮ */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <UtensilsCrossed size={20} />
            Питание за неделю
          </h2>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              try {
                router.push('/app/nutrition')
              } catch (error) {
                console.error('Ошибка перехода на страницу питания:', error)
                window.location.href = '/app/nutrition'
              }
            }}
            className="text-sm text-black underline decoration-dotted flex items-center gap-1"
          >
            Ввести данные
            <ArrowRight size={14} />
          </button>
        </div>

        {nutritionSummary && nutritionSummary.daysLogged > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                label="Калории"
                value={`${Math.round(nutritionSummary.calories.actual / nutritionSummary.daysLogged)}`}
                target={currentTargets?.calories || 0}
                unit="ккал/день"
              />
              <StatCard
                label="Белки"
                value={`${Math.round(nutritionSummary.protein.actual / nutritionSummary.daysLogged)}`}
                target={currentTargets?.protein || 0}
                unit="г/день"
              />
            </div>

            <div className="pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Дней с отчетами:</span>
                <span className="font-semibold text-gray-900">{nutritionSummary.daysLogged} из 7</span>
              </div>
              {nutritionSummary.calories.diff > 0 ? (
                <div className="mt-2 text-sm text-red-600 flex items-center gap-1">
                  <TrendingUp size={14} />
                  Профицит: +{Math.round(nutritionSummary.calories.diff / nutritionSummary.daysLogged)} ккал/день
                </div>
              ) : nutritionSummary.calories.diff < 0 ? (
                <div className="mt-2 text-sm text-green-600 flex items-center gap-1">
                  <TrendingUp size={14} className="rotate-180" />
                  Дефицит: {Math.round(nutritionSummary.calories.diff / nutritionSummary.daysLogged)} ккал/день
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-600">В норме</div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-gray-500 text-sm">
            <p className="mb-3">Нет данных за неделю</p>
            <button
              onClick={() => router.push(`/app/nutrition?date=${selectedDate}`)}
              className="text-sm text-black underline decoration-dotted"
            >
              Начать вводить данные
            </button>
          </div>
        )}
      </section>

      {/* ТРЕНИРОВКИ (заглушка) */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar size={20} />
          Тренировки
        </h2>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold mb-1">Функция в разработке</p>
              <p>Отслеживание тренировок будет доступно в ближайшее время.</p>
            </div>
          </div>
        </div>
      </section>

      {/* АКТИВНЫЕ ПРОГРАММЫ */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Активные программы</h2>

        {currentTargets ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-900">План питания ({dayType === 'training' ? 'Тренировка' : 'Отдых'})</span>
                <span className="text-xs text-gray-500 bg-green-100 text-green-700 px-2 py-1 rounded-full">Активна</span>
              </div>
              <p className="text-sm text-gray-600">
                {currentTargets.calories} ккал/день • {currentTargets.protein}г белка • {currentTargets.fats}г жиров • {currentTargets.carbs}г углеводов
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            Нет активных программ
          </div>
        )}
      </section>

      {/* БЫСТРЫЕ ДЕЙСТВИЯ */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Быстрые действия</h2>
        <div className="space-y-3">
          {isPremium ? (
            <button
              onClick={() => router.push('/app/reports')}
              className="w-full p-4 bg-gray-100 text-black rounded-xl font-bold flex items-center justify-between hover:bg-gray-200 transition-colors"
            >
              <span className="flex items-center gap-2">
                <TrendingUp size={20} />
                Отчеты и аналитика
              </span>
              <ArrowRight size={20} />
            </button>
          ) : (
            <div className="w-full p-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl text-center">
              <p className="text-sm text-gray-600 mb-2">Отчеты и аналитика</p>
              <p className="text-xs text-gray-500 mb-3">Доступно с Premium подпиской</p>
              <button
                onClick={() => router.push('/app/settings?tab=subscription')}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Перейти на Premium
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Chat Widget для Premium клиентов с назначенным тренером */}
      {isPremium && profile?.coach_id && user && (
        <ChatWidget userId={user.id} coachId={profile.coach_id || null} />
      )}
    </main>
  )
}

function StatCard({ label, value, target, unit }: { label: string; value: string; target: number; unit: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold text-gray-900">{value}</span>
        <span className="text-xs text-gray-500">/ {target}</span>
      </div>
      <div className="text-xs text-gray-400 mt-1">{unit}</div>
    </div>
  )
}

// Компонент модального окна для добавления приема пищи
type AddMealModalProps = {
  onClose: () => void
  onSave: (meal: {
    title: string
    weight: number
    calories: number
    protein: number
    fats: number
    carbs: number
    mealDate: string
  }) => Promise<void>
  selectedDate?: string
  userId?: string
}

function AddMealModal({ onClose, onSave, selectedDate, userId }: AddMealModalProps) {
  const supabase = createClient()
  const [mealData, setMealData] = useState({
    title: '',
    weight: 100,
    calories: 0,
    protein: 0,
    fats: 0,
    carbs: 0,
    mealDate: selectedDate || new Date().toISOString().split('T')[0]
  })
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'new' | 'recent' | 'copy'>('new')
  const [recentMeals, setRecentMeals] = useState<Meal[]>([])
  const [yesterdayMeals, setYesterdayMeals] = useState<Meal[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)

  // Валидация приема пищи
  const mealValidation = useMemo(() => {
    return validateMeal({
      calories: mealData.calories,
      protein: mealData.protein,
      fats: mealData.fats,
      carbs: mealData.carbs,
      weight: mealData.weight,
    })
  }, [mealData])

  const getMealNameByTime = (hour: number = new Date().getHours()): string => {
    if (hour >= 6 && hour < 10) return 'Завтрак'
    if (hour >= 10 && hour < 13) return 'Второй завтрак'
    if (hour >= 13 && hour < 16) return 'Обед'
    if (hour >= 16 && hour < 20) return 'Полдник'
    if (hour >= 20 || hour < 6) return 'Ужин'
    return 'Прием пищи'
  }

  // Загружаем недавние приемы пищи и вчерашние
  useEffect(() => {
    const loadData = async () => {
      if (!userId) return

      setLoadingRecent(true)
      try {
        // Загружаем логи за последние 7 дней для получения недавних приемов пищи
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const { data: logs } = await supabase
          .from('daily_logs')
          .select('meals')
          .eq('user_id', userId)
          .gte('date', weekAgo.toISOString().split('T')[0])
          .order('date', { ascending: false })
          .limit(7)

        // Собираем уникальные приемы пищи (по названию)
        const uniqueMeals = new Map<string, Meal>()
        logs?.forEach(log => {
          if (log.meals && Array.isArray(log.meals)) {
            (log.meals as Meal[]).forEach(meal => {
              if (!uniqueMeals.has(meal.title.toLowerCase())) {
                uniqueMeals.set(meal.title.toLowerCase(), meal)
              }
            })
          }
        })
        setRecentMeals(Array.from(uniqueMeals.values()).slice(0, 10))

        // Загружаем вчерашние приемы пищи
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toISOString().split('T')[0]
        const { data: yesterdayLog } = await supabase
          .from('daily_logs')
          .select('meals')
          .eq('user_id', userId)
          .eq('date', yesterdayStr)
          .single()

        if (yesterdayLog?.meals && Array.isArray(yesterdayLog.meals)) {
          setYesterdayMeals(yesterdayLog.meals as Meal[])
        }
      } catch (error) {
        logger.error('AddMealModal: ошибка загрузки данных', error)
      } finally {
        setLoadingRecent(false)
      }
    }

    loadData()
  }, [userId, supabase])

  useEffect(() => {
    // Устанавливаем дефолтное название по времени
    if (!mealData.title && activeTab === 'new') {
      setMealData(prev => ({ ...prev, title: getMealNameByTime() }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleSave = async () => {
    if (!mealData.title.trim()) {
      toast.error('Введите название приема пищи')
      return
    }

    // Проверка валидации перед сохранением
    if (!mealValidation.valid) {
      const errorMessage = mealValidation.errors.join('; ')
      toast.error(`Ошибки валидации: ${errorMessage}`)
      return
    }

    setSaving(true)
    try {
      await onSave(mealData)
    } catch (error) {
      console.error('Ошибка сохранения приема пищи:', error)
      toast.error('Ошибка сохранения. Попробуйте еще раз.')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyFromYesterday = (meal: Meal) => {
    setMealData({
      title: meal.title,
      weight: meal.weight,
      calories: meal.calories,
      protein: meal.protein,
      fats: meal.fats,
      carbs: meal.carbs,
      mealDate: selectedDate || new Date().toISOString().split('T')[0]
    })
    setActiveTab('new')
  }

  const handleSelectRecent = (meal: Meal) => {
    setMealData({
      title: meal.title,
      weight: meal.weight,
      calories: meal.calories,
      protein: meal.protein,
      fats: meal.fats,
      carbs: meal.carbs,
      mealDate: selectedDate || new Date().toISOString().split('T')[0]
    })
    setActiveTab('new')
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full sm:max-w-md sm:mx-auto p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Добавить прием пищи</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 mb-4">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'new'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            Новый
          </button>
          <button
            onClick={() => setActiveTab('recent')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'recent'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            Недавние ({recentMeals.length})
          </button>
          {yesterdayMeals.length > 0 && (
            <button
              onClick={() => setActiveTab('copy')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'copy'
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Вчера ({yesterdayMeals.length})
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'new' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата приема пищи</label>
              <input
                type="date"
                value={mealData.mealDate}
                onChange={(e) => setMealData({ ...mealData, mealDate: e.target.value })}
                max={new Date().toISOString().split('T')[0]}
                className="w-full p-2 border border-gray-200 rounded-lg text-sm text-black"
              />
              <p className="text-xs text-gray-500 mt-1">Выберите дату, если забыли внести ранее</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
              <input
                type="text"
                value={mealData.title}
                onChange={(e) => setMealData({ ...mealData, title: e.target.value })}
                placeholder={getMealNameByTime()}
                className="w-full p-2 border border-gray-200 rounded-lg text-sm text-black"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Вес (г)</label>
                <input
                  type="number"
                  value={mealData.weight}
                  onChange={(e) => setMealData({ ...mealData, weight: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm text-black"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Калории</label>
                <input
                  type="number"
                  value={mealData.calories}
                  onChange={(e) => setMealData({ ...mealData, calories: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm text-black"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Белки (г)</label>
                <input
                  type="number"
                  value={mealData.protein}
                  onChange={(e) => setMealData({ ...mealData, protein: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm text-black"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Жиры (г)</label>
                <input
                  type="number"
                  value={mealData.fats}
                  onChange={(e) => setMealData({ ...mealData, fats: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm text-black"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Углеводы (г)</label>
                <input
                  type="number"
                  value={mealData.carbs}
                  onChange={(e) => setMealData({ ...mealData, carbs: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm text-black"
                />
              </div>
            </div>

            {/* Валидация приема пищи */}
            {mealValidation.errors.length > 0 || mealValidation.warnings.length > 0 ? (
              <ValidationWarning
                errors={mealValidation.errors}
                warnings={mealValidation.warnings}
              />
            ) : null}

            <div className="flex gap-3 pt-4">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !mealValidation.valid}
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </>
        )}

        {activeTab === 'recent' && (
          <div className="space-y-2">
            {loadingRecent ? (
              <div className="text-center py-4 text-gray-500 text-sm">Загрузка...</div>
            ) : recentMeals.length > 0 ? (
              recentMeals.map((meal, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectRecent(meal)}
                  className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium text-gray-900">{meal.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {meal.calories} ккал • Б {meal.protein}г / Ж {meal.fats}г / У {meal.carbs}г
                  </div>
                </button>
              ))
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">Нет недавних приемов пищи</div>
            )}
          </div>
        )}

        {activeTab === 'copy' && (
          <div className="space-y-2">
            {yesterdayMeals.length > 0 ? (
              yesterdayMeals.map((meal, idx) => (
                <button
                  key={idx}
                  onClick={() => handleCopyFromYesterday(meal)}
                  className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium text-gray-900">{meal.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {meal.calories} ккал • Б {meal.protein}г / Ж {meal.fats}г / У {meal.carbs}г
                  </div>
                </button>
              ))
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">Нет приемов пищи за вчера</div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}

