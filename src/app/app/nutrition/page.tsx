// Страница ввода питания
'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { CheckCircle, Flame, Save } from 'lucide-react'
import DayToggle from '@/components/DayToggle'
import ValidationWarning, { InlineValidationWarning } from '@/components/ValidationWarning'
import ProgressBar from '@/components/ProgressBar'
import { validateMeal, validateDailyTotals } from '@/utils/validation/nutrition'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import ProductSearch from '@/components/products/ProductSearch'
import { incrementProductUsage } from '@/utils/products/api'
import type { Product } from '@/types/products'
import OCRModal from '@/components/ocr/OCRModal'
import type { ExtractedNutritionData } from '@/types/ocr'
import { checkAchievementsAfterMealSave, checkAchievementsAfterOCR } from '@/utils/achievements/check'

type Meal = {
  id: string
  title: string
  weight: number
  calories: number           // Итоговые калории по порции
  protein: number            // Итоговые белки по порции
  fats: number               // Итоговые жиры по порции
  carbs: number              // Итоговые углеводы по порции
  caloriesPer100?: number    // Калории на 100 г (ввод пользователя/из продукта)
  proteinPer100?: number     // Белки на 100 г
  fatsPer100?: number        // Жиры на 100 г
  carbsPer100?: number       // Углеводы на 100 г
  photoName?: string
  mealDate?: string // Дата приема пищи (для поправок)
  createdAt?: string // Время создания для сортировки
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
  meals?: Meal[] // Массив приемов пищи
}

function NutritionPageContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Функция для определения названия приема пищи по времени суток (объявляем до использования)
  const getMealNameByTime = (hour: number = new Date().getHours()): string => {
    if (hour >= 6 && hour < 10) return 'Завтрак'
    if (hour >= 10 && hour < 13) return 'Второй завтрак'
    if (hour >= 13 && hour < 16) return 'Обед'
    if (hour >= 16 && hour < 20) return 'Полдник'
    if (hour >= 20 || hour < 6) return 'Ужин'
    return 'Прием пищи'
  }

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
    hunger_level: 3,
    energy_level: 5,
    weight: null,
    notes: ''
  })
  const [meals, setMeals] = useState<Meal[]>(() => {
    // По умолчанию создаем один прием пищи
    const now = new Date()
    const mealName = getMealNameByTime(now.getHours())
    return [{
      id: crypto.randomUUID(),
      title: mealName,
      weight: 100,
      calories: 0,
      protein: 0,
      fats: 0,
      carbs: 0,
      mealDate: new Date().toISOString().split('T')[0],
      createdAt: now.toISOString()
    }]
  })
  const [ocrModalOpen, setOcrModalOpen] = useState(false)
  const [ocrModalMealId, setOcrModalMealId] = useState<string | null>(null)
  // Получаем дату из URL параметра или используем сегодня
  const dateParam = searchParams.get('date')
  const editMealId = searchParams.get('edit')
  const [selectedDate, setSelectedDate] = useState<string>(
    dateParam || new Date().toISOString().split('T')[0]
  )
  const [status, setStatus] = useState<'idle' | 'saving_draft' | 'draft_saved' | 'submitting' | 'submitted'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isCompleted, setIsCompleted] = useState<boolean>(false)

  // Загрузка данных при старте
  useEffect(() => {
    const fetchData = async () => {
      logger.debug('Nutrition: начало загрузки данных')
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          logger.warn('Nutrition: пользователь не авторизован', { error: userError?.message })
          router.push('/login')
          return
        }
        logger.debug('Nutrition: пользователь авторизован', { userId: user.id })
        setUser(user)

        // 1. Получаем цели для обоих типов дней
        logger.debug('Nutrition: загрузка целей и логов', { userId: user.id, date: selectedDate })
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
            .eq('date', selectedDate)
            .single(),
        ])

        if (trainingResult.error && trainingResult.error.code !== 'PGRST116') {
          logger.error('Nutrition: ошибка загрузки целей тренировок', trainingResult.error, { userId: user.id })
        }
        if (restResult.error && restResult.error.code !== 'PGRST116') {
          logger.error('Nutrition: ошибка загрузки целей отдыха', restResult.error, { userId: user.id })
        }
        if (logResult.error && logResult.error.code !== 'PGRST116') {
          logger.error('Nutrition: ошибка загрузки лога за выбранную дату', logResult.error, { userId: user.id, date: selectedDate })
        }

        if (trainingResult.data) {
          setTargetsTraining(trainingResult.data)
          logger.debug('Nutrition: цели тренировок загружены', { userId: user.id })
        }
        if (restResult.data) {
          setTargetsRest(restResult.data)
          logger.debug('Nutrition: цели отдыха загружены', { userId: user.id })
        }

        // 2. Получаем лог за выбранную дату и устанавливаем тип дня из лога
        if (logResult.data) {
          logger.debug('Nutrition: найден существующий лог за выбранную дату', { userId: user.id, date: selectedDate })

          // Проверяем, завершен ли день
          if (logResult.data.is_completed) {
            setIsCompleted(true)
            logger.warn('Nutrition: попытка редактирования завершенного дня', { userId: user.id, date: selectedDate })
            toast.error('Этот день завершен. Редактирование недоступно.')
            // Не делаем редирект сразу, покажем блокирующий экран
            setLoading(false)
            return
          }

          setLog(logResult.data)
          // Загружаем существующие приемы пищи
          let mealsToSet: Meal[] = []
          if (logResult.data.meals && Array.isArray(logResult.data.meals) && logResult.data.meals.length > 0) {
            mealsToSet = logResult.data.meals as Meal[]
            // Важно: при редактировании оставляем все приемы пищи,
            // чтобы изменения сохранялись в конкретной записи без потери остальных.
            setMeals(mealsToSet)
            logger.debug('Nutrition: загружены существующие приемы пищи', { count: mealsToSet.length, editMealId })
          }
          // Если в логе есть target_type, используем его
          if (logResult.data.target_type) {
            setDayType(logResult.data.target_type as 'training' | 'rest')
            logger.debug('Nutrition: тип дня установлен из лога', { dayType: logResult.data.target_type })
          }
          // Устанавливаем вес из лога, если есть
          if (logResult.data.weight) {
            setLog(prev => ({ ...prev, weight: logResult.data.weight }))
          }
        } else {
          logger.debug('Nutrition: лог за выбранную дату не найден, используем дефолт', { userId: user.id, date: selectedDate })
          // Если лога нет, устанавливаем дефолт на основе наличия целей
          if (trainingResult.data && !restResult.data) {
            setDayType('training')
          } else if (restResult.data && !trainingResult.data) {
            setDayType('rest')
          }
          // Оставляем дефолтный прием пищи, который уже создан в useState
        }
      } catch (error) {
        logger.error('Nutrition: ошибка загрузки данных', error)
      } finally {
        setLoading(false)
        logger.debug('Nutrition: загрузка данных завершена')
      }
    }

    fetchData()
  }, [router, supabase, selectedDate, editMealId])

  // Текущие цели в зависимости от выбранного типа дня
  const currentTargets = useMemo(() => {
    return dayType === 'training' ? targetsTraining : targetsRest
  }, [dayType, targetsTraining, targetsRest])

  // Суммарные значения по всем приемам пищи
  const totals = useMemo(() => {
    return meals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        fats: acc.fats + (meal.fats || 0),
        carbs: acc.carbs + (meal.carbs || 0)
      }),
      { calories: 0, protein: 0, fats: 0, carbs: 0 }
    )
  }, [meals])

  // Валидация дневных totals - используется только при сохранении, не показывается во время ввода
  // Во время ввода валидируются только отдельные приемы пищи
  const getDailyValidation = () => {
    return validateDailyTotals(totals.calories, totals.protein, totals.fats, totals.carbs)
  }

  // Валидация каждого приема пищи
  const mealValidations = useMemo(() => {
    return meals.map(meal => validateMeal(meal))
  }, [meals])

  // Функция сохранения черновика (без завершения дня)
  const handleSaveDraft = async () => {
    if (!user) {
      logger.warn('Nutrition: попытка сохранения без авторизованного пользователя')
      setSaveError('Нет активной сессии. Войдите или временно подставьте user_id для теста.')
      return
    }

    // Валидация: проверяем, что введены данные хотя бы об одном приеме пищи
    if (totals.calories === 0 && totals.protein === 0 && totals.fats === 0 && totals.carbs === 0) {
      logger.warn('Nutrition: попытка сохранения без данных о питании', { userId: user.id })
      setSaveError('Введите данные хотя бы об одном приеме пищи')
      return
    }

    // Проверка валидации только приемов пищи (не дневных норм)
    const invalidMeals = mealValidations.filter(v => !v.valid)
    if (invalidMeals.length > 0) {
      const allErrors = invalidMeals.flatMap(v => v.errors)
      logger.warn('Nutrition: ошибки валидации приемов пищи', {
        userId: user.id,
        errors: allErrors
      })
      setSaveError(`Ошибки в приемах пищи: ${allErrors.join('; ')}`)
      return
    }

    // Сохраняем текущее состояние для отката при ошибке
    const previousMeals = [...meals]
    const previousLog = { ...log }
    const previousStatus = status

    setStatus('saving_draft')
    setSaveError(null)

    try {
      // Получаем существующий лог за выбранную дату
      const { data: existingLog } = await supabase
        .from('daily_logs')
        .select('meals, target_type')
        .eq('user_id', user.id)
        .eq('date', selectedDate)
        .single()

      // Объединяем существующие meals с новыми
      const existingMeals: Meal[] = (existingLog?.meals as Meal[]) || []
      const newMeals = meals.map(meal => ({
        ...meal,
        mealDate: meal.mealDate || selectedDate,
        createdAt: meal.createdAt || new Date().toISOString()
      }))

      // Объединяем: обновляем существующие по id, добавляем новые
      const mealIds = new Set(newMeals.map(m => m.id))
      const allMeals = [
        ...existingMeals.filter(m => !mealIds.has(m.id)),
        ...newMeals
      ]

      // Пересчитываем totals из всех meals за выбранную дату
      const dateMeals = allMeals.filter(m => (m.mealDate || selectedDate) === selectedDate)
      const aggregatedTotals = dateMeals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          fats: acc.fats + (meal.fats || 0),
          carbs: acc.carbs + (meal.carbs || 0)
        }),
        { calories: 0, protein: 0, fats: 0, carbs: 0 }
      )

      const aggregatedLog = {
        ...log,
        actual_calories: aggregatedTotals.calories,
        actual_protein: aggregatedTotals.protein,
        actual_fats: aggregatedTotals.fats,
        actual_carbs: aggregatedTotals.carbs
      }

      // Сохраняем без is_completed (черновик)
      const payload = {
        user_id: user.id,
        date: selectedDate,
        target_type: dayType,
        meals: allMeals,
        ...aggregatedLog,
        // Явно не устанавливаем is_completed, чтобы не завершить день
        is_completed: false
      }

      logger.info('Nutrition: начало сохранения черновика', {
        userId: user.id,
        date: selectedDate,
        dayType,
      })

      // Upsert: Обновить если есть, создать если нет
      const { error } = await supabase
        .from('daily_logs')
        .upsert(payload, { onConflict: 'user_id, date' })

      if (error) {
        // Откатываем изменения при ошибке
        setMeals(previousMeals)
        setLog(previousLog)
        setStatus(previousStatus)

        logger.error('Nutrition: ошибка сохранения черновика', error, {
          userId: user.id,
          date: selectedDate,
        })
        setSaveError('Ошибка сохранения: ' + error.message)
        toast.error('Ошибка сохранения: ' + error.message)
      } else {
        logger.info('Nutrition: черновик успешно сохранен', {
          userId: user.id,
          date: selectedDate,
        })
        setStatus('draft_saved')
        toast.success('Черновик сохранен')

        // Проверяем достижения после успешного сохранения
        checkAchievementsAfterMealSave(user.id).catch((error) => {
          logger.warn('Nutrition: ошибка проверки достижений', { error })
        })

        // Остаемся на странице, не делаем редирект
        setTimeout(() => {
          setStatus('idle')
        }, 1500)
      }
    } catch (error) {
      // Откатываем изменения при исключении
      setMeals(previousMeals)
      setLog(previousLog)
      setStatus(previousStatus)

      logger.error('Nutrition: исключение при сохранении черновика', error, {
        userId: user.id,
        date: selectedDate,
      })
      const errorMessage = error instanceof Error ? error.message : 'Произошла ошибка при сохранении. Попробуйте еще раз.'
      setSaveError(errorMessage)
      toast.error(errorMessage)
    }
  }

  // Функция отправки тренеру (завершение дня)
  const handleSubmit = async () => {
    if (!user) {
      logger.warn('Nutrition: попытка сохранения без авторизованного пользователя')
      setSaveError('Нет активной сессии. Войдите или временно подставьте user_id для теста.')
      return
    }

    // Валидация: проверяем, что введены данные хотя бы об одном приеме пищи
    if (totals.calories === 0 && totals.protein === 0 && totals.fats === 0 && totals.carbs === 0) {
      logger.warn('Nutrition: попытка отправки без данных о питании', { userId: user.id })
      setSaveError('Введите данные хотя бы об одном приеме пищи')
      return
    }

    // 1. Сначала проверка валидации приемов пищи
    const invalidMeals = mealValidations.filter(v => !v.valid)
    if (invalidMeals.length > 0) {
      const allErrors = invalidMeals.flatMap(v => v.errors)
      logger.warn('Nutrition: ошибки валидации приемов пищи', {
        userId: user.id,
        errors: allErrors
      })
      setSaveError(`Ошибки в приемах пищи: ${allErrors.join('; ')}`)
      return
    }

    // 2. Затем проверка валидации дневных норм
    const dailyValidation = getDailyValidation()
    if (!dailyValidation.valid) {
      logger.warn('Nutrition: ошибки валидации дневных норм перед отправкой', {
        userId: user.id,
        errors: dailyValidation.errors,
        warnings: dailyValidation.warnings
      })
      const allMessages = [...dailyValidation.errors, ...dailyValidation.warnings]
      setSaveError(allMessages.join('; '))
      return
    }

    // Сохраняем текущее состояние для отката при ошибке
    const previousMeals = [...meals]
    const previousLog = { ...log }
    const previousStatus = status

    setStatus('submitting')
    setSaveError(null)

    // Оптимистичное обновление: сразу показываем сохраненные данные
    // (UI уже показывает текущие значения, поэтому ничего не меняем визуально)

    try {
      // Получаем существующий лог за выбранную дату (meals и target_type)
      const { data: existingLog } = await supabase
        .from('daily_logs')
        .select('meals, target_type')
        .eq('user_id', user.id)
        .eq('date', selectedDate)
        .single()

      // Объединяем существующие meals с новыми
      const existingMeals: Meal[] = (existingLog?.meals as Meal[]) || []
      const newMeals = meals.map(meal => ({
        ...meal,
        mealDate: meal.mealDate || selectedDate,
        createdAt: meal.createdAt || new Date().toISOString()
      }))

      // Объединяем: обновляем существующие по id, добавляем новые
      const mealIds = new Set(newMeals.map(m => m.id))
      const allMeals = [
        ...existingMeals.filter(m => !mealIds.has(m.id)), // Оставляем только те, которые не были изменены
        ...newMeals // Добавляем/обновляем новые
      ]

      // Пересчитываем totals из всех meals за выбранную дату
      const dateMeals = allMeals.filter(m => (m.mealDate || selectedDate) === selectedDate)
      const aggregatedTotals = dateMeals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          fats: acc.fats + (meal.fats || 0),
          carbs: acc.carbs + (meal.carbs || 0)
        }),
        { calories: 0, protein: 0, fats: 0, carbs: 0 }
      )

      const aggregatedLog = {
        ...log,
        actual_calories: aggregatedTotals.calories,
        actual_protein: aggregatedTotals.protein,
        actual_fats: aggregatedTotals.fats,
        actual_carbs: aggregatedTotals.carbs
      }

      // Сохраняем с завершением дня
      const payload = {
        user_id: user.id,
        date: selectedDate,
        target_type: dayType,
        meals: allMeals,
        ...aggregatedLog,
        is_completed: true,
        completed_at: new Date().toISOString()
      }

      logger.info('Nutrition: начало отправки отчета тренеру', {
        userId: user.id,
        date: selectedDate,
        dayType,
        totals: {
          calories: totals.calories,
          protein: totals.protein,
          fats: totals.fats,
          carbs: totals.carbs,
        },
      })

      // Upsert: Обновить если есть, создать если нет
      const { error } = await supabase
        .from('daily_logs')
        .upsert(payload, { onConflict: 'user_id, date' })

      if (error) {
        // Откатываем изменения при ошибке
        setMeals(previousMeals)
        setLog(previousLog)
        setStatus(previousStatus)

        logger.error('Nutrition: ошибка сохранения лога', error, {
          userId: user.id,
          date: selectedDate,
        })
        setSaveError('Ошибка сохранения: ' + error.message)
        toast.error('Ошибка сохранения: ' + error.message)
      } else {
        logger.info('Nutrition: отчет успешно отправлен тренеру', {
          userId: user.id,
          date: selectedDate,
          dayType,
        })
        setIsCompleted(true)
        setStatus('submitted')
        toast.success('Отчет отправлен тренеру')

        // Проверяем достижения после успешной отправки
        checkAchievementsAfterMealSave(user.id).catch((error) => {
          logger.warn('Nutrition: ошибка проверки достижений', { error })
        })

        // Остаемся на странице ввода; отправка тренеру доступна с дашборда
        setTimeout(() => {
          setStatus('idle')
        }, 1200)
      }
    } catch (error) {
      // Откатываем изменения при исключении
      setMeals(previousMeals)
      setLog(previousLog)
      setStatus(previousStatus)

      logger.error('Nutrition: исключение при сохранении', error, {
        userId: user.id,
        date: selectedDate,
      })
      const errorMessage = error instanceof Error ? error.message : 'Произошла ошибка при сохранении. Попробуйте еще раз.'
      setSaveError(errorMessage)
      toast.error(errorMessage)
    }
  }

  if (loading) return <div className="p-8 text-center">Загрузка контекста...</div>

  // Блокировка редактирования если день завершен
  if (isCompleted) {
    return (
      <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-center py-8">
            <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">День завершен</h2>
            <p className="text-gray-600 mb-4">Редактирование недоступно.</p>
            <button
              onClick={() => router.push(`/app/dashboard?date=${selectedDate}`)}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Вернуться на дашборд
            </button>
          </div>
        </div>
      </main>
    )
  }

  // Emoji для уровня голода (5 уровней)
  const getHungerEmoji = (level: number): string => {
    const emojis: Record<number, string> = {
      1: '😋', // Совсем нет голода
      2: '🙂', // Легкий голод
      3: '😊', // Умеренный голод
      4: '😟', // Сильный голод
      5: '🤯' // Зверский голод
    }
    return emojis[level] || '😊'
  }

  const getHungerLevelText = (level: number): string => {
    const levels: Record<number, string> = {
      1: 'Совсем нет голода',
      2: 'Легкий голод',
      3: 'Умеренный голод',
      4: 'Сильный голод',
      5: 'Зверский голод'
    }
    return levels[level] || 'Умеренный голод'
  }

  const addMeal = () => {
    const now = new Date()
    const mealName = getMealNameByTime(now.getHours())
    setMeals((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: mealName,
        weight: 100,
        calories: 0,
        protein: 0,
        fats: 0,
        carbs: 0,
        caloriesPer100: 0,
        proteinPer100: 0,
        fatsPer100: 0,
        carbsPer100: 0,
        mealDate: selectedDate,
        createdAt: now.toISOString()
      }
    ])
  }

  const updateMeal = (id: string, field: keyof Meal, value: string | number | undefined, fileName?: string) => {
    const numericOrZero = (v: string | number | undefined) => {
      if (typeof v === 'number') return v
      if (typeof v === 'string') return Number(v) || 0
      return 0
    }

    const recalcPortion = (meal: Meal): Meal => {
      const weight = meal.weight || 0
      const caloriesPer100 = meal.caloriesPer100 || 0
      const proteinPer100 = meal.proteinPer100 || 0
      const fatsPer100 = meal.fatsPer100 || 0
      const carbsPer100 = meal.carbsPer100 || 0

      return {
        ...meal,
        calories: Math.round((caloriesPer100 * weight) / 100),
        protein: Math.round((proteinPer100 * weight) / 100),
        fats: Math.round((fatsPer100 * weight) / 100),
        carbs: Math.round((carbsPer100 * weight) / 100),
      }
    }

    setMeals((prev) =>
      prev.map((meal) =>
        meal.id === id
          ? {
              ...recalcPortion({
                ...meal,
                [field]: ['caloriesPer100', 'proteinPer100', 'fatsPer100', 'carbsPer100', 'weight'].includes(field)
                  ? numericOrZero(value)
                  : typeof value === 'number'
                    ? value
                    : typeof value === 'string'
                      ? value
                      : meal[field],
                photoName: fileName ?? meal.photoName,
              })
            }
          : meal
      )
    )
  }

  const removeMeal = (id: string) => {
    setMeals((prev) => (prev.length === 1 ? prev : prev.filter((meal) => meal.id !== id)))
  }

  // Обработка выбора продукта из ProductSearch
  const handleProductSelect = async (mealId: string, product: Product, weight: number) => {
    if (!user) return

    // Пересчитываем КБЖУ на основе веса порции
    const calories = Math.round((product.calories_per_100g * weight) / 100)
    const protein = Math.round((product.protein_per_100g * weight) / 100)
    const fats = Math.round((product.fats_per_100g * weight) / 100)
    const carbs = Math.round((product.carbs_per_100g * weight) / 100)

    // Обновляем прием пищи
    setMeals(prev => prev.map(meal => {
      if (meal.id === mealId) {
        return {
          ...meal,
          title: product.name,
          weight: weight,
          calories: calories,
          protein: protein,
          fats: fats,
          carbs: carbs,
          caloriesPer100: product.calories_per_100g,
          proteinPer100: product.protein_per_100g,
          fatsPer100: product.fats_per_100g,
          carbsPer100: product.carbs_per_100g,
        }
      }
      return meal
    }))

    // Сохраняем в историю использования продуктов и увеличиваем счетчик использования
    try {
      // Проверяем, существует ли продукт в базе (глобальный или пользовательский)
      if (product.id && product.source !== 'user') {
        // Глобальный продукт - увеличиваем счетчик использования
        await incrementProductUsage(product.id)

        // Сохраняем в историю использования
        await supabase
          .from('product_usage_history')
          .insert({
            user_id: user.id,
            product_id: product.id,
          })
      } else if (product.source === 'user') {
        // Пользовательский продукт - нужно найти или создать
        const { data: userProduct } = await supabase
          .from('user_products')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', product.name)
          .single()

        if (userProduct) {
          await supabase
            .from('product_usage_history')
            .insert({
              user_id: user.id,
              user_product_id: userProduct.id,
            })
        }
      }
    } catch (error) {
      // Игнорируем ошибки сохранения истории (не критично)
      logger.warn('Nutrition: ошибка сохранения истории использования продукта', { error })
    }

    toast.success('Продукт добавлен')
  }

  // Обработка результатов OCR
  const handleOCRConfirm = async (mealId: string, data: ExtractedNutritionData) => {
    if (!user) return

    // Определяем вес порции (по умолчанию 100г если не указан)
    const weight = data.weight || 100

    // Если данные указаны на 100г, используем их напрямую
    // Если указан вес порции, пересчитываем
    const calories = data.calories || 0
    const protein = data.protein || 0
    const fats = data.fats || 0
    const carbs = data.carbs || 0

    // Обновляем прием пищи
    setMeals(prev => prev.map(meal => {
      if (meal.id === mealId) {
        return {
          ...meal,
          title: data.productName || meal.title,
          weight: weight,
          calories: Math.round(calories),
          protein: Math.round(protein),
          fats: Math.round(fats),
          carbs: Math.round(carbs),
        }
      }
      return meal
    }))

    toast.success('Данные из этикетки добавлены')

    // Проверяем достижения после использования OCR
    checkAchievementsAfterOCR().catch((error) => {
      logger.warn('Nutrition: ошибка проверки достижений после OCR', { error })
    })
  }

  const handleOCRScanClick = (mealId: string) => {
    setOcrModalMealId(mealId)
    setOcrModalOpen(true)
  }

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans">

      {/* HEADER */}
      <header className="mb-6 flex justify-between items-center">
        <div>
          <button
            onClick={() => router.push('/app/dashboard')}
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
          <DayToggle
            value={dayType}
            onChange={(newType) => {
              setDayType(newType)
              // При смене типа дня таргеты уже загружены, прогресс-бары пересчитаются автоматически через useMemo
            }}
          />
          {!currentTargets && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              Цели для этого типа дня не установлены. Обратитесь к тренеру.
            </div>
          )}
        </div>
      )}

      {/* WEIGHT SECTION - ТОЛЬКО ВВОД */}
      <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Вес тела</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            step="0.1"
            value={log.weight || ''}
            onChange={(e) => setLog({ ...log, weight: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="Введите вес"
            className="flex-1 p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-black focus:ring-2 focus:ring-black outline-none"
          />
          <span className="text-sm text-gray-600">кг</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Укажите ваш текущий вес. Это поможет отслеживать прогресс.
        </p>
      </div>

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
            <ProgressBar label="Белки" current={totals.protein} target={currentTargets.protein} unit="г" />
            <ProgressBar label="Жиры" current={totals.fats} target={currentTargets.fats} unit="г" />
            <ProgressBar label="Углеводы" current={totals.carbs} target={currentTargets.carbs} unit="г" />
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
          {meals.map((meal, index) => {
            const mealValidation = mealValidations[index]
            return (
              <div key={meal.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={meal.title}
                    onChange={(e) => updateMeal(meal.id, 'title', e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-black outline-none focus:ring-2 focus:ring-black"
                    placeholder={getMealNameByTime()}
                  />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="date"
                      value={meal.mealDate || selectedDate}
                      onChange={(e) => updateMeal(meal.id, 'mealDate', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="text-xs border border-gray-200 rounded px-2 py-1 text-black w-28"
                      title="Дата приема пищи"
                    />
                    <button
                      type="button"
                      onClick={() => removeMeal(meal.id)}
                      className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={meals.length === 0}
                      title="Удалить прием пищи"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* ProductSearch для автозаполнения */}
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">Поиск продукта (автозаполнение КБЖУ)</label>
                  <ProductSearch
                    onSelect={(product, weight) => handleProductSelect(meal.id, product, weight)}
                    placeholder="Начните вводить название продукта..."
                    className="mb-3"
                    showAddCustom={true}
                    userId={user?.id}
                    onAddCustom={() => {
                      router.push('/app/settings')
                      toast('Добавление пользовательского продукта доступно в настройках', { icon: 'ℹ️' })
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputGroup label="Вес (г)" value={meal.weight} onChange={(v) => updateMeal(meal.id, 'weight', v)} />
                  <InputGroup label="Калории (на 100 г)" value={meal.caloriesPer100 ?? 0} onChange={(v) => updateMeal(meal.id, 'caloriesPer100', v)} />
                  <InputGroup label="Белки (г на 100 г)" value={meal.proteinPer100 ?? 0} onChange={(v) => updateMeal(meal.id, 'proteinPer100', v)} />
                  <InputGroup label="Жиры (г на 100 г)" value={meal.fatsPer100 ?? 0} onChange={(v) => updateMeal(meal.id, 'fatsPer100', v)} />
                  <InputGroup label="Углеводы (г на 100 г)" value={meal.carbsPer100 ?? 0} onChange={(v) => updateMeal(meal.id, 'carbsPer100', v)} />
                </div>
                {/* Валидация приема пищи */}
                {mealValidation && (mealValidation.errors.length > 0 || mealValidation.warnings.length > 0) && (
                  <ValidationWarning
                    errors={mealValidation.errors}
                    warnings={mealValidation.warnings}
                    className="mt-2"
                  />
                )}

                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Фото (этикетка/блюдо/продукт)</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOCRScanClick(meal.id)}
                      className="px-3 py-1.5 bg-black text-white text-xs rounded hover:bg-gray-800 transition-colors flex items-center gap-1"
                    >
                      📷 Сканировать этикетку
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          updateMeal(meal.id, 'title', meal.title, file.name)
                        }
                      }}
                      className="text-xs text-gray-600 flex-1"
                    />
                    {meal.photoName && <span className="text-xs text-gray-500 truncate">{meal.photoName}</span>}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Используйте сканирование этикетки для автоматического заполнения КБЖУ
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* КНОПКА ДОБАВЛЕНИЯ - ПЕРЕМЕЩЕНА ВВЕРХ */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Дата приема пищи:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="text-xs border border-gray-200 rounded px-2 py-1 text-black"
            />
          </div>
          <button
            type="button"
            onClick={addMeal}
            className="w-full text-sm font-semibold text-white bg-black hover:bg-gray-800 px-4 py-2 rounded-lg shadow-sm transition-colors"
          >
            + Добавить прием пищи
          </button>
        </div>

        {/* ВСЕГО ЗА ДЕНЬ - ПЕРЕМЕЩЕНО ВНИЗ */}
        <div className="pt-4 border-t border-gray-200">
          <div className="text-sm font-semibold text-gray-900 text-center mb-2">
            Всего за день: {totals.calories} ккал, Б {totals.protein} / Ж {totals.fats} / У {totals.carbs} г
          </div>
          {/* Валидация дневных норм не показывается во время ввода - только при сохранении */}
          {/* Во время ввода валидируются только отдельные приемы пищи */}
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-100">
          {/* HUNGER LEVEL - EMOJI (5 уровней) */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-3 block">Уровень голода</label>
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setLog({ ...log, hunger_level: level })}
                  className={`p-3 rounded-lg text-2xl transition-all ${log.hunger_level === level
                    ? 'bg-black text-white scale-110'
                    : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  title={getHungerLevelText(level)}
                >
                  {getHungerEmoji(level)}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              {getHungerLevelText(log.hunger_level || 3)}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Комментарий</label>
            <textarea
              className="w-full p-3 bg-gray-50 rounded-xl border-none text-sm text-black focus:ring-2 focus:ring-black outline-none"
              rows={3}
              placeholder="Как прошел день? Были срывы?"
              value={log.notes || ''}
              onChange={(e) => setLog({ ...log, notes: e.target.value })}
            />
          </div>
        </div>

        {/* Сообщения об ошибках и предупреждения - показываем прямо над кнопками для лучшей видимости */}
        {saveError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
            {saveError}
          </div>
        )}

        {/* Кнопка сохранения черновика. Отправка тренеру доступна только с дашборда */}
        <div className="flex gap-3">
          <button
            onClick={handleSaveDraft}
            disabled={status === 'saving_draft' || status === 'submitting' || status === 'submitted'}
            className={`px-4 py-4 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed
              ${status === 'draft_saved' ? 'bg-green-100 text-green-700' : ''}
            `}
          >
            {status === 'saving_draft' && 'Сохранение...'}
            {status === 'draft_saved' && <><CheckCircle size={18} /> Сохранено</>}
            {(status === 'idle' || status === 'submitting' || status === 'submitted') && <><Save size={18} /> Сохранить</>}
          </button>
        </div>
      </div>

      {/* OCR Modal */}
      {ocrModalOpen && ocrModalMealId && (
        <OCRModal
          isOpen={ocrModalOpen}
          onClose={() => {
            setOcrModalOpen(false)
            setOcrModalMealId(null)
          }}
          onConfirm={(data) => {
            handleOCRConfirm(ocrModalMealId, data)
            setOcrModalOpen(false)
            setOcrModalMealId(null)
          }}
          preferredTier="balanced"
          openRouterApiKey={process.env.NEXT_PUBLIC_OPENROUTER_API_KEY}
        />
      )}
    </main>
  )
}

export default function NutritionPage() {
  return (
    <Suspense fallback={
      <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-md md:mx-auto font-sans">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
            <p className="text-gray-600">Загрузка...</p>
          </div>
        </div>
      </main>
    }>
      <NutritionPageContent />
    </Suspense>
  )
}

// Helper Components
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
        className="w-full p-3 bg-white rounded-xl border border-gray-200 font-mono text-base font-medium text-black focus:ring-2 focus:ring-black outline-none placeholder:text-gray-400 placeholder:text-sm"
        placeholder="Введите значение"
      />
    </div>
  )
}


