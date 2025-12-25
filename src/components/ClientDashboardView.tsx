'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { UtensilsCrossed, TrendingUp, ArrowRight, Calendar } from 'lucide-react'
import DayToggle from './DayToggle'
import ValidationWarning from './ValidationWarning'
import EmptyState from './EmptyState'
import { validateNutritionTargets } from '@/utils/validation/nutrition'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'

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
  meals?: Meal[] | null
  is_completed?: boolean
  completed_at?: string | null
  hunger_level?: number | null
  energy_level?: number | null
  notes?: string | null
  target_type?: 'training' | 'rest' | null
}

type NutritionTarget = {
  id?: string
  calories: number
  protein: number
  fats: number
  carbs: number
  day_type: string
}

interface ClientDashboardViewProps {
  clientId: string
  readOnly?: boolean
  onTargetsUpdate?: () => void
}

export default function ClientDashboardView({
  clientId,
  readOnly = false,
  onTargetsUpdate
}: ClientDashboardViewProps) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [targetsTraining, setTargetsTraining] = useState<NutritionTarget | null>(null)
  const [targetsRest, setTargetsRest] = useState<NutritionTarget | null>(null)
  const [weekLogs, setWeekLogs] = useState<DailyLog[]>([])
  const [editingTargets, setEditingTargets] = useState<NutritionTarget | null>(null)
  const [savingTargets, setSavingTargets] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      logger.debug('ClientDashboardView: начало загрузки данных', { clientId })
      try {
        // Получаем активные цели питания для обоих типов дней
        const [trainingResult, restResult] = await Promise.all([
          supabase
            .from('nutrition_targets')
            .select('*')
            .eq('user_id', clientId)
            .eq('is_active', true)
            .eq('day_type', 'training')
            .single(),
          supabase
            .from('nutrition_targets')
            .select('*')
            .eq('user_id', clientId)
            .eq('is_active', true)
            .eq('day_type', 'rest')
            .single(),
        ])

        if (trainingResult.error && trainingResult.error.code !== 'PGRST116') {
          logger.error('ClientDashboardView: ошибка загрузки целей тренировок', trainingResult.error, { clientId })
        }
        if (restResult.error && restResult.error.code !== 'PGRST116') {
          logger.error('ClientDashboardView: ошибка загрузки целей отдыха', restResult.error, { clientId })
        }

        if (trainingResult.data) {
          setTargetsTraining(trainingResult.data as NutritionTarget)
          logger.debug('ClientDashboardView: цели тренировок загружены', { clientId })
        }
        if (restResult.data) {
          setTargetsRest(restResult.data as NutritionTarget)
          logger.debug('ClientDashboardView: цели отдыха загружены', { clientId })
        }

        // Получаем логи за последние 7 дней с приемами пищи
        const today = new Date()
        const weekAgo = new Date(today)
        weekAgo.setDate(today.getDate() - 7)

        logger.debug('ClientDashboardView: загрузка логов за неделю', { clientId })
        const { data: logsData, error: logsError } = await supabase
          .from('daily_logs')
          .select('*')
          .eq('user_id', clientId)
          .gte('date', weekAgo.toISOString().split('T')[0])
          .lte('date', today.toISOString().split('T')[0])
          .order('date', { ascending: false })

        if (logsError) {
          logger.error('ClientDashboardView: ошибка загрузки логов', logsError, { clientId })
        } else if (logsData) {
          // Логируем target_type для отладки
          logsData.forEach((log: any) => {
            logger.debug('ClientDashboardView: лог загружен', {
              date: log.date,
              target_type: log.target_type,
              hasTargetType: !!log.target_type
            })
          })
          setWeekLogs(logsData as DailyLog[])
          logger.info('ClientDashboardView: логи успешно загружены', { clientId, count: logsData.length })
        }
      } catch (error) {
        logger.error('ClientDashboardView: ошибка загрузки данных', error, { clientId })
      } finally {
        setLoading(false)
        logger.debug('ClientDashboardView: загрузка данных завершена', { clientId })
      }
    }

    fetchData()
  }, [clientId, supabase])

  // Расчет сводки по питанию за неделю на основе фактических типов дней
  const nutritionSummary = useMemo(() => {
    if (weekLogs.length === 0) return null

    const daysLogged = weekLogs.length
    if (daysLogged === 0) return null

    // Считаем фактические и целевые значения только для дней с определенными целями
    // Это обеспечивает корректное сравнение фактических и целевых значений
    let actualCalories = 0
    let actualProtein = 0
    let actualFats = 0
    let actualCarbs = 0
    let targetCalories = 0
    let targetProtein = 0
    let targetFats = 0
    let targetCarbs = 0
    let daysWithTargets = 0 // Количество дней, для которых есть цели

    weekLogs.forEach((log) => {
      // Определяем цели для каждого дня на основе его target_type
      // Явно проверяем наличие целей для каждого типа, чтобы избежать использования null
      let dayTargets: NutritionTarget | null = null

      if (log.target_type === 'rest' && targetsRest) {
        dayTargets = targetsRest
      } else if (log.target_type === 'training' && targetsTraining) {
        dayTargets = targetsTraining
      }
      // Если target_type не указан или имеет другое значение, dayTargets остается null

      if (dayTargets) {
        // Считаем фактические значения только для дней с целями
        actualCalories += log.actual_calories || 0
        actualProtein += log.actual_protein || 0
        actualFats += log.actual_fats || 0
        actualCarbs += log.actual_carbs || 0

        // Считаем целевые значения
        targetCalories += dayTargets.calories
        targetProtein += dayTargets.protein
        targetFats += dayTargets.fats
        targetCarbs += dayTargets.carbs
        daysWithTargets++
      }
    })

    return {
      calories: { actual: actualCalories, target: targetCalories, diff: actualCalories - targetCalories },
      protein: { actual: actualProtein, target: targetProtein, diff: actualProtein - targetProtein },
      fats: { actual: actualFats, target: targetFats, diff: actualFats - targetFats },
      carbs: { actual: actualCarbs, target: targetCarbs, diff: actualCarbs - targetCarbs },
      daysLogged,
      daysWithTargets // Количество дней с определенными целями
    }
  }, [targetsTraining, targetsRest, weekLogs])

  const handleEditTargets = () => {
    // Начинаем редактирование с тренировочных целей по умолчанию, если они есть
    if (targetsTraining) {
      setEditingTargets({ ...targetsTraining, day_type: 'training' })
    } else if (targetsRest) {
      setEditingTargets({ ...targetsRest, day_type: 'rest' })
    }
  }

  // Валидация редактируемых целей
  const targetsValidation = useMemo(() => {
    if (!editingTargets) return null
    return validateNutritionTargets({
      calories: editingTargets.calories,
      protein: editingTargets.protein,
      fats: editingTargets.fats,
      carbs: editingTargets.carbs
    })
  }, [editingTargets])

  const handleSaveTargets = async () => {
    if (!editingTargets) return

    setSavingTargets(true)
    try {
      // Если id отсутствует, создаем новую цель
      if (!editingTargets.id) {
        const { data: newTarget, error: createError } = await supabase
          .from('nutrition_targets')
          .insert({
            user_id: clientId,
            day_type: editingTargets.day_type,
            calories: editingTargets.calories,
            protein: editingTargets.protein,
            fats: editingTargets.fats,
            carbs: editingTargets.carbs,
            is_active: true,
          })
          .select()
          .single()

        if (createError) {
          logger.error('ClientDashboardView: ошибка создания целей', createError, {
            clientId,
            dayType: editingTargets.day_type,
          })
          toast.error('Ошибка создания целей: ' + createError.message)
          return
        }

        logger.info('ClientDashboardView: цели успешно созданы', {
          clientId,
          dayType: editingTargets.day_type,
          targetId: newTarget.id,
        })

        // Обновляем локальное состояние
        const created = newTarget as NutritionTarget
        if (editingTargets.day_type === 'training') {
          setTargetsTraining(created)
        } else {
          setTargetsRest(created)
        }
        setEditingTargets(null)
        if (onTargetsUpdate) {
          onTargetsUpdate()
        }
        return
      }

      // Если id есть, обновляем существующую цель через API endpoint с валидацией
      const response = await fetch('/api/nutrition-targets/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetId: editingTargets.id,
          clientId: clientId,
          calories: editingTargets.calories,
          protein: editingTargets.protein,
          fats: editingTargets.fats,
          carbs: editingTargets.carbs,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMessage = data.details
          ? `Ошибка валидации: ${Array.isArray(data.details) ? data.details.map((d: { message?: string }) => d.message).join(', ') : data.details}`
          : data.error || 'Ошибка сохранения'
        logger.error('ClientDashboardView: ошибка сохранения целей', {
          clientId,
          dayType: editingTargets.day_type,
          error: errorMessage,
          status: response.status
        })
        toast.error(errorMessage)
      } else {
        logger.info('ClientDashboardView: цели успешно сохранены', {
          clientId,
          dayType: editingTargets.day_type,
        })
        // Обновляем локальное состояние
        const updated = { ...editingTargets }
        if (editingTargets.day_type === 'training') {
          setTargetsTraining(updated)
        } else {
          setTargetsRest(updated)
        }
        setEditingTargets(null)
        if (onTargetsUpdate) {
          onTargetsUpdate()
        }
      }
    } catch (error) {
      logger.error('ClientDashboardView: исключение при сохранении целей', error, { clientId })
      toast.error('Произошла ошибка при сохранении. Попробуйте еще раз.')
    } finally {
      setSavingTargets(false)
    }
  }

  if (loading) return <div className="p-8 text-center">Загрузка...</div>

  return (
    <div className="space-y-6">
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
          {!readOnly && (
            <button
              onClick={() => router.push('/app/nutrition')}
              className="text-sm text-zinc-400 underline decoration-dotted flex items-center gap-1 hover:text-zinc-100"
            >
              Ввести данные
              <ArrowRight size={14} />
            </button>
          )}
        </div>

        {nutritionSummary && nutritionSummary.daysLogged > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                label="Калории"
                value={nutritionSummary.daysWithTargets > 0
                  ? `${Math.round(nutritionSummary.calories.actual / nutritionSummary.daysWithTargets)}`
                  : '—'}
                target={nutritionSummary.daysWithTargets > 0
                  ? Math.round(nutritionSummary.calories.target / nutritionSummary.daysWithTargets)
                  : 0}
                unit="ккал/день"
              />
              <StatCard
                label="Белки"
                value={nutritionSummary.daysWithTargets > 0
                  ? `${Math.round(nutritionSummary.protein.actual / nutritionSummary.daysWithTargets)}`
                  : '—'}
                target={nutritionSummary.daysWithTargets > 0
                  ? Math.round(nutritionSummary.protein.target / nutritionSummary.daysWithTargets)
                  : 0}
                unit="г/день"
              />
            </div>

            <div className="pt-3 border-t border-zinc-800">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Дней с отчетами:</span>
                <span className="font-semibold text-zinc-100 tabular-nums">{nutritionSummary.daysLogged} из 7</span>
              </div>
              {nutritionSummary.daysWithTargets < nutritionSummary.daysLogged && (
                <div className="mt-2 text-sm text-amber-400 flex items-center gap-1">
                  ⚠️ Не все дни имеют установленные цели питания
                </div>
              )}
              {nutritionSummary.daysWithTargets > 0 && nutritionSummary.calories.diff > 0 ? (
                <div className="mt-2 text-sm text-red-400 flex items-center gap-1 tabular-nums">
                  <TrendingUp size={14} />
                  Профицит: +{Math.round(nutritionSummary.calories.diff / nutritionSummary.daysWithTargets)} ккал/день
                </div>
              ) : nutritionSummary.daysWithTargets > 0 && nutritionSummary.calories.diff < 0 ? (
                <div className="mt-2 text-sm text-emerald-400 flex items-center gap-1 tabular-nums">
                  <TrendingUp size={14} className="rotate-180" />
                  Дефицит: {Math.round(nutritionSummary.calories.diff / nutritionSummary.daysWithTargets)} ккал/день
                </div>
              ) : nutritionSummary.daysWithTargets > 0 ? (
                <div className="mt-2 text-sm text-zinc-400">В норме</div>
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Calendar}
            title="Нет данных за неделю"
            description="Начните отслеживать свое питание и вес, чтобы видеть прогресс"
            variant="minimal"
          />
        )}
      </section>

      {/* ДЕТАЛИЗАЦИЯ ПИТАНИЯ ПО ДНЯМ */}
      {weekLogs.length > 0 && (
        <section className="bg-zinc-900 p-6 rounded-2xl">
          <h2 className="text-lg font-bold text-zinc-100 mb-4 flex items-center gap-2">
            <UtensilsCrossed size={20} />
            Питание по дням
          </h2>
          <div className="space-y-4">
            {weekLogs
              .filter(log => log.actual_calories > 0 || (Array.isArray(log.meals) && log.meals.length > 0))
              .map((log) => {
                const meals = Array.isArray(log.meals) ? log.meals : []
                const date = new Date(log.date)
                const isToday = log.date === new Date().toISOString().split('T')[0]

                return (
                  <div key={log.date} className="border border-zinc-800 rounded-xl p-4 bg-zinc-800">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-zinc-100">
                            {isToday ? 'Сегодня' : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}
                          </h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.target_type === 'training'
                            ? 'bg-teal-500/10 text-teal-200'
                            : log.target_type === 'rest'
                              ? 'bg-slate-500/10 text-slate-300'
                              : 'bg-amber-500/10 text-amber-300'
                            }`}>
                            {log.target_type === 'training'
                              ? '🏋️ Тренировка'
                              : log.target_type === 'rest'
                                ? '😴 Отдых'
                                : '❓ Не указано'}
                          </span>
                        </div>
                        {log.is_completed && (
                          <span className="text-xs text-emerald-400 font-medium mt-1 inline-block">
                            ✓ День завершен
                            {log.completed_at && ` (${new Date(log.completed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})`}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-zinc-100 tabular-nums">{log.actual_calories || 0} ккал</div>
                        <div className="text-xs text-zinc-400 tabular-nums">
                          Б: {log.actual_protein || 0}г • Ж: {log.actual_fats || 0}г • У: {log.actual_carbs || 0}г
                        </div>
                      </div>
                    </div>

                    {meals.length > 0 ? (
                      <div className="space-y-2 mt-3 pt-3 border-t border-zinc-700">
                        <div className="text-xs font-medium text-zinc-500 mb-2">Приемы пищи ({meals.length}):</div>
                        {meals.map((meal, index) => (
                          <div key={meal.id} className="bg-zinc-900 rounded-lg p-3">
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                                  #{index + 1}
                                </span>
                                <span className="text-sm font-semibold text-zinc-100">{meal.title}</span>
                              </div>
                              <span className="text-sm font-bold text-zinc-100 tabular-nums">{meal.totals?.calories ?? 0} ккал</span>
                            </div>
                            <div className="text-xs text-zinc-400 ml-7 tabular-nums">
                              Б: {meal.totals?.protein ?? 0}г • Ж: {meal.totals?.fats ?? 0}г • У: {meal.totals?.carbs ?? 0}г
                              {meal.weight > 0 && <span className="ml-2 text-zinc-500">({meal.weight}г)</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-zinc-700 text-sm text-zinc-500 italic">
                        Приемы пищи не детализированы
                      </div>
                    )}

                    {(log.weight || log.hunger_level || log.energy_level || log.notes) && (
                      <div className="mt-3 pt-3 border-t border-zinc-700 space-y-2">
                        {log.weight && (
                          <div className="text-sm text-zinc-400">
                            <span className="font-medium">Вес:</span> <span className="tabular-nums">{log.weight} кг</span>
                          </div>
                        )}
                        {(log.hunger_level || log.energy_level) && (
                          <div className="flex items-center gap-4 text-sm">
                            {log.hunger_level && (
                              <div className="text-zinc-400">
                                <span className="font-medium">Голод:</span>{' '}
                                <span className="font-semibold text-zinc-100">
                                  {log.hunger_level === 1 ? '😋 Совсем нет' :
                                    log.hunger_level === 2 ? '🙂 Легкий' :
                                      log.hunger_level === 3 ? '😊 Умеренный' :
                                        log.hunger_level === 4 ? '😟 Сильный' :
                                          log.hunger_level === 5 ? '🤯 Зверский' :
                                            `${log.hunger_level}/5`}
                                </span>
                              </div>
                            )}
                            {log.energy_level && (
                              <div className="text-zinc-400">
                                <span className="font-medium">Энергия:</span>{' '}
                                <span className="font-semibold text-zinc-100 tabular-nums">{log.energy_level}/10</span>
                              </div>
                            )}
                          </div>
                        )}
                        {log.notes && log.notes.trim() && (
                          <div className="text-sm text-zinc-300 bg-zinc-900 rounded-lg p-3">
                            <div className="font-medium text-zinc-100 mb-1">Комментарий:</div>
                            <div className="text-zinc-300 whitespace-pre-wrap">{log.notes}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            {weekLogs.filter(log => log.actual_calories > 0 || (Array.isArray(log.meals) && log.meals.length > 0)).length === 0 && (
              <EmptyState
                icon={UtensilsCrossed}
                title="Нет данных о питании за неделю"
                description="Начните вводить данные о питании, чтобы видеть детализацию по дням"
                variant="minimal"
              />
            )}
          </div>
        </section>
      )}

      {/* АКТИВНЫЕ ПРОГРАММЫ */}
      <section className="bg-zinc-900 p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100">Активные программы</h2>
          {readOnly && (targetsTraining || targetsRest) && !editingTargets && (
            <button
              onClick={handleEditTargets}
              className="text-sm text-zinc-400 underline decoration-dotted hover:text-zinc-100"
            >
              Редактировать
            </button>
          )}
        </div>

        {editingTargets ? (
          <div className="space-y-4">
            <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-100 mb-2">Тип дня</label>
              <DayToggle
                value={editingTargets.day_type as 'training' | 'rest'}
                onChange={(newDayType) => {
                  // При смене типа дня переключаемся на соответствующие цели
                  const newTargets = newDayType === 'training' ? targetsTraining : targetsRest
                  if (newTargets) {
                    // Если цели для нового типа дня существуют, используем их
                    setEditingTargets({ ...newTargets, day_type: newDayType })
                  } else {
                    // Если целей для нового типа дня нет, создаем новый объект с дефолтными значениями
                    // Используем значения из другого типа дня как отправную точку, если они есть
                    const fallbackTargets = newDayType === 'training' ? targetsRest : targetsTraining
                    const defaultValues = fallbackTargets
                      ? {
                        // Используем значения из другого типа дня как базу
                        calories: fallbackTargets.calories,
                        protein: fallbackTargets.protein,
                        fats: fallbackTargets.fats,
                        carbs: fallbackTargets.carbs,
                      }
                      : {
                        // Дефолтные значения, если нет ни одного типа целей
                        calories: 2000,
                        protein: 150,
                        fats: 65,
                        carbs: 250,
                      }

                    // Создаем новый объект целей без id (будет создан при сохранении)
                    setEditingTargets({
                      ...defaultValues,
                      day_type: newDayType,
                      // id не устанавливаем, чтобы API создал новую запись
                    } as NutritionTarget)
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Калории</label>
                <input
                  type="number"
                  value={editingTargets.calories}
                  onChange={(e) => setEditingTargets({ ...editingTargets, calories: parseInt(e.target.value) || 0 })}
                  className={`w-full p-2 bg-zinc-900 rounded-xl border text-sm text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none tabular-nums ${targetsValidation && targetsValidation.errors.some(e => e.includes('калорий'))
                    ? 'border-red-400'
                    : 'border-zinc-800'
                    }`}
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Белки (г)</label>
                <input
                  type="number"
                  value={editingTargets.protein}
                  onChange={(e) => setEditingTargets({ ...editingTargets, protein: parseInt(e.target.value) || 0 })}
                  className={`w-full p-2 bg-zinc-900 rounded-xl border text-sm text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none tabular-nums ${targetsValidation && targetsValidation.errors.some(e => e.includes('белк'))
                    ? 'border-red-400'
                    : 'border-zinc-800'
                    }`}
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Жиры (г)</label>
                <input
                  type="number"
                  value={editingTargets.fats}
                  onChange={(e) => setEditingTargets({ ...editingTargets, fats: parseInt(e.target.value) || 0 })}
                  className={`w-full p-2 bg-zinc-900 rounded-xl border text-sm text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none tabular-nums ${targetsValidation && targetsValidation.errors.some(e => e.includes('жир'))
                    ? 'border-red-400'
                    : 'border-zinc-800'
                    }`}
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Углеводы (г)</label>
                <input
                  type="number"
                  value={editingTargets.carbs}
                  onChange={(e) => setEditingTargets({ ...editingTargets, carbs: parseInt(e.target.value) || 0 })}
                  className={`w-full p-2 bg-zinc-900 rounded-xl border text-sm text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none tabular-nums ${targetsValidation && targetsValidation.errors.some(e => e.includes('углевод'))
                    ? 'border-red-400'
                    : 'border-zinc-800'
                    }`}
                />
              </div>
            </div>
            {/* Валидация целей */}
            {targetsValidation && (targetsValidation.errors.length > 0 || targetsValidation.warnings.length > 0) && (
              <ValidationWarning
                errors={targetsValidation.errors}
                warnings={targetsValidation.warnings}
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSaveTargets}
                disabled={savingTargets || (targetsValidation !== null && !targetsValidation.valid)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm ${targetsValidation !== null && !targetsValidation.valid
                  ? 'bg-red-400 text-zinc-950 hover:bg-red-300'
                  : 'bg-white text-zinc-950 hover:bg-zinc-200'
                  } disabled:bg-zinc-700 disabled:cursor-not-allowed`}
              >
                {savingTargets ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                onClick={() => setEditingTargets(null)}
                className="flex-1 py-2 px-4 bg-zinc-800 text-zinc-100 rounded-lg font-medium text-sm hover:bg-zinc-700"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {targetsTraining && (
              <div className="rounded-xl bg-zinc-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-zinc-100">План питания (Тренировка)</span>
                  <span className="text-xs text-zinc-400 bg-zinc-700 text-emerald-400 px-2 py-1 rounded-full">Активна</span>
                </div>
                <p className="text-sm text-zinc-400 tabular-nums">
                  {targetsTraining.calories} ккал/день • {targetsTraining.protein}г белка • {targetsTraining.fats}г жиров • {targetsTraining.carbs}г углеводов
                </p>
                {readOnly && (
                  <button
                    onClick={() => {
                      setEditingTargets({ ...targetsTraining, day_type: 'training' })
                    }}
                    className="mt-2 text-xs text-zinc-400 underline decoration-dotted hover:text-zinc-100"
                  >
                    Редактировать
                  </button>
                )}
              </div>
            )}
            {targetsRest && (
              <div className="rounded-xl bg-zinc-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-zinc-100">План питания (Отдых)</span>
                  <span className="text-xs text-zinc-400 bg-zinc-700 text-emerald-400 px-2 py-1 rounded-full">Активна</span>
                </div>
                <p className="text-sm text-zinc-400 tabular-nums">
                  {targetsRest.calories} ккал/день • {targetsRest.protein}г белка • {targetsRest.fats}г жиров • {targetsRest.carbs}г углеводов
                </p>
                {readOnly && (
                  <button
                    onClick={() => {
                      setEditingTargets({ ...targetsRest, day_type: 'rest' })
                    }}
                    className="mt-2 text-xs text-zinc-400 underline decoration-dotted hover:text-zinc-100"
                  >
                    Редактировать
                  </button>
                )}
              </div>
            )}
            {!targetsTraining && !targetsRest && (
              <div className="text-center py-4 text-zinc-500 text-sm">
                Нет активных программ
              </div>
            )}
          </div>
        )}
      </section>
    </div>
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

