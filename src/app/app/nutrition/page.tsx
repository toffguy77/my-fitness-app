// Страница ввода питания
'use client'

import { useEffect, useMemo, useState, Suspense, lazy } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { CheckCircle, Flame, Save, UtensilsCrossed, Copy } from 'lucide-react'
import DayToggle from '@/components/DayToggle'
import ValidationWarning, { InlineValidationWarning } from '@/components/ValidationWarning'
import ProgressBar from '@/components/ProgressBar'
import { validateMeal, validateDailyTotals } from '@/utils/validation/nutrition'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import ProductSearch from '@/components/products/ProductSearch'
import { incrementProductUsage } from '@/utils/products/api'
import type { Product } from '@/types/products'
import type { ExtractedNutritionData } from '@/types/ocr'

// Lazy load heavy components for code splitting
const OCRModal = lazy(() => import('@/components/ocr/OCRModal'))
import { checkAchievementsAfterMealSave, checkAchievementsAfterOCR } from '@/utils/achievements/check'
import SkeletonLoader from '@/components/SkeletonLoader'
import InputHint from '@/components/InputHint'
import { useDraftAutosave } from '@/hooks/useDraftAutosave'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { deleteDraft } from '@/utils/draft/autosave'
import { trackTTFVStart, trackTTFVComplete, trackFeatureAdoption } from '@/utils/analytics/metrics'

