// Дашборд клиента
'use client'

import { useEffect, useMemo, useState, useRef, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { UtensilsCrossed, TrendingUp, Calendar, Info, ArrowRight, ChevronLeft, ChevronRight, CheckCircle, Flame, Inbox, X } from 'lucide-react'
import DayToggle from '@/components/DayToggle'
import ProgressBar from '@/components/ProgressBar'
import { getMotivationalMessage } from '@/utils/progress/motivationalMessages'
// Lazy load chart component for code splitting
const MiniProgressChart = lazy(() => import('@/components/charts/MiniProgressChart'))
import ConfirmModal from '@/components/modals/ConfirmModal'
import EmptyState from '@/components/EmptyState'
import SkeletonLoader from '@/components/SkeletonLoader'
import DateNavigation from '@/components/DateNavigation'
import { getUserProfile, hasActiveSubscription, type UserProfile } from '@/utils/supabase/profile'
import { checkSubscriptionStatus } from '@/utils/supabase/subscription'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import { checkAchievementsAfterWeightLog } from '@/utils/achievements/check'
import { usePageView } from '@/hooks/useAnalytics'

type Meal = {
  id: string
  title: string
  weight: number
  per100: {
    calories: number
    protein: number
    fats: number
    carbs: number
  }
  totals: {
    calories: number
    protein: number
    fats: number
    carbs: number
  }
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

  // Отслеживаем просмотр страницы
  usePageView('dashboard')
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
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]) // Навигация по датам
  const [curatorNote, setCuratorNote] = useState<{ content: string; date: string } | null>(null) // Заметка куратора
  const [completingDay, setCompletingDay] = useState<boolean>(false) // Состояние завершения дня
  const [reloadKey, setReloadKey] = useState<number>(0) // Триггер перезагрузки данных при возврате на страницу
  const [deleteMealModal, setDeleteMealModal] = useState<{ isOpen: boolean; mealId: string | null }>({ isOpen: false, mealId: null })

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
          // Данные уже нормализованы триггером БД, используем напрямую
          const processedLogs = logsData.map(log => {
            let mealsArray: Meal[] = []
            if (log.meals !== null && log.meals !== undefined) {
              if (Array.isArray(log.meals)) {
                // Проверяем структуру meals - если это старая структура, нормализуем
                mealsArray = (log.meals as any[]).map((m: any) => {
                  // Если это новая структура (есть per100 и totals), используем как есть
                  if (m && typeof m === 'object' && m.per100 && m.totals) {
                    return m as Meal
                  }
                  // Если это старая структура, преобразуем
                  return {
                    id: m.id,
                    title: m.title || '',
                    weight: m.weight || 0,
                    per100: {
                      calories: m.caloriesPer100 || 0,
                      protein: m.proteinPer100 || 0,
                      fats: m.fatsPer100 || 0,
                      carbs: m.carbsPer100 || 0
                    },
                    totals: {
                      calories: m.calories || 0,
                      protein: m.protein || 0,
                      fats: m.fats || 0,
                      carbs: m.carbs || 0
                    },
                    photoName: m.photoName,
                    mealDate: m.mealDate,
                    createdAt: m.createdAt
                  } as Meal
                }).filter((m: Meal) => m && m.id) // Фильтруем только по наличию id
              } else if (typeof log.meals === 'string') {
                try {
                  const parsed = JSON.parse(log.meals)
                  if (Array.isArray(parsed)) {
                    mealsArray = parsed.map((m: any) => {
                      if (m && typeof m === 'object' && m.per100 && m.totals) {
                        return m as Meal
                      }
                      return {
                        id: m.id,
                        title: m.title || '',
                        weight: m.weight || 0,
                        per100: {
                          calories: m.caloriesPer100 || 0,
                          protein: m.proteinPer100 || 0,
                          fats: m.fatsPer100 || 0,
                          carbs: m.carbsPer100 || 0
                        },
                        totals: {
                          calories: m.calories || 0,
                          protein: m.protein || 0,
                          fats: m.fats || 0,
                          carbs: m.carbs || 0
                        },
                        photoName: m.photoName,
                        mealDate: m.mealDate,
                        createdAt: m.createdAt
                      } as Meal
                    }).filter((m: Meal) => m && m.id && m.title)
                  }
                } catch (e) {
                  logger.warn('Dashboard: ошибка парсинга meals в weekLogs', { error: e, rawMeals: log.meals })
                  mealsArray = []
                }
              }
            }
            logger.debug('Dashboard: обработка лога', {
              date: log.date,
              mealsCount: mealsArray.length,
              rawMealsType: typeof log.meals,
              rawMealsIsArray: Array.isArray(log.meals),
              rawMeals: log.meals,
              processedMeals: mealsArray.map(m => ({ id: m.id, title: m.title }))
            })
            return { ...log, meals: mealsArray } as DailyLog
          })
          setWeekLogs(processedLogs)
          // Находим лог за выбранную дату
          const todayData = processedLogs.find(log => log.date === selectedDate)
          if (todayData) {
            // Убеждаемся, что meals всегда массив (не null/undefined)
            // Обрабатываем разные случаи: null, undefined, массив, строка JSON
            let mealsArray: Meal[] = []
            if (todayData.meals !== null && todayData.meals !== undefined) {
              if (Array.isArray(todayData.meals)) {
                // Проверяем структуру meals - если это старая структура, нормализуем
                mealsArray = (todayData.meals as any[]).map((m: any) => {
                  // Если это новая структура (есть per100 и totals), используем как есть
                  if (m.per100 && m.totals) {
                    return m as Meal
                  }
                  // Если это старая структура, преобразуем
                  return {
                    id: m.id,
                    title: m.title,
                    weight: m.weight || 0,
                    per100: {
                      calories: m.caloriesPer100 || 0,
                      protein: m.proteinPer100 || 0,
                      fats: m.fatsPer100 || 0,
                      carbs: m.carbsPer100 || 0
                    },
                    totals: {
                      calories: m.calories || 0,
                      protein: m.protein || 0,
                      fats: m.fats || 0,
                      carbs: m.carbs || 0
                    },
                    photoName: m.photoName,
                    mealDate: m.mealDate,
                    createdAt: m.createdAt
                  } as Meal
                })
              } else if (typeof todayData.meals === 'string') {
                // Если meals пришло как строка (JSON), парсим
                try {
                  const parsed = JSON.parse(todayData.meals)
                  if (Array.isArray(parsed)) {
                    mealsArray = parsed.map((m: any) => {
                      if (m && typeof m === 'object' && m.per100 && m.totals) {
                        return m as Meal
                      }
                      return {
                        id: m.id,
                        title: m.title || '',
                        weight: m.weight || 0,
                        per100: {
                          calories: m.caloriesPer100 || 0,
                          protein: m.proteinPer100 || 0,
                          fats: m.fatsPer100 || 0,
                          carbs: m.carbsPer100 || 0
                        },
                        totals: {
                          calories: m.calories || 0,
                          protein: m.protein || 0,
                          fats: m.fats || 0,
                          carbs: m.carbs || 0
                        },
                        photoName: m.photoName,
                        mealDate: m.mealDate,
                        createdAt: m.createdAt
                      } as Meal
                    }).filter((m: Meal) => m && m.id) // Фильтруем только по наличию id
                  }
                } catch (e) {
                  logger.warn('Dashboard: ошибка парсинга meals', { error: e, meals: todayData.meals })
                  mealsArray = []
                }
              }
            }

            // Данные уже нормализованы триггером БД
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
              actualProtein: todayData.actual_protein,
              rawMeals: todayData.meals,
              parsedMeals: mealsArray.map(m => ({ id: m.id, title: m.title, weight: m.weight, totals: m.totals, per100: m.per100 }))
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
        // Загружаем профиль для проверки Premium и curator_id
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
          setCuratorNote(null)
          return
        }

        if (logData) {
          let mealsArray: Meal[] = []
          if (logData.meals !== null && logData.meals !== undefined) {
            if (Array.isArray(logData.meals)) {
              // Проверяем структуру meals - если это старая структура, нормализуем
              mealsArray = (logData.meals as any[]).map((m: any) => {
                // Если это новая структура (есть per100 и totals), используем как есть
                if (m.per100 && m.totals) {
                  return m as Meal
                }
                // Если это старая структура, преобразуем
                return {
                  id: m.id,
                  title: m.title,
                  weight: m.weight || 0,
                  per100: {
                    calories: m.caloriesPer100 || 0,
                    protein: m.proteinPer100 || 0,
                    fats: m.fatsPer100 || 0,
                    carbs: m.carbsPer100 || 0
                  },
                  totals: {
                    calories: m.calories || 0,
                    protein: m.protein || 0,
                    fats: m.fats || 0,
                    carbs: m.carbs || 0
                  },
                  photoName: m.photoName,
                  mealDate: m.mealDate,
                  createdAt: m.createdAt
                } as Meal
              })
            } else if (typeof logData.meals === 'string') {
              try {
                const parsed = JSON.parse(logData.meals)
                if (Array.isArray(parsed)) {
                  mealsArray = parsed.map((m: any) => {
                    if (m.per100 && m.totals) {
                      return m as Meal
                    }
                    return {
                      id: m.id,
                      title: m.title,
                      weight: m.weight || 0,
                      per100: {
                        calories: m.caloriesPer100 || 0,
                        protein: m.proteinPer100 || 0,
                        fats: m.fatsPer100 || 0,
                        carbs: m.carbsPer100 || 0
                      },
                      totals: {
                        calories: m.calories || 0,
                        protein: m.protein || 0,
                        fats: m.fats || 0,
                        carbs: m.carbs || 0
                      },
                      photoName: m.photoName,
                      mealDate: m.mealDate,
                      createdAt: m.createdAt
                    } as Meal
                  })
                }
              } catch (e) {
                logger.warn('Dashboard: ошибка парсинга meals', { error: e, rawMeals: logData.meals })
                mealsArray = []
              }
            }
          }

          // Данные уже нормализованы триггером БД
          logger.debug('Dashboard: загрузка данных за дату', {
            userId: user.id,
            date: selectedDate,
            mealsCount: mealsArray.length,
            rawMeals: logData.meals,
            rawMealsType: typeof logData.meals,
            rawMealsIsArray: Array.isArray(logData.meals),
            parsedMeals: mealsArray.map(m => ({ id: m.id, title: m.title, weight: m.weight, totals: m.totals, per100: m.per100 }))
          })
          setTodayLog({
            ...logData,
            meals: mealsArray
          } as DailyLog)

          // Загружаем заметку куратора для выбранной даты (только для Premium)
          if (isPremiumUser && profile?.curator_id) {
            const { data: noteData } = await supabase
              .from('curator_notes')
              .select('content, date')
              .eq('client_id', user.id)
              .eq('curator_id', profile.curator_id)
              .eq('date', selectedDate)
              .single()

            if (noteData) {
              setCuratorNote({ content: noteData.content, date: noteData.date })
            } else {
              setCuratorNote(null)
            }
          } else {
            setCuratorNote(null)
          }
        } else {
          setTodayLog(null)
          setCuratorNote(null)
        }
      } catch (error) {
        logger.error('Dashboard: ошибка загрузки данных за дату', error, { userId: user.id, date: selectedDate })
        setTodayLog(null)
        setCuratorNote(null)
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

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <SkeletonLoader variant="card" count={3} />
      </div>
    )
  }

  return (
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans space-y-6">

      {/* HEADER */}
      <header className="mb-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-zinc-100">Дашборд</h1>
        </div>
        {/* Date Navigation */}
        <DateNavigation
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          maxDate={new Date().toISOString().split('T')[0]}
          showTodayButton={true}
        />
      </header>

      {/* DAY TYPE TOGGLE */}
      {(targetsTraining || targetsRest) && (
        <div>
          <DayToggle value={dayType} onChange={setDayType} />
        </div>
      )}

      {/* СВОДКА ЗА ВЫБРАННУЮ ДАТУ */}
      {todayLog && (
        <section className="bg-zinc-900 p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <UtensilsCrossed size={20} />
              {selectedDate === new Date().toISOString().split('T')[0] ? 'Сегодня' : new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
            </h2>
            {!todayLog.is_completed ? (
              <button
                onClick={() => router.push(`/app/nutrition?date=${selectedDate}`)}
                className="text-sm text-zinc-400 underline decoration-dotted hover:text-zinc-100"
              >
                Редактировать
              </button>
            ) : (
              <span className="text-xs text-zinc-500">День завершен</span>
            )}
          </div>

          {/* КБЖУ за сегодня */}
          {(() => {
            // Определяем текущие цели в зависимости от типа дня
            const currentTargets = todayLog.target_type === 'rest' ? targetsRest : targetsTraining

            if (currentTargets) {
              return (
                <div className="bg-zinc-900 p-4 rounded-2xl mb-6">
                  {/* Калории - большой формат как на странице nutrition */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 uppercase mb-1">КАЛОРИИ</div>
                      <div className="text-3xl font-black text-zinc-100 flex items-baseline gap-1 tabular-nums">
                        {todayLog.actual_calories || 0}
                        <span className="text-lg text-zinc-400 font-normal">/ {currentTargets.calories}</span>
                      </div>
                    </div>
                    <Flame className={(todayLog.actual_calories || 0) > currentTargets.calories ? "text-red-400" : "text-emerald-400"} />
                  </div>

                  {/* Мини-график прогресса за неделю */}
                  {weekLogs.length > 0 && (
                    <div className="mb-4">
                      <Suspense fallback={<div className="h-10 w-full bg-zinc-800 rounded animate-pulse" />}>
                        <MiniProgressChart
                          data={weekLogs.slice(0, 7).map(log => log.actual_calories || 0).reverse()}
                          target={currentTargets.calories}
                          label="Калории за неделю"
                          unit="ккал"
                        />
                      </Suspense>
                    </div>
                  )}

                  {/* Macro Bars */}
                  <div className="space-y-3">
                    {(() => {
                      // Вычисляем данные для сравнения
                      const yesterdayDate = new Date(selectedDate)
                      yesterdayDate.setDate(yesterdayDate.getDate() - 1)
                      const yesterdayLog = weekLogs.find(log => log.date === yesterdayDate.toISOString().split('T')[0])

                      const proteinPercentage = currentTargets.protein > 0
                        ? Math.min(Math.max(((todayLog.actual_protein || 0) / currentTargets.protein) * 100, 0), 100)
                        : 0
                      const fatsPercentage = currentTargets.fats > 0
                        ? Math.min(Math.max(((todayLog.actual_fats || 0) / currentTargets.fats) * 100, 0), 100)
                        : 0
                      const carbsPercentage = currentTargets.carbs > 0
                        ? Math.min(Math.max(((todayLog.actual_carbs || 0) / currentTargets.carbs) * 100, 0), 100)
                        : 0

                      return (
                        <>
                          <ProgressBar
                            label="Белки"
                            current={todayLog.actual_protein || 0}
                            target={currentTargets.protein}
                            unit="г"
                            comparison={yesterdayLog ? { yesterday: yesterdayLog.actual_protein || 0 } : undefined}
                            motivationalMessage={getMotivationalMessage('protein', proteinPercentage, todayLog.actual_protein || 0, currentTargets.protein) || undefined}
                          />
                          <ProgressBar
                            label="Жиры"
                            current={todayLog.actual_fats || 0}
                            target={currentTargets.fats}
                            unit="г"
                            comparison={yesterdayLog ? { yesterday: yesterdayLog.actual_fats || 0 } : undefined}
                            motivationalMessage={getMotivationalMessage('fats', fatsPercentage, todayLog.actual_fats || 0, currentTargets.fats) || undefined}
                          />
                          <ProgressBar
                            label="Углеводы"
                            current={todayLog.actual_carbs || 0}
                            target={currentTargets.carbs}
                            unit="г"
                            comparison={yesterdayLog ? { yesterday: yesterdayLog.actual_carbs || 0 } : undefined}
                            motivationalMessage={getMotivationalMessage('carbs', carbsPercentage, todayLog.actual_carbs || 0, currentTargets.carbs) || undefined}
                          />
                        </>
                      )
                    })()}
                  </div>
                </div>
              )
            }

            // Если нет целей, показываем просто значения
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-zinc-900 p-3">
                  <div className="text-xs text-zinc-500 mb-1">Калории</div>
                  <div className="text-lg font-bold text-zinc-100 tabular-nums">
                    {todayLog.actual_calories || 0} ккал
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-900 p-3">
                  <div className="text-xs text-zinc-500 mb-1">Белки</div>
                  <div className="text-lg font-bold text-zinc-100 tabular-nums">
                    {todayLog.actual_protein || 0} г
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-900 p-3">
                  <div className="text-xs text-zinc-500 mb-1">Жиры</div>
                  <div className="text-lg font-bold text-zinc-100 tabular-nums">
                    {todayLog.actual_fats || 0} г
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-900 p-3">
                  <div className="text-xs text-zinc-500 mb-1">Углеводы</div>
                  <div className="text-lg font-bold text-zinc-100 tabular-nums">
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
                  className="rounded-lg border-2 border-dashed border-zinc-800 p-4 cursor-pointer hover:border-zinc-700 hover:bg-zinc-900 transition-colors"
                  onClick={() => setEditingWeight(true)}
                >
                  <div className="text-xs text-zinc-500 mb-1">Вес тела</div>
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

                                  // Record weight logged metric
                                  try {
                                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                                    const { metricsCollector } = require('@/utils/metrics/collector')
                                    metricsCollector.counter(
                                      'weight_logged_total',
                                      'Total number of weight logs',
                                      {
                                        role: profile?.role || 'client',
                                      }
                                    )
                                  } catch {
                                    // Ignore metrics errors
                                  }
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

                                  // Record weight logged metric
                                  try {
                                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                                    const { metricsCollector } = require('@/utils/metrics/collector')
                                    metricsCollector.counter(
                                      'weight_logged_total',
                                      'Total number of weight logs',
                                      {
                                        role: profile?.role || 'client',
                                      }
                                    )
                                  } catch {
                                    // Ignore metrics errors
                                  }
                                }
                              }
                              router.refresh()
                            }
                            setEditingWeight(false)
                          }
                        }}
                        className="w-full p-2 border border-zinc-800 bg-zinc-900 rounded text-base font-bold text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none tabular-nums"
                        autoFocus
                        placeholder="Введите вес"
                      />
                      <span className="text-sm text-zinc-400 font-medium">кг</span>
                    </div>
                  ) : (
                    <div className="text-lg font-bold text-zinc-100 tabular-nums">
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
                className="rounded-lg border-2 border-dashed border-zinc-800 p-4 text-left hover:border-zinc-700 hover:bg-zinc-900 transition-colors"
                title="Ввести питание"
              >
                <div className="text-xs text-zinc-500 mb-1">Ввести питание</div>
                <div className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <UtensilsCrossed size={18} />
                  <span>Открыть</span>
                </div>
              </button>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-zinc-800 p-4 bg-zinc-900 text-left opacity-50">
                <div className="text-xs text-zinc-500 mb-1">Ввести питание</div>
                <div className="text-lg font-bold text-zinc-600">
                  Недоступно
                </div>
              </div>
            )}
          </div>

          {/* Приемы пищи за сегодня */}
          <div className="pt-4 border-t border-zinc-800 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-zinc-100">
                Приемы пищи за сегодня ({Array.isArray(todayLog.meals) ? todayLog.meals.length : 0})
              </h3>
            </div>

            {/* Показываем предупреждение, если есть данные КБЖУ, но нет детализации по приемам */}
            {(!Array.isArray(todayLog.meals) || todayLog.meals.length === 0) &&
              (todayLog.actual_calories > 0 || todayLog.actual_protein > 0 || todayLog.actual_fats > 0 || todayLog.actual_carbs > 0) && (
                <div className="mb-3 p-3 bg-zinc-800 border border-amber-400/20 rounded-lg">
                  <p className="text-sm font-medium text-amber-400 mb-1">⚠️ Данные сохранены без детализации</p>
                  <p className="text-xs text-zinc-300">
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
                    className="flex items-start justify-between p-4 bg-zinc-900 rounded-lg gap-3 hover:bg-zinc-800 transition-colors cursor-pointer"
                    onClick={() => {
                      if (!todayLog.is_completed) {
                        router.push(`/app/nutrition?edit=${meal.id}&date=${selectedDate}`)
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                          #{index + 1}
                        </span>
                        <div className="text-sm font-semibold text-zinc-100">{meal.title}</div>
                      </div>
                      {meal.mealDate && meal.mealDate !== new Date().toISOString().split('T')[0] && (
                        <div className="text-xs text-zinc-400 mb-1">
                          Дата: {new Date(meal.mealDate).toLocaleDateString('ru-RU')}
                        </div>
                      )}
                      <div className="text-xs text-zinc-400 space-y-0.5 tabular-nums">
                        <div className="font-medium">{meal.totals?.calories ?? 0} ккал</div>
                        <div>Белки: {meal.totals?.protein ?? 0}г • Жиры: {meal.totals?.fats ?? 0}г • Углеводы: {meal.totals?.carbs ?? 0}г</div>
                        {meal.weight > 0 && (
                          <div className="text-zinc-500">Вес порции: {meal.weight}г</div>
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
                        className="px-3 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-100 rounded-lg transition-colors"
                        title="Редактировать прием пищи"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (todayLog.is_completed) {
                            toast.error('День завершен. Редактирование недоступно.')
                            return
                          }
                          setDeleteMealModal({ isOpen: true, mealId: meal.id })
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-red-400 rounded-lg transition-colors"
                        title="Удалить прием пищи"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                {/* Модальное окно подтверждения удаления */}
                {deleteMealModal.isOpen && todayLog && (
                  <ConfirmModal
                    isOpen={deleteMealModal.isOpen}
                    onClose={() => setDeleteMealModal({ isOpen: false, mealId: null })}
                    onConfirm={async () => {
                      if (!deleteMealModal.mealId || !todayLog || !user) return

                      const mealToDelete = todayLog.meals?.find(m => m.id === deleteMealModal.mealId)
                      if (!mealToDelete) return

                      // Сохраняем текущее состояние для отката
                      const previousMeals = [...(todayLog.meals || [])]
                      const previousTotals = {
                        calories: todayLog.actual_calories || 0,
                        protein: todayLog.actual_protein || 0,
                        fats: todayLog.actual_fats || 0,
                        carbs: todayLog.actual_carbs || 0,
                      }

                      // Оптимистичное обновление: сразу обновляем UI
                      const updatedMeals = previousMeals.filter(m => m.id !== deleteMealModal.mealId)
                      const dateMeals = updatedMeals.filter(m => (m.mealDate || selectedDate) === selectedDate)
                      const newTotals = dateMeals.reduce(
                        (acc, m) => ({
                          calories: acc.calories + (m.totals?.calories || 0),
                          protein: acc.protein + (m.totals?.protein || 0),
                          fats: acc.fats + (m.totals?.fats || 0),
                          carbs: acc.carbs + (m.totals?.carbs || 0)
                        }),
                        { calories: 0, protein: 0, fats: 0, carbs: 0 }
                      )

                      // Обновляем локальное состояние
                      setTodayLog(prev => prev ? {
                        ...prev,
                        meals: updatedMeals,
                        actual_calories: newTotals.calories,
                        actual_protein: newTotals.protein,
                        actual_fats: newTotals.fats,
                        actual_carbs: newTotals.carbs,
                      } : null)

                      setDeleteMealModal({ isOpen: false, mealId: null })

                      try {
                        const { data: existingLog } = await supabase
                          .from('daily_logs')
                          .select('*')
                          .eq('user_id', user.id)
                          .eq('date', selectedDate)
                          .single()

                        if (existingLog) {
                          const { error } = await supabase
                            .from('daily_logs')
                            .update({
                              meals: updatedMeals,
                              actual_calories: newTotals.calories,
                              actual_protein: newTotals.protein,
                              actual_fats: newTotals.fats,
                              actual_carbs: newTotals.carbs
                            })
                            .eq('user_id', user.id)
                            .eq('date', selectedDate)

                          if (error) throw error
                        }

                        toast.success('Прием пищи удален')
                        router.refresh()
                      } catch (error) {
                        // Откатываем изменения при ошибке
                        setTodayLog(prev => prev ? {
                          ...prev,
                          meals: previousMeals,
                          actual_calories: previousTotals.calories,
                          actual_protein: previousTotals.protein,
                          actual_fats: previousTotals.fats,
                          actual_carbs: previousTotals.carbs,
                        } : null)
                        logger.error('Dashboard: ошибка удаления приема пищи', error)
                        toast.error('Ошибка удаления приема пищи')
                      }
                    }}
                    title="Удалить прием пищи"
                    message={`Вы уверены, что хотите удалить "${todayLog.meals?.find(m => m.id === deleteMealModal.mealId)?.title || 'этот прием пищи'}"? Это действие нельзя отменить.`}
                    variant="danger"
                    confirmText="Удалить"
                    cancelText="Отмена"
                  />
                )}
                {!todayLog.is_completed && (
                  <div className="pt-2 text-center">
                    <button
                      onClick={() => router.push(`/app/nutrition?date=${selectedDate}`)}
                      className="text-sm font-medium text-zinc-400 hover:text-zinc-100 underline"
                    >
                      + Добавить еще один прием пищи
                    </button>
                  </div>
                )}
              </div>
            ) : (
              !todayLog.is_completed ? (
                <EmptyState
                  icon={UtensilsCrossed}
                  title="Нет приемов пищи за сегодня"
                  description="Начните отслеживать свое питание, добавив первый прием пищи"
                  action={
                    <button
                      onClick={() => router.push(`/app/nutrition?date=${selectedDate}`)}
                      className="px-4 py-2 bg-white text-zinc-950 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
                    >
                      + Добавить первый прием пищи
                    </button>
                  }
                  variant="default"
                  className="border-2 border-dashed border-zinc-800 rounded-lg"
                />
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-zinc-800 rounded-lg">
                  <p className="text-zinc-500 text-sm">День завершен. Редактирование недоступно.</p>
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
              <div className="pt-4 border-t border-zinc-800 mt-4">
                {todayLog.is_completed ? (
                  <div className="text-center py-4">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 text-emerald-400 rounded-full text-sm font-medium mb-2">
                      <CheckCircle size={16} />
                      День завершен
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">
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
                            toast.success('День завершен! Куратор получит уведомление.')
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
                      className="w-full py-4 bg-white text-zinc-950 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <p className="text-sm text-zinc-500">
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

      {/* ЗАМЕТКА КУРАТОРА (Premium) */}
      {isPremium && curatorNote && (
        <section className="bg-slate-800 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl">💬</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-zinc-100 mb-1">Сообщение от куратора</h3>
              <p className="text-sm text-zinc-100 whitespace-pre-line">{curatorNote.content}</p>
              <p className="text-xs text-zinc-400 mt-2">
                {new Date(curatorNote.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ЗАГЛУШКА ДЛЯ ИСТЕКШЕЙ ПОДПИСКИ */}
      {!isPremium && profile?.subscription_status === 'expired' && (
        <section className="bg-zinc-900 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl">🔒</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-zinc-100 mb-1">Заметки от куратора</h3>
              <p className="text-sm text-zinc-400 mb-3">
                Эта функция доступна только с активной Premium подпиской.
              </p>
              <button
                onClick={() => router.push('/app/settings?tab=subscription')}
                className="px-4 py-2 bg-white text-zinc-950 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
              >
                Продлить подписку
              </button>
            </div>
          </div>
        </section>
      )}

      {/* МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ ПРИЕМА ПИЩИ */}

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
          <section className="bg-zinc-900 p-6 rounded-2xl">
            <h2 className="text-lg font-bold text-zinc-100 mb-4">Вес</h2>
            <div className="space-y-3">
              {weightLogs.slice(-7).map(log => (
                <div key={log.date} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                  <span className="text-sm text-zinc-400">
                    {new Date(log.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-lg font-bold text-zinc-100 tabular-nums">{log.weight} кг</span>
                </div>
              ))}
              {weightLogs.length >= 2 && (
                <div className="pt-3 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Изменение:</span>
                    <span className={`text-sm font-semibold tabular-nums ${weightDiff < 0 ? 'text-emerald-400' : weightDiff > 0 ? 'text-red-400' : 'text-zinc-400'
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
      <section className="bg-zinc-900 p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
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
            className="text-sm text-zinc-400 underline decoration-dotted flex items-center gap-1 hover:text-zinc-100"
          >
            Ввести данные
            <ArrowRight size={14} />
          </button>
        </div>

        {nutritionSummary && nutritionSummary.daysLogged > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
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

            <div className="pt-3 border-t border-zinc-800">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Дней с отчетами:</span>
                <span className="font-semibold text-zinc-100 tabular-nums">{nutritionSummary.daysLogged} из 7</span>
              </div>
              {nutritionSummary.calories.diff > 0 ? (
                <div className="mt-2 text-sm text-red-400 flex items-center gap-1 tabular-nums">
                  <TrendingUp size={14} />
                  Профицит: +{Math.round(nutritionSummary.calories.diff / nutritionSummary.daysLogged)} ккал/день
                </div>
              ) : nutritionSummary.calories.diff < 0 ? (
                <div className="mt-2 text-sm text-emerald-400 flex items-center gap-1 tabular-nums">
                  <TrendingUp size={14} className="rotate-180" />
                  Дефицит: {Math.round(nutritionSummary.calories.diff / nutritionSummary.daysLogged)} ккал/день
                </div>
              ) : (
                <div className="mt-2 text-sm text-zinc-400">В норме</div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Calendar}
            title="Нет данных за неделю"
            description="Начните отслеживать свое питание и вес, чтобы видеть прогресс"
            action={
              <button
                onClick={() => router.push(`/app/nutrition?date=${selectedDate}`)}
                className="px-4 py-2 bg-white text-zinc-950 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
              >
                Начать вводить данные
              </button>
            }
            variant="default"
          />
        )}
      </section>

      {/* ТРЕНИРОВКИ (заглушка) */}
      <section className="bg-zinc-900 p-6 rounded-2xl">
        <h2 className="text-lg font-bold text-zinc-100 mb-4 flex items-center gap-2">
          <Calendar size={20} />
          Тренировки
        </h2>
        <div className="bg-zinc-800 rounded-xl p-4 text-sm text-amber-400">
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
      <section className="bg-zinc-900 p-6 rounded-2xl">
        <h2 className="text-lg font-bold text-zinc-100 mb-4">Активные программы</h2>

        {currentTargets ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-zinc-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-zinc-100">План питания ({dayType === 'training' ? 'Тренировка' : 'Отдых'})</span>
                <span className="text-xs text-zinc-400 bg-zinc-700 text-emerald-400 px-2 py-1 rounded-full">Активна</span>
              </div>
              <p className="text-sm text-zinc-400 tabular-nums">
                {currentTargets.calories} ккал/день • {currentTargets.protein}г белка • {currentTargets.fats}г жиров • {currentTargets.carbs}г углеводов
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-zinc-500 text-sm">
            Нет активных программ
          </div>
        )}
      </section>

      {/* БЫСТРЫЕ ДЕЙСТВИЯ */}
      <section className="bg-zinc-900 p-6 rounded-2xl">
        <h2 className="text-lg font-bold text-zinc-100 mb-4">Быстрые действия</h2>
        <div className="space-y-3">
          {isPremium ? (
            <button
              onClick={() => router.push('/app/reports')}
              className="w-full p-4 bg-zinc-800 text-zinc-100 rounded-xl font-bold flex items-center justify-between hover:bg-zinc-700 transition-colors"
            >
              <span className="flex items-center gap-2">
                <TrendingUp size={20} />
                Отчеты и аналитика
              </span>
              <ArrowRight size={20} />
            </button>
          ) : (
            <div className="w-full p-4 bg-zinc-800 border-2 border-dashed border-zinc-700 rounded-xl text-center">
              <p className="text-sm text-zinc-400 mb-2">Отчеты и аналитика</p>
              <p className="text-xs text-zinc-500 mb-3">Доступно с Premium подпиской</p>
              <button
                onClick={() => router.push('/app/settings?tab=subscription')}
                className="px-4 py-2 bg-white text-zinc-950 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
              >
                Перейти на Premium
              </button>
            </div>
          )}
        </div>
      </section>

    </main>
  )
}

function StatCard({ label, value, target, unit }: { label: string; value: string; target: number; unit: string }) {
  return (
    <div className="rounded-lg bg-zinc-900 p-3">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold text-zinc-100 tabular-nums">{value}</span>
        <span className="text-xs text-zinc-500 tabular-nums">/ {target}</span>
      </div>
      <div className="text-xs text-zinc-400 mt-1">{unit}</div>
    </div>
  )
}

// Компонент модального окна для добавления приема пищи
