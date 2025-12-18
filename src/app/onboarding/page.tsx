// Страница Onboarding - мастер настройки для новых пользователей
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { ArrowRight, ArrowLeft, User as UserIcon, Activity, Target } from 'lucide-react'
import { logger } from '@/utils/logger'

type OnboardingStep = 'biometrics' | 'activity' | 'goal'

export default function OnboardingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('biometrics')

  // Step 1: Биометрия
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male')
  const [birthDate, setBirthDate] = useState<string>('')
  const [height, setHeight] = useState<number>(170)
  const [weight, setWeight] = useState<number>(70)

  // Step 2: Активность
  const [activityLevel, setActivityLevel] = useState<'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'>('moderate')

  // Step 3: Цель
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>('maintain')

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          router.push('/login')
          return
        }
        setUser(user)

        // Проверяем, есть ли уже цели
        const { data: targets } = await supabase
          .from('nutrition_targets')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1)

        if (targets && targets.length > 0) {
          // Если цели уже есть, редиректим на дашборд
          router.push('/app/dashboard')
          return
        }

        setLoading(false)
      } catch (error) {
        logger.error('Onboarding: ошибка проверки пользователя', error)
        router.push('/login')
      }
    }

    checkUser()
  }, [router, supabase])

  // Функция расчета BMR (Basal Metabolic Rate) по формуле Харриса-Бенедикта
  const calculateBMR = (gender: string, weight: number, height: number, age: number): number => {
    if (gender === 'male') {
      return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age)
    } else {
      return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age)
    }
  }

  // Функция расчета TDEE (Total Daily Energy Expenditure)
  const calculateTDEE = (bmr: number, activityLevel: string): number => {
    const multipliers: Record<string, number> = {
      sedentary: 1.2,      // Сидячий образ жизни
      light: 1.375,         // Легкая активность (1-3 дня в неделю)
      moderate: 1.55,       // Умеренная активность (3-5 дней в неделю)
      active: 1.725,        // Высокая активность (6-7 дней в неделю)
      very_active: 1.9      // Очень высокая активность (2 раза в день)
    }
    return bmr * (multipliers[activityLevel] || 1.55)
  }

  // Функция расчета целевых калорий с учетом цели
  const calculateTargetCalories = (tdee: number, goal: string): number => {
    switch (goal) {
      case 'lose':
        return Math.round(tdee * 0.85) // Дефицит 15%
      case 'gain':
        return Math.round(tdee * 1.10) // Профицит 10%
      case 'maintain':
      default:
        return Math.round(tdee)
    }
  }

  // Функция расчета макронутриентов (стандартное распределение)
  const calculateMacros = (calories: number) => {
    // Стандартное распределение: 30% белки, 25% жиры, 45% углеводы
    const protein = Math.round((calories * 0.30) / 4) // 1г белка = 4 ккал
    const fats = Math.round((calories * 0.25) / 9)    // 1г жира = 9 ккал
    const carbs = Math.round((calories * 0.45) / 4)   // 1г углеводов = 4 ккал

    return { protein, fats, carbs }
  }

  const handleNext = () => {
    if (currentStep === 'biometrics') {
      // Валидация биометрии
      if (!birthDate || height < 100 || height > 250 || weight < 30 || weight > 300) {
        setError('Пожалуйста, заполните все поля корректно')
        return
      }
      setCurrentStep('activity')
      setError(null)
    } else if (currentStep === 'activity') {
      setCurrentStep('goal')
      setError(null)
    }
  }

  const handleBack = () => {
    if (currentStep === 'activity') {
      setCurrentStep('biometrics')
    } else if (currentStep === 'goal') {
      setCurrentStep('activity')
    }
    setError(null)
  }

  const handleFinish = async () => {
    if (!user) return

    setSaving(true)
    setError(null)

    try {
      // Рассчитываем возраст
      const birth = new Date(birthDate)
      const today = new Date()
      const age = today.getFullYear() - birth.getFullYear() - 
        (today.getMonth() < birth.getMonth() || 
         (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate()) ? 1 : 0)

      // Рассчитываем BMR и TDEE
      const bmr = calculateBMR(gender, weight, height, age)
      const tdee = calculateTDEE(bmr, activityLevel)
      const targetCalories = calculateTargetCalories(tdee, goal)
      const macros = calculateMacros(targetCalories)

      logger.info('Onboarding: расчет целей', {
        userId: user.id,
        bmr: Math.round(bmr),
        tdee: Math.round(tdee),
        targetCalories,
        macros
      })

      // Сохраняем биометрические данные в профиль
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          gender,
          birth_date: birthDate,
          height,
          activity_level: activityLevel,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (profileError) {
        throw new Error('Ошибка сохранения профиля: ' + profileError.message)
      }

      // Создаем цели питания для дня отдыха (базовая)
      const { error: targetsError } = await supabase
        .from('nutrition_targets')
        .insert({
          user_id: user.id,
          day_type: 'rest',
          calories: targetCalories,
          protein: macros.protein,
          fats: macros.fats,
          carbs: macros.carbs,
          is_active: true
        })

      if (targetsError) {
        throw new Error('Ошибка создания целей: ' + targetsError.message)
      }

      // Создаем цели для тренировочного дня (+200 ккал)
      const trainingCalories = targetCalories + 200
      const trainingMacros = calculateMacros(trainingCalories)

      const { error: trainingTargetsError } = await supabase
        .from('nutrition_targets')
        .insert({
          user_id: user.id,
          day_type: 'training',
          calories: trainingCalories,
          protein: trainingMacros.protein,
          fats: trainingMacros.fats,
          carbs: trainingMacros.carbs,
          is_active: true
        })

      if (trainingTargetsError) {
        throw new Error('Ошибка создания целей для тренировок: ' + trainingTargetsError.message)
      }

      // Сохраняем начальный вес в daily_logs
      const today = new Date().toISOString().split('T')[0]
      const { error: weightError } = await supabase
        .from('daily_logs')
        .upsert({
          user_id: user.id,
          date: today,
          weight: weight,
          actual_calories: 0,
          actual_protein: 0,
          actual_fats: 0,
          actual_carbs: 0,
          meals: []
        }, { onConflict: 'user_id, date' })

      if (weightError) {
        logger.warn('Onboarding: ошибка сохранения веса', weightError)
        // Не критично, продолжаем
      }

      logger.info('Onboarding: успешно завершен', { userId: user.id })
      router.push('/app/dashboard')
      router.refresh()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка при сохранении'
      setError(errorMessage)
      logger.error('Onboarding: ошибка завершения', err, { userId: user.id })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-gray-600">Загрузка...</div>
        </div>
      </div>
    )
  }

  return (
    <main className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:max-w-2xl md:mx-auto font-sans">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              Шаг {currentStep === 'biometrics' ? '1' : currentStep === 'activity' ? '2' : '3'} из 3
            </span>
            <span className="text-sm text-gray-500">
              {currentStep === 'biometrics' ? 'Биометрия' : currentStep === 'activity' ? 'Активность' : 'Цель'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-black h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep === 'biometrics' ? 1 : currentStep === 'activity' ? 2 : 3) * 33.33}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Step 1: Биометрия */}
        {currentStep === 'biometrics' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center">
                <UserIcon size={24} className="text-gray-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Расскажите о себе</h1>
                <p className="text-sm text-gray-500">Эти данные нужны для расчета ваших целей</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Пол</label>
              <div className="grid grid-cols-3 gap-3">
                {(['male', 'female', 'other'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`p-4 rounded-xl border-2 transition-colors ${
                      gender === g
                        ? 'border-black bg-black text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {g === 'male' ? 'Мужской' : g === 'female' ? 'Женский' : 'Другое'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-2">
                Дата рождения
              </label>
              <input
                type="date"
                id="birthDate"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-black focus:ring-2 focus:ring-black outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="height" className="block text-sm font-medium text-gray-700 mb-2">
                  Рост (см)
                </label>
                <input
                  type="number"
                  id="height"
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value) || 170)}
                  min={100}
                  max={250}
                  className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-black focus:ring-2 focus:ring-black outline-none"
                />
              </div>

              <div>
                <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-2">
                  Текущий вес (кг)
                </label>
                <input
                  type="number"
                  id="weight"
                  value={weight}
                  onChange={(e) => setWeight(parseFloat(e.target.value) || 70)}
                  min={30}
                  max={300}
                  step="0.1"
                  className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-black focus:ring-2 focus:ring-black outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Активность */}
        {currentStep === 'activity' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center">
                <Activity size={24} className="text-gray-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Уровень активности</h1>
                <p className="text-sm text-gray-500">Как часто вы тренируетесь?</p>
              </div>
            </div>

            <div className="space-y-3">
              {([
                { value: 'sedentary', label: 'Сидячий образ жизни', desc: 'Минимальная активность' },
                { value: 'light', label: 'Легкая активность', desc: '1-3 тренировки в неделю' },
                { value: 'moderate', label: 'Умеренная активность', desc: '3-5 тренировок в неделю' },
                { value: 'active', label: 'Высокая активность', desc: '6-7 тренировок в неделю' },
                { value: 'very_active', label: 'Очень высокая активность', desc: '2 тренировки в день' }
              ] as const).map((activity) => (
                <button
                  key={activity.value}
                  type="button"
                  onClick={() => setActivityLevel(activity.value)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                    activityLevel === activity.value
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">{activity.label}</div>
                  <div className={`text-sm ${activityLevel === activity.value ? 'text-gray-200' : 'text-gray-500'}`}>
                    {activity.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Цель */}
        {currentStep === 'goal' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center">
                <Target size={24} className="text-gray-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Ваша цель</h1>
                <p className="text-sm text-gray-500">Что вы хотите достичь?</p>
              </div>
            </div>

            <div className="space-y-3">
              {([
                { value: 'lose', label: 'Похудеть', desc: 'Дефицит калорий -15%' },
                { value: 'maintain', label: 'Поддержать вес', desc: 'Баланс калорий' },
                { value: 'gain', label: 'Набрать вес', desc: 'Профицит калорий +10%' }
              ] as const).map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGoal(g.value)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                    goal === g.value
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">{g.label}</div>
                  <div className={`text-sm ${goal === g.value ? 'text-gray-200' : 'text-gray-500'}`}>
                    {g.desc}
                  </div>
                </button>
              ))}
            </div>

            {/* Preview расчетов */}
            {birthDate && (
              <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-sm font-medium text-gray-700 mb-2">Предварительный расчет:</div>
                {(() => {
                  const birth = new Date(birthDate)
                  const today = new Date()
                  const age = today.getFullYear() - birth.getFullYear() - 
                    (today.getMonth() < birth.getMonth() || 
                     (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate()) ? 1 : 0)
                  const bmr = calculateBMR(gender, weight, height, age)
                  const tdee = calculateTDEE(bmr, activityLevel)
                  const targetCalories = calculateTargetCalories(tdee, goal)
                  const macros = calculateMacros(targetCalories)

                  return (
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Базовый метаболизм (BMR): {Math.round(bmr)} ккал</div>
                      <div>Расход энергии (TDEE): {Math.round(tdee)} ккал</div>
                      <div className="font-semibold text-gray-900 mt-2">
                        Целевые калории: {targetCalories} ккал/день
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Белки: {macros.protein}г • Жиры: {macros.fats}г • Углеводы: {macros.carbs}г
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 'biometrics' || saving}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={16} />
            Назад
          </button>

          {currentStep === 'goal' ? (
            <button
              type="button"
              onClick={handleFinish}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Сохранение...' : 'Завершить настройку'}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
            >
              Далее
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </main>
  )
}


