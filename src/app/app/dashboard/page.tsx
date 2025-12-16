// Дашборд клиента
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { LogOut, UtensilsCrossed, TrendingUp, Calendar, Info, ArrowRight } from 'lucide-react'
import DayToggle from '@/components/DayToggle'
import { getUserProfile, hasActiveSubscription } from '@/utils/supabase/profile'
import { logger } from '@/utils/logger'

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
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null)
  const [editingWeight, setEditingWeight] = useState<boolean>(false)
  const [showAddMealModal, setShowAddMealModal] = useState<boolean>(false)

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

        // Проверяем Premium статус
        const profile = await getUserProfile(user)
        const premiumStatus = hasActiveSubscription(profile)
        setIsPremium(premiumStatus)
        logger.debug('Dashboard: статус Premium', { userId: user.id, isPremium: premiumStatus })

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

        logger.debug('Dashboard: загрузка логов за неделю', { userId: user.id })
        const { data: logsData, error: logsError } = await supabase
          .from('daily_logs')
          .select('*, meals') // Явно указываем meals для корректной загрузки JSONB
          .eq('user_id', user.id)
          .gte('date', weekAgo.toISOString().split('T')[0])
          .lte('date', today.toISOString().split('T')[0])
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
              .lte('date', today.toISOString().split('T')[0])
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
              const today = new Date().toISOString().split('T')[0]
              const todayData = logsWithEmptyMeals.find(log => log.date === today)
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
          // Находим лог за сегодня
          const today = new Date().toISOString().split('T')[0]
          const todayData = logsData.find(log => log.date === today)
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
            logger.debug('Dashboard: лог за сегодня загружен', {
              userId: user.id,
              date: today,
              mealsCount: mealsArray.length,
              hasMeals: mealsArray.length > 0,
              mealsType: typeof todayData.meals,
              mealsIsArray: Array.isArray(todayData.meals),
              actualCalories: todayData.actual_calories,
              actualProtein: todayData.actual_protein
            })
          } else {
            // Если нет лога за сегодня, не создаем пустой - секция просто не покажется
            setTodayLog(null)
            logger.debug('Dashboard: лог за сегодня не найден', { userId: user.id, date: today })
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
  }, [router, supabase])

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button
          onClick={async () => {
            logger.info('Dashboard: выход из системы')
            const { error } = await supabase.auth.signOut()
            if (error) {
              const errorObj = error instanceof Error
                ? error
                : new Error((error as { message?: string })?.message || 'Ошибка выхода')
              logger.error('Dashboard: ошибка выхода', errorObj)
            } else {
              logger.info('Dashboard: успешный выход')
            }
            router.push('/login')
            router.refresh()
          }}
          className="h-8 w-8 flex items-center justify-center bg-gray-200 rounded-full hover:bg-gray-300 transition-colors"
          title="Выйти"
        >
          <LogOut size={16} className="text-gray-600" />
        </button>
      </header>

      {/* DAY TYPE TOGGLE */}
      {(targetsTraining || targetsRest) && (
        <div>
          <DayToggle value={dayType} onChange={setDayType} />
        </div>
      )}

      {/* СВОДКА ЗА СЕГОДНЯ */}
      {todayLog && (
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <UtensilsCrossed size={20} />
              Сегодня
            </h2>
            <button
              onClick={() => router.push('/app/nutrition')}
              className="text-sm text-black underline decoration-dotted"
            >
              Редактировать
            </button>
          </div>

          {/* КБЖУ за сегодня */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {(() => {
              // Определяем текущие цели в зависимости от типа дня
              const currentTargets = todayLog.target_type === 'rest' ? targetsRest : targetsTraining
              const showTargets = isPremium && currentTargets

              return (
                <>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs text-gray-500 mb-1">Калории</div>
                    <div className="text-lg font-bold text-gray-900">
                      {todayLog.actual_calories || 0}
                      {showTargets && ` / ${currentTargets.calories}`}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs text-gray-500 mb-1">Белки</div>
                    <div className="text-lg font-bold text-gray-900">
                      {todayLog.actual_protein || 0} г
                      {showTargets && ` / ${currentTargets.protein}г`}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs text-gray-500 mb-1">Жиры</div>
                    <div className="text-lg font-bold text-gray-900">
                      {todayLog.actual_fats || 0} г
                      {showTargets && ` / ${currentTargets.fats}г`}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs text-gray-500 mb-1">Углеводы</div>
                    <div className="text-lg font-bold text-gray-900">
                      {todayLog.actual_carbs || 0} г
                      {showTargets && ` / ${currentTargets.carbs}г`}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>

          {/* БЫСТРЫЕ ДЕЙСТВИЯ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {/* Вес - кликабельный блок */}
            {(() => {
              const today = new Date().toISOString().split('T')[0]
              const lastWeightLog = weekLogs
                .filter(log => log.date === today && log.weight !== null)
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
                            const today = new Date().toISOString().split('T')[0]
                            const { data: existingLog } = await supabase
                              .from('daily_logs')
                              .select('*')
                              .eq('user_id', user?.id)
                              .eq('date', today)
                              .single()

                            if (existingLog) {
                              await supabase
                                .from('daily_logs')
                                .update({ weight: newWeight })
                                .eq('user_id', user?.id)
                                .eq('date', today)
                            } else {
                              await supabase
                                .from('daily_logs')
                                .insert({
                                  user_id: user?.id,
                                  date: today,
                                  weight: newWeight,
                                  actual_calories: todayLog?.actual_calories || 0,
                                  actual_protein: todayLog?.actual_protein || 0,
                                  actual_fats: todayLog?.actual_fats || 0,
                                  actual_carbs: todayLog?.actual_carbs || 0,
                                  meals: todayLog?.meals || []
                                })
                            }
                            router.refresh()
                          }
                          setEditingWeight(false)
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const newWeight = (e.target as HTMLInputElement).value ? parseFloat((e.target as HTMLInputElement).value) : null
                            if (newWeight !== null && newWeight !== currentWeight) {
                              const today = new Date().toISOString().split('T')[0]
                              const { data: existingLog } = await supabase
                                .from('daily_logs')
                                .select('*')
                                .eq('user_id', user?.id)
                                .eq('date', today)
                                .single()

                              if (existingLog) {
                                await supabase
                                  .from('daily_logs')
                                  .update({ weight: newWeight })
                                  .eq('user_id', user?.id)
                                  .eq('date', today)
                              } else {
                                await supabase
                                  .from('daily_logs')
                                  .insert({
                                    user_id: user?.id,
                                    date: today,
                                    weight: newWeight,
                                    actual_calories: todayLog?.actual_calories || 0,
                                    actual_protein: todayLog?.actual_protein || 0,
                                    actual_fats: todayLog?.actual_fats || 0,
                                    actual_carbs: todayLog?.actual_carbs || 0,
                                    meals: todayLog?.meals || []
                                  })
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

            {/* Добавить прием пищи - большая кнопка */}
            <button
              onClick={() => setShowAddMealModal(true)}
              className="rounded-lg border-2 border-dashed border-gray-300 p-4 hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="text-xs text-gray-500 mb-1">Прием пищи</div>
              <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>+ Добавить</span>
              </div>
            </button>
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
                      router.push(`/app/nutrition?edit=${meal.id}`)
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
                          router.push(`/app/nutrition?edit=${meal.id}`)
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                        title="Редактировать прием пищи"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (!confirm('Удалить этот прием пищи?')) return

                          const today = new Date().toISOString().split('T')[0]
                          const updatedMeals = (todayLog.meals || []).filter(m => m.id !== meal.id)

                          // Пересчитываем totals из оставшихся meals за сегодня
                          const todayMeals = updatedMeals.filter(m => (m.mealDate || today) === today)
                          const newTotals = todayMeals.reduce(
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
                            .eq('date', today)
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
                              .eq('date', today)
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
                <div className="pt-2 text-center">
                  <button
                    onClick={() => setShowAddMealModal(true)}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
                  >
                    + Добавить еще один прием пищи
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-500 text-sm mb-3">Нет приемов пищи за сегодня</p>
                <button
                  onClick={() => setShowAddMealModal(true)}
                  className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  + Добавить первый прием пищи
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ ПРИЕМА ПИЩИ */}
      {showAddMealModal && (
        <AddMealModal
          onClose={() => setShowAddMealModal(false)}
          onSave={async (mealData) => {
            const today = new Date().toISOString().split('T')[0]
            const mealDate = mealData.mealDate || today

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
              onClick={() => router.push('/app/nutrition')}
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
          <button
            onClick={() => router.push('/app/nutrition')}
            className="w-full p-4 bg-black text-white rounded-xl font-bold flex items-center justify-between hover:bg-gray-800 transition-colors"
          >
            <span className="flex items-center gap-2">
              <UtensilsCrossed size={20} />
              Ввести питание
            </span>
            <ArrowRight size={20} />
          </button>

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
              <p className="text-xs text-gray-500">Доступно с Premium подпиской</p>
            </div>
          )}
        </div>
      </section>
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
}

function AddMealModal({ onClose, onSave }: AddMealModalProps) {
  const [mealData, setMealData] = useState({
    title: '',
    weight: 100,
    calories: 0,
    protein: 0,
    fats: 0,
    carbs: 0,
    mealDate: new Date().toISOString().split('T')[0]
  })
  const [saving, setSaving] = useState(false)

  const getMealNameByTime = (hour: number = new Date().getHours()): string => {
    if (hour >= 6 && hour < 10) return 'Завтрак'
    if (hour >= 10 && hour < 13) return 'Второй завтрак'
    if (hour >= 13 && hour < 16) return 'Обед'
    if (hour >= 16 && hour < 20) return 'Полдник'
    if (hour >= 20 || hour < 6) return 'Ужин'
    return 'Прием пищи'
  }

  useEffect(() => {
    // Устанавливаем дефолтное название по времени
    if (!mealData.title) {
      setMealData(prev => ({ ...prev, title: getMealNameByTime() }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    if (!mealData.title.trim()) {
      alert('Введите название приема пищи')
      return
    }
    setSaving(true)
    try {
      await onSave(mealData)
    } catch (error) {
      console.error('Ошибка сохранения приема пищи:', error)
      alert('Ошибка сохранения. Попробуйте еще раз.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full sm:max-w-md sm:mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Добавить прием пищи</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

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

        <div className="flex gap-3 pt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

