'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { UtensilsCrossed, TrendingUp, ArrowRight } from 'lucide-react'
import DayToggle from './DayToggle'
import { logger } from '@/utils/logger'

type DailyLog = {
  date: string
  actual_calories: number
  actual_protein: number
  actual_fats: number
  actual_carbs: number
  weight?: number | null
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
  const [dayType, setDayType] = useState<'training' | 'rest'>('training')
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

        // Устанавливаем дефолтный тип дня
        if (trainingResult.data && !restResult.data) {
          setDayType('training')
        } else if (restResult.data && !trainingResult.data) {
          setDayType('rest')
        }

        // Получаем логи за последние 7 дней
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

  const handleEditTargets = () => {
    if (currentTargets) {
      setEditingTargets({ ...currentTargets, day_type: dayType })
    }
  }

  const handleSaveTargets = async () => {
    if (!editingTargets) return

    setSavingTargets(true)
    try {
      const { error } = await supabase
        .from('nutrition_targets')
        .update({
          calories: editingTargets.calories,
          protein: editingTargets.protein,
          fats: editingTargets.fats,
          carbs: editingTargets.carbs,
        })
        .eq('id', editingTargets.id)

      if (error) {
        logger.error('ClientDashboardView: ошибка сохранения целей', error, {
          clientId,
          dayType: editingTargets.day_type,
        })
        alert('Ошибка сохранения: ' + error.message)
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
    } finally {
      setSavingTargets(false)
    }
  }

  if (loading) return <div className="p-8 text-center">Загрузка...</div>

  return (
    <div className="space-y-6">
      {/* DAY TYPE TOGGLE */}
      {(targetsTraining || targetsRest) && (
        <div>
          <DayToggle value={dayType} onChange={setDayType} />
        </div>
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
          {!readOnly && (
            <button
              onClick={() => router.push('/app/nutrition')}
              className="text-sm text-black underline decoration-dotted flex items-center gap-1"
            >
              Ввести данные
              <ArrowRight size={14} />
            </button>
          )}
        </div>

        {nutritionSummary && nutritionSummary.daysLogged > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
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
          </div>
        )}
      </section>

      {/* АКТИВНЫЕ ПРОГРАММЫ */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Активные программы</h2>
          {readOnly && currentTargets && !editingTargets && (
            <button
              onClick={handleEditTargets}
              className="text-sm text-black underline decoration-dotted"
            >
              Редактировать
            </button>
          )}
        </div>

        {editingTargets ? (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-2">
              Редактирование плана для: <span className="font-semibold">{editingTargets.day_type === 'training' ? 'Тренировка' : 'Отдых'}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Калории</label>
                <input
                  type="number"
                  value={editingTargets.calories}
                  onChange={(e) => setEditingTargets({ ...editingTargets, calories: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 bg-white rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Белки (г)</label>
                <input
                  type="number"
                  value={editingTargets.protein}
                  onChange={(e) => setEditingTargets({ ...editingTargets, protein: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 bg-white rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Жиры (г)</label>
                <input
                  type="number"
                  value={editingTargets.fats}
                  onChange={(e) => setEditingTargets({ ...editingTargets, fats: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 bg-white rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Углеводы (г)</label>
                <input
                  type="number"
                  value={editingTargets.carbs}
                  onChange={(e) => setEditingTargets({ ...editingTargets, carbs: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 bg-white rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveTargets}
                disabled={savingTargets}
                className="flex-1 py-2 px-4 bg-black text-white rounded-lg font-medium text-sm hover:bg-gray-800 disabled:bg-gray-400"
              >
                {savingTargets ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                onClick={() => setEditingTargets(null)}
                className="flex-1 py-2 px-4 bg-gray-200 text-gray-900 rounded-lg font-medium text-sm hover:bg-gray-300"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {targetsTraining && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">План питания (Тренировка)</span>
                  <span className="text-xs text-gray-500 bg-green-100 text-green-700 px-2 py-1 rounded-full">Активна</span>
                </div>
                <p className="text-sm text-gray-600">
                  {targetsTraining.calories} ккал/день • {targetsTraining.protein}г белка • {targetsTraining.fats}г жиров • {targetsTraining.carbs}г углеводов
                </p>
                {readOnly && (
                  <button
                    onClick={() => {
                      setDayType('training')
                      setEditingTargets({ ...targetsTraining, day_type: 'training' })
                    }}
                    className="mt-2 text-xs text-black underline decoration-dotted"
                  >
                    Редактировать
                  </button>
                )}
              </div>
            )}
            {targetsRest && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">План питания (Отдых)</span>
                  <span className="text-xs text-gray-500 bg-green-100 text-green-700 px-2 py-1 rounded-full">Активна</span>
                </div>
                <p className="text-sm text-gray-600">
                  {targetsRest.calories} ккал/день • {targetsRest.protein}г белка • {targetsRest.fats}г жиров • {targetsRest.carbs}г углеводов
                </p>
                {readOnly && (
                  <button
                    onClick={() => {
                      setDayType('rest')
                      setEditingTargets({ ...targetsRest, day_type: 'rest' })
                    }}
                    className="mt-2 text-xs text-black underline decoration-dotted"
                  >
                    Редактировать
                  </button>
                )}
              </div>
            )}
            {!targetsTraining && !targetsRest && (
              <div className="text-center py-4 text-gray-500 text-sm">
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