export type Meal = {
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
      },
      mealDate: new Date().toISOString().split('T')[0],
      createdAt: now.toISOString()
    }]
  })
  // Существующие meals за день из базы данных (для расчета totals)
  const [existingMeals, setExistingMeals] = useState<Meal[]>([])
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
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const isEditMode = Boolean(editMealId)

  // Отслеживание TTFV - начало
  useEffect(() => {
    trackTTFVStart()
  }, [])

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

          // Данные уже нормализованы триггером БД, просто загружаем их
          // Всегда загружаем существующие meals для расчета totals
          if (logResult.data.meals && Array.isArray(logResult.data.meals) && logResult.data.meals.length > 0) {
            const existingMealsData = logResult.data.meals as Meal[]
            setExistingMeals(existingMealsData)
            logger.debug('Nutrition: загружены существующие приемы пищи для расчета totals', { count: existingMealsData.length })
          } else {
            setExistingMeals([])
          }

          // Загружаем существующие приемы пищи в форму только в режиме редактирования
          // При добавлении нового приема пищи оставляем пустую форму
          if (isEditMode && logResult.data.meals && Array.isArray(logResult.data.meals) && logResult.data.meals.length > 0) {
            // В режиме редактирования загружаем все существующие meals в форму
            const mealsToSet = logResult.data.meals as Meal[]
            setMeals(mealsToSet)
            logger.debug('Nutrition: загружены существующие приемы пищи для редактирования', { count: mealsToSet.length, editMealId })
          } else if (!isEditMode) {
            // При добавлении нового приема пищи оставляем дефолтный пустой прием пищи
            // (он уже создан в useState, ничего не делаем)
            logger.debug('Nutrition: режим добавления нового приема пищи, поля пустые', { date: selectedDate })
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
          // Если лога нет, очищаем существующие meals
          setExistingMeals([])
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

  // Автосохранение черновиков
  const { clearDraft } = useDraftAutosave({
    date: selectedDate,
    meals,
    weight: log.weight,
    hungerLevel: log.hunger_level,
    energyLevel: log.energy_level,
    comments: log.notes,
    enabled: !loading && !isCompleted,
    onRestore: (draft) => {
      if (draft.meals && draft.meals.length > 0) {
        setMeals(draft.meals)
      }
      if (draft.weight !== undefined) {
        setLog(prev => ({ ...prev, weight: draft.weight ?? null }))
      }
      if (draft.hungerLevel !== undefined) {
        setLog(prev => ({ ...prev, hunger_level: draft.hungerLevel ?? 0 }))
      }
      if (draft.energyLevel !== undefined) {
        setLog(prev => ({ ...prev, energy_level: draft.energyLevel ?? 0 }))
      }
      if (draft.comments !== undefined) {
        setLog(prev => ({ ...prev, notes: draft.comments || '' }))
      }
      toast.success('Черновик восстановлен', { duration: 3000 })
    },
  })

  // Очистка черновика после успешного сохранения
  useEffect(() => {
    if (status === 'draft_saved') {
      clearDraft()
    }
  }, [status, clearDraft])

  // Keyboard shortcuts - Ctrl+S / Cmd+S для сохранения
  useKeyboardShortcuts([
    {
      key: 's',
      ctrlKey: true,
      metaKey: true, // Поддержка Cmd+S на Mac
      handler: () => {
        if (status !== 'saving_draft' && status !== 'submitting' && status !== 'submitted' && !isCompleted) {
          handleSaveDraft()
        }
      },
    },
  ], !loading && !isCompleted)

  // Текущие цели в зависимости от выбранного типа дня
  const currentTargets = useMemo(() => {
    return dayType === 'training' ? targetsTraining : targetsRest
  }, [dayType, targetsTraining, targetsRest])

  // Суммарные значения по всем приемам пищи за день
  // Учитываем существующие meals из базы + текущие meals в форме
  const totals = useMemo(() => {
    // Объединяем существующие meals и текущие meals в форме
    // Исключаем дубликаты по id (если meal редактируется, берем версию из формы)
    const mealIdsInForm = new Set(meals.map(m => m.id))
    const allMealsForDate = [
      ...existingMeals.filter(m => !mealIdsInForm.has(m.id)), // Существующие meals, которые не редактируются
      ...meals // Текущие meals в форме (включая новые и редактируемые)
    ].filter(m => (m.mealDate || selectedDate) === selectedDate) // Только meals за выбранную дату

    return allMealsForDate.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.totals?.calories || 0),
        protein: acc.protein + (meal.totals?.protein || 0),
        fats: acc.fats + (meal.totals?.fats || 0),
        carbs: acc.carbs + (meal.totals?.carbs || 0)
      }),
      { calories: 0, protein: 0, fats: 0, carbs: 0 }
    )
  }, [meals, existingMeals, selectedDate])

  // Валидация дневных totals - используется только при сохранении, не показывается во время ввода
  // Во время ввода валидируются только отдельные приемы пищи
  const getDailyValidation = () => {
    return validateDailyTotals(totals.calories, totals.protein, totals.fats, totals.carbs)
  }

  // Валидация каждого приема пищи
  const mealValidations = useMemo(() => {
    return meals.map(meal => validateMeal({
      calories: meal.totals?.calories,
      protein: meal.totals?.protein,
      fats: meal.totals?.fats,
      carbs: meal.totals?.carbs,
      weight: meal.weight
    }))
  }, [meals])

  // Функция сохранения черновика (без завершения дня)
  const handleSaveDraft = async () => {
    if (!user) {
      logger.warn('Nutrition: попытка сохранения без авторизованного пользователя')
      setSaveError('Нет активной сессии. Войдите или временно подставьте user_id для теста.')
      return
    }

    logger.userAction('Nutrition: начало сохранения черновика', {
      userId: user.id,
      date: selectedDate,
      mealsCount: meals.length,
      totals
    })

    // Валидация: проверяем, что введены данные хотя бы об одном приеме пищи
    if (totals.calories === 0 && totals.protein === 0 && totals.fats === 0 && totals.carbs === 0) {
      logger.userAction('Nutrition: попытка сохранения без данных о питании', { userId: user.id })
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

      // Пересчитываем итоговые значения КБЖУ для всех meals перед сохранением
      const recalculatedMeals = allMeals.map(meal => recalcPortion(meal))

      // Фильтруем только meals за выбранную дату для сохранения
      // Также фильтруем пустые meals (без названия или без данных)
      const dateMeals = recalculatedMeals.filter(m => {
        const hasDate = (m.mealDate || selectedDate) === selectedDate
        const hasTitle = m.title && m.title.trim().length > 0
        const hasData = (m.totals?.calories || 0) > 0 || (m.totals?.protein || 0) > 0 || (m.totals?.fats || 0) > 0 || (m.totals?.carbs || 0) > 0
        return hasDate && hasTitle && hasData
      })

      // Пересчитываем totals из всех meals за выбранную дату
      const aggregatedTotals = dateMeals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.totals?.calories || 0),
          protein: acc.protein + (meal.totals?.protein || 0),
          fats: acc.fats + (meal.totals?.fats || 0),
          carbs: acc.carbs + (meal.totals?.carbs || 0)
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
      // Удаляем meals из aggregatedLog, чтобы не перезаписать наши dateMeals
      const { meals: _, ...aggregatedLogWithoutMeals } = aggregatedLog as any

      // Сохраняем без is_completed (черновик)
      const payload = {
        user_id: user.id,
        date: selectedDate,
        target_type: dayType,
        ...aggregatedLogWithoutMeals,
        meals: dateMeals, // Сохраняем только meals за выбранную дату (должно быть после spread)
        // Явно не устанавливаем is_completed, чтобы не завершить день
        is_completed: false
      }

      logger.info('Nutrition: начало сохранения черновика', {
        userId: user.id,
        date: selectedDate,
        dayType,
        mealsCount: dateMeals.length,
        meals: dateMeals.map(m => ({
          id: m.id,
          title: m.title,
          weight: m.weight,
          totals: m.totals,
          per100: m.per100,
          mealDate: m.mealDate
        })),
        payloadMeals: payload.meals,
        payloadMealsLength: Array.isArray(payload.meals) ? payload.meals.length : 'not array'
      })

      // Upsert: Обновить если есть, создать если нет
      const { error, data: savedData } = await supabase
        .from('daily_logs')
        .upsert(payload, { onConflict: 'user_id, date' })
        .select('meals')
        .single()

      if (error) {
        // Откатываем изменения при ошибке
        setMeals(previousMeals)
        setLog(previousLog)
        setStatus(previousStatus)

        logger.error('Nutrition: ошибка сохранения черновика', error, {
          userId: user.id,
          date: selectedDate,
        })
        logger.userAction('Nutrition: ошибка сохранения черновика', {
          userId: user.id,
          date: selectedDate,
          error: error.message
        })
        setSaveError('Ошибка сохранения: ' + error.message)
        toast.error('Ошибка сохранения: ' + error.message)
      } else {
        logger.info('Nutrition: черновик успешно сохранен', {
          userId: user.id,
          date: selectedDate,
          mealsCount: dateMeals.length,
          mealsSaved: dateMeals.map(m => ({ id: m.id, title: m.title, weight: m.weight, totals: m.totals, per100: m.per100 })),
          savedMealsFromDB: savedData?.meals,
          savedMealsCount: Array.isArray(savedData?.meals) ? savedData.meals.length : 0
        })
        logger.userAction('Nutrition: черновик успешно сохранен', {
          userId: user.id,
          date: selectedDate,
          mealsCount: dateMeals.length,
          totals: aggregatedTotals
        })

        // Отслеживаем TTFV при первом сохранении
        trackTTFVComplete('meal_saved')
        trackFeatureAdoption('meal_saving', { mealsCount: dateMeals.length })

        setStatus('draft_saved')
        toast.success('Черновик сохранен')

        // Проверяем достижения после успешного сохранения
        checkAchievementsAfterMealSave(user.id).catch((error) => {
          logger.warn('Nutrition: ошибка проверки достижений', { error })
        })

        // Возвращаем пользователя на дашборд после успешного сохранения
        setTimeout(() => {
          router.push(`/app/dashboard?date=${selectedDate}`)
          router.refresh()
        }, 300)
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

  // Функция отправки координатору (завершение дня)
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

      // Пересчитываем итоговые значения КБЖУ для всех meals перед сохранением
      const recalculatedMeals = allMeals.map(meal => recalcPortion(meal))

      // Фильтруем только meals за выбранную дату для сохранения
      // Также фильтруем пустые meals (без названия или без данных)
      const dateMeals = recalculatedMeals.filter(m => {
        const hasDate = (m.mealDate || selectedDate) === selectedDate
        const hasTitle = m.title && m.title.trim().length > 0
        const hasData = (m.totals?.calories || 0) > 0 || (m.totals?.protein || 0) > 0 || (m.totals?.fats || 0) > 0 || (m.totals?.carbs || 0) > 0
        return hasDate && hasTitle && hasData
      })

      // Пересчитываем totals из всех meals за выбранную дату
      const aggregatedTotals = dateMeals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.totals?.calories || 0),
          protein: acc.protein + (meal.totals?.protein || 0),
          fats: acc.fats + (meal.totals?.fats || 0),
          carbs: acc.carbs + (meal.totals?.carbs || 0)
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
      // Удаляем meals из aggregatedLog, чтобы не перезаписать наши dateMeals
      const { meals: _, ...aggregatedLogWithoutMeals } = aggregatedLog as any

      // Сохраняем с завершением дня
      const payload = {
        user_id: user.id,
        date: selectedDate,
        target_type: dayType,
        ...aggregatedLogWithoutMeals,
        meals: dateMeals, // Сохраняем только meals за выбранную дату (должно быть после spread)
        is_completed: true,
        completed_at: new Date().toISOString()
      }

      logger.info('Nutrition: начало отправки отчета координатору', {
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
      logger.userAction('Nutrition: отправка отчета координатору', {
        userId: user.id,
        date: selectedDate,
        dayType,
        mealsCount: dateMeals.length,
        totals: aggregatedTotals
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
        logger.info('Nutrition: отчет успешно отправлен координатору', {
          userId: user.id,
          date: selectedDate,
          dayType,
        })
        logger.userAction('Nutrition: отчет успешно отправлен координатору', {
          userId: user.id,
          date: selectedDate,
          dayType,
          mealsCount: dateMeals.length,
          totals: aggregatedTotals
        })
        
        // Record daily log completion metric
        try {
          const { metricsCollector } = require('@/utils/metrics/collector')
          metricsCollector.counter(
            'daily_logs_completed_total',
            'Total number of completed daily logs',
            {
              role: 'client',
            }
          )
        } catch {
          // Ignore metrics errors
        }
        
        setIsCompleted(true)
        setStatus('submitted')
        toast.success('Отчет отправлен координатору')

        // Проверяем достижения после успешной отправки
        checkAchievementsAfterMealSave(user.id).catch((error) => {
          logger.warn('Nutrition: ошибка проверки достижений', { error })
        })

        // Остаемся на странице ввода; отправка координатору доступна с дашборда
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

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <SkeletonLoader variant="card" count={2} />
        <SkeletonLoader variant="list" count={3} />
      </div>
    )
  }

  // Блокировка редактирования если день завершен
  if (isCompleted) {
    return (
      <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans">
        <div className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800">
          <div className="text-center py-8">
            <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
            <h2 className="text-xl font-bold text-zinc-100 mb-2">День завершен</h2>
            <p className="text-zinc-400 mb-4">Редактирование недоступно.</p>
            <button
              onClick={() => router.push(`/app/dashboard?date=${selectedDate}`)}
              className="px-4 py-2 bg-white text-zinc-950 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
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
        },
        mealDate: selectedDate,
        createdAt: now.toISOString()
      }
    ])
  }

  // Функция пересчета итоговых значений КБЖУ на основе веса порции и значений на 100г
  const recalcPortion = (meal: Meal): Meal => {
    const weight = meal.weight || 0
    const per100 = meal.per100 || { calories: 0, protein: 0, fats: 0, carbs: 0 }

    // Пересчитываем итоговые значения на основе веса порции и значений на 100г
    const recalcTotal = (per100Value: number) =>
      weight > 0 && per100Value > 0 ? Math.round((per100Value * weight) / 100) : 0

    return {
      ...meal,
      totals: {
        calories: recalcTotal(per100.calories),
        protein: recalcTotal(per100.protein),
        fats: recalcTotal(per100.fats),
        carbs: recalcTotal(per100.carbs),
      }
    }
  }

  const updateMeal = (id: string, field: keyof Meal | 'per100.calories' | 'per100.protein' | 'per100.fats' | 'per100.carbs', value: string | number | undefined, fileName?: string) => {
    const numericOrZero = (v: string | number | undefined) => {
      if (typeof v === 'number') return v
      if (typeof v === 'string') {
        const trimmed = v.trim()
        return trimmed === '' ? 0 : parseFloat(trimmed) || 0
      }
      return 0
    }

    setMeals((prev) =>
      prev.map((meal) => {
        if (meal.id !== id) return meal

        // Создаем обновленный объект приема пищи
        let updatedMeal: Meal = { ...meal }

        // Обрабатываем поля per100
        if (field === 'per100.calories' || field === 'per100.protein' || field === 'per100.fats' || field === 'per100.carbs') {
          const per100Field = field.split('.')[1] as 'calories' | 'protein' | 'fats' | 'carbs'
          updatedMeal = {
            ...updatedMeal,
            per100: {
              ...updatedMeal.per100,
              [per100Field]: numericOrZero(value)
            }
          }
        } else if (field === 'weight') {
          updatedMeal = {
            ...updatedMeal,
            weight: numericOrZero(value)
          }
        } else if (field === 'title' || field === 'mealDate' || field === 'createdAt') {
          updatedMeal = {
            ...updatedMeal,
            [field]: typeof value === 'string' ? value : meal[field]
          }
        }

        // Добавляем photoName, если передан
        if (fileName !== undefined) {
          updatedMeal.photoName = fileName
        }

        // Пересчитываем итоговые значения КБЖУ
        return recalcPortion(updatedMeal)
      })
    )
  }

  const removeMeal = (id: string) => {
    setMeals((prev) => (prev.length === 1 ? prev : prev.filter((meal) => meal.id !== id)))
  }

  // Обработка выбора продукта из ProductSearch
  const handleProductSelect = async (mealId: string, product: Product, weight: number) => {
    if (!user) return

    // Обновляем прием пищи с данными продукта
    setMeals(prev => prev.map(meal => {
      if (meal.id === mealId) {
        const updatedMeal: Meal = {
          ...meal,
          title: product.name,
          weight: weight,
          per100: {
            calories: product.calories_per_100g,
            protein: product.protein_per_100g,
            fats: product.fats_per_100g,
            carbs: product.carbs_per_100g
          },
          totals: {
            calories: 0,
            protein: 0,
            fats: 0,
            carbs: 0
          }
        }
        // Пересчитываем totals
        return recalcPortion(updatedMeal)
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

    // Определяем, указаны ли данные на 100г или для порции
    // Если weight = 100, скорее всего данные на 100г
    // Если weight != 100, данные для порции
    const isPer100g = weight === 100 || !data.weight

    let per100Calories = 0
    let per100Protein = 0
    let per100Fats = 0
    let per100Carbs = 0

    if (isPer100g) {
      // Данные на 100г, используем напрямую
      per100Calories = Math.round(data.calories || 0)
      per100Protein = Math.round(data.protein || 0)
      per100Fats = Math.round(data.fats || 0)
      per100Carbs = Math.round(data.carbs || 0)
    } else {
      // Данные для порции, вычисляем значения на 100г
      per100Calories = weight > 0 && data.calories ? Math.round((data.calories * 100) / weight) : 0
      per100Protein = weight > 0 && data.protein ? Math.round((data.protein * 100) / weight) : 0
      per100Fats = weight > 0 && data.fats ? Math.round((data.fats * 100) / weight) : 0
      per100Carbs = weight > 0 && data.carbs ? Math.round((data.carbs * 100) / weight) : 0
    }

    // Обновляем прием пищи
    setMeals(prev => prev.map(meal => {
      if (meal.id === mealId) {
        const updatedMeal: Meal = {
          ...meal,
          title: data.productName || meal.title,
          weight: weight,
          per100: {
            calories: per100Calories,
            protein: per100Protein,
            fats: per100Fats,
            carbs: per100Carbs
          },
          totals: {
            calories: 0,
            protein: 0,
            fats: 0,
            carbs: 0
          }
        }
        // Пересчитываем totals
        return recalcPortion(updatedMeal)
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
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans">

      {/* HEADER */}
      <header className="mb-6">
        <h1 className="text-xl font-bold text-zinc-100">Ввод питания</h1>
        <p className="text-sm text-zinc-400">{new Date().toLocaleDateString('ru-RU')}</p>
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
            <div className="mt-3 p-3 bg-amber-950/20 border border-amber-800/50 rounded-lg text-sm text-amber-300">
              Цели для этого типа дня не установлены. Обратитесь к координатору.
            </div>
          )}
        </div>
      )}

      {/* WEIGHT SECTION - ТОЛЬКО ВВОД */}
      <div className="bg-zinc-900 p-6 rounded-2xl shadow-sm mb-6 border border-zinc-800">
        <h2 className="text-lg font-bold text-zinc-100 mb-4">Вес тела</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            step="0.1"
            value={log.weight || ''}
            onChange={(e) => {
              const value = e.target.value ? parseFloat(e.target.value) : null
              setLog({ ...log, weight: value })
            }}
            placeholder="Введите вес"
            min={30}
            max={300}
            className={`flex-1 p-3 bg-zinc-800 rounded-xl border text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none tabular-nums placeholder:text-zinc-500 ${log.weight !== null && log.weight !== undefined && (log.weight < 30 || log.weight > 300)
              ? 'border-rose-500 focus:ring-rose-400'
              : 'border-zinc-700'
              }`}
          />
          <span className="text-sm text-zinc-400">кг</span>
        </div>
        <InputHint hint="Допустимый диапазон: 30-300 кг" />
        {log.weight !== null && log.weight !== undefined && (log.weight < 30 || log.weight > 300) && (
          <div className="text-xs text-rose-400 mt-1">
            Вес должен быть в диапазоне 30-300 кг
          </div>
        )}
      </div>

      {/* TARGETS SUMMARY */}
      {currentTargets ? (
        <div className="bg-zinc-900 p-4 rounded-2xl shadow-sm mb-6 border border-zinc-800">
          <div className="flex justify-between items-end mb-4">
            <div>
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Калории</span>
              <div className="text-3xl font-black text-zinc-100 flex items-baseline gap-1 tabular-nums">
                {totals.calories || 0}
                <span className="text-lg text-zinc-400 font-normal">/ {currentTargets.calories}</span>
              </div>
            </div>
            <Flame className={totals.calories > currentTargets.calories ? "text-rose-400" : "text-emerald-400"} />
          </div>

          {/* Macro Bars */}
          <div className="space-y-3">
            <ProgressBar label="Белки" current={totals.protein} target={currentTargets.protein} unit="г" />
            <ProgressBar label="Жиры" current={totals.fats} target={currentTargets.fats} unit="г" />
            <ProgressBar label="Углеводы" current={totals.carbs} target={currentTargets.carbs} unit="г" />
          </div>
        </div>
      ) : (
        <div className="p-4 bg-amber-950/20 text-amber-300 border border-amber-800/50 rounded-xl mb-6 text-sm">
          Координатор еще не назначил план питания.
        </div>
      )}

      {/* MEALS FORM */}
      <div className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800 space-y-6">
        <h2 className="font-bold text-zinc-100">Отчет за день</h2>

        <div className="flex items-start gap-2 rounded-xl bg-zinc-800 p-3 text-sm text-zinc-300">
          <div className="mt-0.5 h-2 w-2 rounded-full bg-white" />
          <div>
            Добавьте каждый прием пищи. Если КБЖУ неизвестно — загрузите фото этикетки или продукта и укажите вес. Автозаполнение по фото подключим позже.
          </div>
        </div>

        <div className="space-y-4">
          {meals.map((meal, index) => {
            const mealValidation = mealValidations[index]
            return (
              <div key={meal.id} className="rounded-xl border border-zinc-800 bg-zinc-800 p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={meal.title}
                    onChange={(e) => updateMeal(meal.id, 'title', e.target.value)}
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 outline-none focus:ring-2 focus:ring-white placeholder:text-zinc-500"
                    placeholder={getMealNameByTime()}
                  />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="date"
                      value={meal.mealDate || selectedDate}
                      onChange={(e) => updateMeal(meal.id, 'mealDate', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="text-xs border border-zinc-700 rounded px-2 py-1 text-zinc-100 bg-zinc-900 w-28"
                      title="Дата приема пищи"
                    />
                    <button
                      type="button"
                      onClick={() => removeMeal(meal.id)}
                      className="px-2 py-1 text-xs font-medium text-rose-400 bg-rose-950/20 hover:bg-rose-950/30 rounded border border-rose-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={meals.length === 0}
                      title="Удалить прием пищи"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* ProductSearch для автозаполнения */}
                <div>
                  <label className="text-xs text-zinc-400 mb-2 block">Поиск продукта (автозаполнение КБЖУ)</label>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <InputGroup
                    label="Вес (г)"
                    value={meal.weight}
                    onChange={(v) => updateMeal(meal.id, 'weight', v)}
                    hint="Обычно 50-500 г"
                    min={1}
                    max={10000}
                    validation={mealValidation && meal.weight !== undefined && meal.weight !== null && meal.weight <= 0 ? { valid: false, error: 'Вес должен быть больше 0' } : undefined}
                  />
                  <InputGroup
                    label="Калории (на 100 г)"
                    value={meal.per100?.calories ?? 0}
                    onChange={(v) => updateMeal(meal.id, 'per100.calories', v)}
                    hint="Обычно 0-900 ккал/100г"
                    min={0}
                    max={5000}
                    validation={mealValidation && meal.per100?.calories !== undefined && meal.per100?.calories !== null && meal.per100.calories < 0 ? { valid: false, error: 'Калории не могут быть отрицательными' } : undefined}
                  />
                  <InputGroup
                    label="Белки (г на 100 г)"
                    value={meal.per100?.protein ?? 0}
                    onChange={(v) => updateMeal(meal.id, 'per100.protein', v)}
                    hint="Обычно 0-100 г/100г"
                    min={0}
                    max={500}
                    validation={mealValidation && meal.per100?.protein !== undefined && meal.per100?.protein !== null && meal.per100.protein < 0 ? { valid: false, error: 'Белки не могут быть отрицательными' } : undefined}
                  />
                  <InputGroup
                    label="Жиры (г на 100 г)"
                    value={meal.per100?.fats ?? 0}
                    onChange={(v) => updateMeal(meal.id, 'per100.fats', v)}
                    hint="Обычно 0-100 г/100г"
                    min={0}
                    max={500}
                    validation={mealValidation && meal.per100?.fats !== undefined && meal.per100?.fats !== null && meal.per100.fats < 0 ? { valid: false, error: 'Жиры не могут быть отрицательными' } : undefined}
                  />
                  <InputGroup
                    label="Углеводы (г на 100 г)"
                    value={meal.per100?.carbs ?? 0}
                    onChange={(v) => updateMeal(meal.id, 'per100.carbs', v)}
                    hint="Обычно 0-100 г/100г"
                    min={0}
                    max={1000}
                    validation={mealValidation && meal.per100?.carbs !== undefined && meal.per100?.carbs !== null && meal.per100.carbs < 0 ? { valid: false, error: 'Углеводы не могут быть отрицательными' } : undefined}
                  />
                </div>

                {/* Отображение итоговых значений КБЖУ для порции */}
                {(meal.totals?.calories > 0 || meal.totals?.protein > 0 || meal.totals?.fats > 0 || meal.totals?.carbs > 0) && (
                  <div className="mt-2 p-3 bg-blue-950/20 border border-blue-800/50 rounded-lg">
                    <div className="text-xs font-semibold text-blue-300 mb-2 tabular-nums">Итого для порции ({meal.weight}г):</div>
                    <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                      <div className="text-blue-300">
                        <span className="font-medium">Калории:</span> {meal.totals?.calories ?? 0} ккал
                      </div>
                      <div className="text-blue-300">
                        <span className="font-medium">Белки:</span> {meal.totals?.protein ?? 0} г
                      </div>
                      <div className="text-blue-300">
                        <span className="font-medium">Жиры:</span> {meal.totals?.fats ?? 0} г
                      </div>
                      <div className="text-blue-300">
                        <span className="font-medium">Углеводы:</span> {meal.totals?.carbs ?? 0} г
                      </div>
                    </div>
                  </div>
                )}
                {/* Валидация приема пищи */}
                {mealValidation && (mealValidation.errors.length > 0 || mealValidation.warnings.length > 0) && (
                  <ValidationWarning
                    errors={mealValidation.errors}
                    warnings={mealValidation.warnings}
                    className="mt-2"
                  />
                )}

                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Фото (этикетка/блюдо/продукт)</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOCRScanClick(meal.id)}
                      className="px-3 py-1.5 bg-white text-zinc-950 text-xs rounded hover:bg-zinc-200 transition-colors flex items-center gap-1"
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
                      className="text-xs text-zinc-400 flex-1"
                    />
                    {meal.photoName && <span className="text-xs text-zinc-500 truncate">{meal.photoName}</span>}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Используйте сканирование этикетки для автоматического заполнения КБЖУ
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* КНОПКА ДОБАВЛЕНИЯ - скрыта в режиме редактирования конкретного приема */}
        {!isEditMode && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400">Дата приема пищи:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="text-xs border border-zinc-700 rounded px-2 py-1 text-zinc-100 bg-zinc-900"
              />
            </div>
            <button
              type="button"
              onClick={addMeal}
              className="w-full text-sm font-semibold text-zinc-950 bg-white hover:bg-zinc-200 px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              + Добавить прием пищи
            </button>
          </div>
        )}

        {/* ВСЕГО ЗА ДЕНЬ - ПЕРЕМЕЩЕНО ВНИЗ */}
        <div className="pt-4 border-t border-zinc-800">
          <div className="text-sm font-semibold text-zinc-100 text-center mb-2 tabular-nums">
            Всего за день: {totals.calories} ккал, Б {totals.protein} / Ж {totals.fats} / У {totals.carbs} г
          </div>
          {/* Валидация дневных норм не показывается во время ввода - только при сохранении */}
          {/* Во время ввода валидируются только отдельные приемы пищи */}
        </div>

        <div className="space-y-4 pt-4 border-t border-zinc-800">
          {/* HUNGER LEVEL - EMOJI (5 уровней) */}
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-3 block">Уровень голода</label>
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setLog({ ...log, hunger_level: level })}
                  className={`p-3 rounded-lg text-2xl transition-all ${log.hunger_level === level
                    ? 'bg-white text-zinc-950 scale-110'
                    : 'bg-zinc-800 hover:bg-zinc-700'
                    }`}
                  title={getHungerLevelText(level)}
                >
                  {getHungerEmoji(level)}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-400 mt-2 text-center">
              {getHungerLevelText(log.hunger_level || 3)}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-300 mb-1 block">Комментарий</label>
            <textarea
              className="w-full p-3 bg-zinc-800 rounded-xl border-none text-sm text-zinc-100 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-500"
              rows={3}
              placeholder="Как прошел день? Были срывы?"
              value={log.notes || ''}
              onChange={(e) => setLog({ ...log, notes: e.target.value })}
            />
          </div>
        </div>

        {/* Сообщения об ошибках и предупреждения - показываем прямо над кнопками для лучшей видимости */}
        {saveError && (
          <div className="rounded-lg bg-rose-950/20 px-3 py-2 text-sm text-rose-300 border border-rose-800/50">
            {saveError}
          </div>
        )}

        {/* Кнопка сохранения черновика. Отправка координатору доступна только с дашборда */}
        <div className="flex gap-3">
          <button
            onClick={handleSaveDraft}
            disabled={status === 'saving_draft' || status === 'submitting' || status === 'submitted'}
            className={`px-4 py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed
              ${status === 'draft_saved' ? 'bg-emerald-950/20 text-emerald-300 border border-emerald-800/50' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'}
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
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </main>
  )
}

export default function NutritionPage() {
  return (
    <Suspense fallback={
      <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans">
        <div className="space-y-6">
          <SkeletonLoader variant="card" count={2} />
          <SkeletonLoader variant="list" count={3} />
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
  hint?: string
  min?: number
  max?: number
  validation?: { valid: boolean; error?: string }
}

function InputGroup({ label, value, onChange, hint, min, max, validation }: InputGroupProps) {
  const displayValue = value === 0 || value === null || value === undefined ? '' : value.toString()
  const hasError = validation && !validation.valid

  return (
    <div>
      <label className="text-xs text-zinc-400 block mb-1">{label}</label>
      <input
        type="number"
        value={displayValue}
        onChange={(e) => {
          const inputValue = e.target.value
          const numValue = inputValue === '' ? 0 : parseFloat(inputValue) || 0
          onChange(numValue)
        }}
        min={min}
        max={max}
        className={`w-full p-3 bg-zinc-900 rounded-xl border font-mono text-base font-medium text-zinc-100 focus:ring-2 outline-none placeholder:text-zinc-500 placeholder:text-sm tabular-nums ${hasError
          ? 'border-rose-500 focus:ring-rose-400'
          : 'border-zinc-700 focus:ring-white'
          }`}
        placeholder="Введите значение"
      />
      {hint && <InputHint hint={hint} />}
      {hasError && validation?.error && (
        <div className="text-xs text-rose-400 mt-1">{validation.error}</div>
      )}
    </div>
  )
}


