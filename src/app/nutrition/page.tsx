// Страница ввода питания
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { CheckCircle, Flame, Save } from 'lucide-react'
import DayToggle from '@/components/DayToggle'
import { logger } from '@/utils/logger'

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
  photoName?: string
}

type Targets = {
  calories: number
  protein: number
  fats: number
  carbs: number
}

type DailyLog = {
  actual_calories: number
  actual_protein: number
  actual_fats: number
  actual_carbs: number
  hunger_level: number
  energy_level: number
  weight: number | null
  notes: string
  target_type?: 'training' | 'rest'
}

export default function NutritionPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // State для данных
  const [dayType, setDayType] = useState<'training' | 'rest'>('training')
  const [targetsTraining, setTargetsTraining] = useState<Targets | null>(null)
  const [targetsRest, setTargetsRest] = useState<Targets | null>(null)
  const [log, setLog] = useState<DailyLog>({
    actual_calories: 0,
    actual_protein: 0,
    actual_fats: 0,
    actual_carbs: 0,
    hunger_level: 5,
    energy_level: 5,
    weight: null,
    notes: ''
  })
  const [meals, setMeals] = useState<Meal[]>([
    {
      id: crypto.randomUUID(),
      title: 'Прием пищи 1',
      weight: 100,
      per100: {
        calories: 0,
        protein: 0,
        fats: 0,
        carbs: 0
      },
      totals: {
        calories: 0,
        protein: 0,
        fats: 0,
        carbs: 0
      }
    }
  ])
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // Загрузка данных при старте
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          router.push('/login')
          return
        }
        setUser(user)

        // 1. Получаем цели для обоих типов дней
        const today = new Date().toISOString().split('T')[0]
        const [trainingResult, restResult, logResult] = await Promise.all([
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
          supabase
            .from('daily_logs')
            .select('*')
            .eq('user_id', user.id)
            .eq('date', today)
            .single(),
        ])

        if (trainingResult.data) {
          setTargetsTraining(trainingResult.data)
        }
        if (restResult.data) {
          setTargetsRest(restResult.data)
        }

        // 2. Получаем лог за сегодня и устанавливаем тип дня из лога
        if (logResult.data) {
          setLog(logResult.data)
          // Если в логе есть target_type, используем его
          if (logResult.data.target_type) {
            setDayType(logResult.data.target_type as 'training' | 'rest')
          }
        } else {
          // Если лога нет, устанавливаем дефолт на основе наличия целей
          if (trainingResult.data && !restResult.data) {
            setDayType('training')
          } else if (restResult.data && !trainingResult.data) {
            setDayType('rest')
          }
        }
      } catch (error) {
        logger.error('Nutrition: ошибка загрузки данных', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router, supabase])

  // Текущие цели в зависимости от выбранного типа дня
  const currentTargets = useMemo(() => {
    return dayType === 'training' ? targetsTraining : targetsRest
  }, [dayType, targetsTraining, targetsRest])

  // Суммарные значения по всем приемам пищи
  const totals = useMemo(() => {
    return meals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.totals?.calories || 0),
        protein: acc.protein + (meal.totals?.protein || 0),
        fats: acc.fats + (meal.totals?.fats || 0),
        carbs: acc.carbs + (meal.totals?.carbs || 0)
      }),
      { calories: 0, protein: 0, fats: 0, carbs: 0 }
    )
  }, [meals])

  // Функция сохранения
  const handleSave = async () => {
    if (!user) {
      setSaveError('Нет активной сессии. Войдите или временно подставьте user_id для теста.')
      return
    }

    // Валидация: проверяем, что введены данные хотя бы об одном приеме пищи
    if (totals.calories === 0 && totals.protein === 0 && totals.fats === 0 && totals.carbs === 0) {
      setSaveError('Введите данные хотя бы об одном приеме пищи')
      return
    }

    setStatus('saving')
    setSaveError(null)

    const today = new Date().toISOString().split('T')[0]
    const aggregatedLog = {
      ...log,
      actual_calories: totals.calories,
      actual_protein: totals.protein,
      actual_fats: totals.fats,
      actual_carbs: totals.carbs
    }

    const payload = {
      user_id: user.id,
      date: today,
      target_type: dayType,
      ...aggregatedLog
    }

    try {
      // Upsert: Обновить если есть, создать если нет
      const { error } = await supabase
        .from('daily_logs')
        .upsert(payload, { onConflict: 'user_id, date' })

      if (error) {
        setSaveError('Ошибка сохранения: ' + error.message)
        setStatus('idle')
      } else {
        setStatus('saved')
        setTimeout(() => {
          setStatus('idle')
          router.push('/')
          router.refresh() // Обновляем данные на дашборде
        }, 1200)
      }
    } catch (error) {
      logger.error('Nutrition: исключение при сохранении', error, {
        userId: user?.id,
        date: today,
      })
      setSaveError('Произошла ошибка при сохранении. Попробуйте еще раз.')
      setStatus('idle')
    }
  }

  if (loading) return <div className="p-8 text-center">Загрузка контекста...</div>

  const getHungerLevelText = (level: number): string => {
    const levels: Record<number, string> = {
      1: 'Совсем нет голода',
      2: 'Очень слабый голод',
      3: 'Слабый голод',
      4: 'Легкий голод',
      5: 'Умеренный голод',
      6: 'Заметный голод',
      7: 'Сильный голод',
      8: 'Очень сильный голод',
      9: 'Нестерпимый голод',
      10: 'Зверский голод'
    }
    return levels[level] || 'Умеренный голод'
  }

  const addMeal = () => {
    setMeals((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: `Прием пищи ${prev.length + 1}`,
        weight: 100,
        calories: 0,
        protein: 0,
        fats: 0,
        carbs: 0
      }
    ])
  }

  const updateMeal = (id: string, field: keyof Meal, value: string | number | undefined, fileName?: string) => {
    setMeals((prev) =>
      prev.map((meal) =>
        meal.id === id
          ? {
            ...meal,
            [field]: typeof value === 'number' ? value : typeof value === 'string' ? value : meal[field],
            photoName: fileName ?? meal.photoName
          }
          : meal
      )
    )
  }

  const removeMeal = (id: string) => {
    setMeals((prev) => (prev.length === 1 ? prev : prev.filter((meal) => meal.id !== id)))
  }

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans">

      {/* HEADER */}
      <header className="mb-6 flex justify-between items-center">
        <div>
          <button
            onClick={() => router.push('/')}
            className="text-sm text-gray-500 mb-2 block"
          >
            ← Назад
          </button>
          <h1 className="text-xl font-bold text-gray-900">Ввод питания</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('ru-RU')}</p>
        </div>
      </header>

      {/* DAY TYPE TOGGLE */}
      {(targetsTraining || targetsRest) && (
        <div className="mb-6">
          <DayToggle value={dayType} onChange={setDayType} />
        </div>
      )}

      {/* TARGETS SUMMARY */}
      {currentTargets ? (
        <div className="bg-white p-4 rounded-2xl shadow-sm mb-6 border border-gray-100">
          <div className="flex justify-between items-end mb-4">
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Калории</span>
              <div className="text-3xl font-black text-gray-900 flex items-baseline gap-1">
                {totals.calories || 0}
                <span className="text-lg text-gray-400 font-normal">/ {currentTargets.calories}</span>
              </div>
            </div>
            <Flame className={totals.calories > currentTargets.calories ? "text-red-500" : "text-green-500"} />
          </div>

          {/* Macro Bars */}
          <div className="space-y-3">
            <MacroBar label="Белки" current={totals.protein} target={currentTargets.protein} color="bg-blue-500" />
            <MacroBar label="Жиры" current={totals.fats} target={currentTargets.fats} color="bg-yellow-500" />
            <MacroBar label="Углеводы" current={totals.carbs} target={currentTargets.carbs} color="bg-orange-500" />
          </div>
        </div>
      ) : (
        <div className="p-4 bg-yellow-50 text-yellow-800 rounded-xl mb-6 text-sm">
          Тренер еще не назначил план питания.
        </div>
      )}

      {/* MEALS FORM */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <h2 className="font-bold text-gray-800">Отчет за день</h2>

        <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
          <div className="mt-0.5 h-2 w-2 rounded-full bg-black" />
          <div>
            Добавьте каждый прием пищи. Если КБЖУ неизвестно — загрузите фото этикетки или продукта и укажите вес. Автозаполнение по фото подключим позже.
          </div>
        </div>

        <div className="space-y-4">
          {meals.map((meal, idx) => (
            <div key={meal.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={meal.title}
                  onChange={(e) => updateMeal(meal.id, 'title', e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-black"
                  placeholder={`Прием пищи ${idx + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeMeal(meal.id)}
                  className="text-xs text-gray-500 underline disabled:text-gray-300"
                  disabled={meals.length === 1}
                >
                  Удалить
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <InputGroup label="Вес (г)" value={meal.weight} onChange={(v) => updateMeal(meal.id, 'weight', v)} />
                <InputGroup label="Калории (на 100 г)" value={meal.per100?.calories ?? 0} onChange={(v) => updateMeal(meal.id, 'per100.calories', v)} />
                <InputGroup label="Белки (г на 100 г)" value={meal.per100?.protein ?? 0} onChange={(v) => updateMeal(meal.id, 'per100.protein', v)} />
                <InputGroup label="Жиры (г на 100 г)" value={meal.per100?.fats ?? 0} onChange={(v) => updateMeal(meal.id, 'per100.fats', v)} />
                <InputGroup label="Углеводы (г на 100 г)" value={meal.per100?.carbs ?? 0} onChange={(v) => updateMeal(meal.id, 'per100.carbs', v)} />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500">Фото (этикетка/блюдо/продукт)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        updateMeal(meal.id, 'title', meal.title, file.name)
                      }
                    }}
                    className="text-xs text-gray-600"
                  />
                  {meal.photoName && <span className="text-xs text-gray-500 truncate">{meal.photoName}</span>}
                </div>
                <p className="text-[11px] text-gray-500">
                  Автоподстановка КБЖУ по фото будет подключена (OCR/поиск продуктов). Пока что заполните поля вручную.
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Всего за день: {totals.calories} ккал, Б {totals.protein} / Ж {totals.fats} / У {totals.carbs} г
          </div>
          <button
            type="button"
            onClick={addMeal}
            className="text-sm font-semibold text-white bg-black hover:bg-gray-800 px-4 py-2 rounded-lg shadow-sm transition-colors"
          >
            + Добавить прием пищи
          </button>
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-100">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Уровень голода</label>
              <span className="text-sm font-semibold text-gray-900">
                {getHungerLevelText(log.hunger_level || 5)}
              </span>
            </div>
            <input
              type="range" min="1" max="10"
              value={log.hunger_level || 5}
              onChange={(e) => setLog({ ...log, hunger_level: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1</span>
              <span>10</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Комментарий</label>
            <textarea
              className="w-full p-3 bg-gray-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-black outline-none"
              rows={3}
              placeholder="Как прошел день? Были срывы?"
              value={log.notes || ''}
              onChange={(e) => setLog({ ...log, notes: e.target.value })}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          className={`w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 transition-all
            ${status === 'saved' ? 'bg-green-600' : 'bg-black active:scale-95'}
          `}
        >
          {status === 'saving' && 'Сохраняем...'}
          {status === 'saved' && <><CheckCircle size={20} /> Сохранено</>}
          {status === 'idle' && <><Save size={20} /> Сохранить отчет</>}
        </button>

        {saveError && (
          <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {saveError}
          </div>
        )}
      </div>

    </main>
  )
}

// Helper Components
type MacroBarProps = {
  label: string
  current: number
  target: number
  color: string
}

function MacroBar({ label, current, target, color }: MacroBarProps) {
  const percent = Math.min((current / target) * 100, 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium">{current} / {target}</span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

type InputGroupProps = {
  label: string
  value: number | string | null
  onChange: (value: number) => void
}

function InputGroup({ label, value, onChange }: InputGroupProps) {
  const displayValue = value === 0 || value === null || value === undefined ? '' : value.toString()

  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <input
        type="number"
        value={displayValue}
        onChange={(e) => {
          const inputValue = e.target.value
          const numValue = inputValue === '' ? 0 : parseFloat(inputValue) || 0
          onChange(numValue)
        }}
        className="w-full p-3 bg-white rounded-xl border border-gray-200 font-mono text-base font-medium focus:ring-2 focus:ring-black outline-none placeholder:text-gray-400 placeholder:text-sm"
        placeholder="Введите значение"
      />
    </div>
  )
}

