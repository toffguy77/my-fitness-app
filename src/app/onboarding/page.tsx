// Страница Onboarding - мастер настройки для новых пользователей
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { ArrowRight, ArrowLeft, User as UserIcon, Activity, Target } from 'lucide-react'
import { logger } from '@/utils/logger'
import DateInput from '@/components/DateInput'
import OnboardingTooltip from '@/components/onboarding/OnboardingTooltip'
import { trackOnboardingStart, trackOnboardingComplete } from '@/utils/analytics/metrics'

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
  const [height, setHeight] = useState<number | ''>(170)
  const [weight, setWeight] = useState<number | ''>(70)

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

        // Отслеживаем начало онбординга
        trackOnboardingStart()

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
      if (!birthDate || !height || typeof height !== 'number' || height < 100 || height > 250 || !weight || typeof weight !== 'number' || weight < 30 || weight > 300) {
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

      // Проверяем, что height и weight - числа (не пустые строки)
      if (typeof height !== 'number' || typeof weight !== 'number') {
        setError('Пожалуйста, заполните все поля корректно')
        setSaving(false)
        return
      }

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
      const todayDate = new Date().toISOString().split('T')[0]
      const { error: weightError } = await supabase
        .from('daily_logs')
        .upsert({
          user_id: user.id,
          date: todayDate,
          weight: weight,
          actual_calories: 0,
          actual_protein: 0,
          actual_fats: 0,
          actual_carbs: 0,
          meals: []
        }, { onConflict: 'user_id, date' })

      if (weightError) {
        logger.warn('Onboarding: ошибка сохранения веса', { error: weightError.message })
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
      <div className="w-full min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-zinc-400">Загрузка...</div>
        </div>
      </div>
    )
  }

  return (
    <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 md:max-w-2xl md:mx-auto font-sans">
      <div className="bg-zinc-900 rounded-2xl p-6 sm:p-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-zinc-100">
              Шаг {currentStep === 'biometrics' ? '1' : currentStep === 'activity' ? '2' : '3'} из 3
            </span>
            <span className="text-sm font-medium text-zinc-400">
              {currentStep === 'biometrics' ? 'Биометрия' : currentStep === 'activity' ? 'Активность' : 'Цель'}
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
            <div
              className="bg-white h-3 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
              style={{ width: `${(currentStep === 'biometrics' ? 1 : currentStep === 'activity' ? 2 : 3) * 33.33}%` }}
            >
              <span className="text-xs font-medium text-zinc-950 tabular-nums">
                {Math.round((currentStep === 'biometrics' ? 1 : currentStep === 'activity' ? 2 : 3) * 33.33)}%
              </span>
            </div>
          </div>
          {/* Step indicators */}
          <div className="flex items-center justify-between mt-3">
            {(['biometrics', 'activity', 'goal'] as OnboardingStep[]).map((step, index) => {
              const stepNumber = index + 1
              const isActive = currentStep === step
              const isCompleted = (currentStep === 'activity' && step === 'biometrics') ||
                                  (currentStep === 'goal' && (step === 'biometrics' || step === 'activity'))

              return (
                <div key={step} className="flex flex-col items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-white text-zinc-950 scale-110'
                      : isCompleted
                        ? 'bg-zinc-700 text-zinc-100'
                        : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {isCompleted ? '✓' : stepNumber}
                  </div>
                  <span className={`text-xs mt-1 text-center ${
                    isActive ? 'text-zinc-100 font-medium' : 'text-zinc-500'
                  }`}>
                    {step === 'biometrics' ? 'Биометрия' : step === 'activity' ? 'Активность' : 'Цель'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-zinc-800 border border-red-400/20 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Step 1: Биометрия */}
        {currentStep === 'biometrics' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 bg-zinc-800 rounded-full flex items-center justify-center">
                <UserIcon size={24} className="text-zinc-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-zinc-100">Расскажите о себе</h1>
                  <OnboardingTooltip
                    title="Зачем нужны эти данные?"
                    content="Биометрические данные используются для точного расчета вашего базового метаболизма (BMR) и ежедневного расхода энергии (TDEE). Это позволяет создать персональный план питания, который поможет достичь ваших целей."
                    position="top"
                  />
                </div>
                <p className="text-sm text-zinc-400">Эти данные нужны для расчета ваших целей</p>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="block text-sm font-medium text-zinc-100">Пол</label>
                <OnboardingTooltip
                  content="Пол влияет на расчет базового метаболизма, так как у мужчин и женщин разный уровень метаболизма."
                  position="top"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['male', 'female', 'other'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`p-4 rounded-xl border-2 transition-colors ${gender === g
                        ? 'border-white bg-white text-zinc-950'
                        : 'border-zinc-800 bg-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                  >
                    {g === 'male' ? 'Мужской' : g === 'female' ? 'Женский' : 'Другое'}
                  </button>
                ))}
              </div>
            </div>

            <DateInput
              id="birthDate"
              label="Дата рождения"
              value={birthDate}
              onChange={setBirthDate}
              maxDate={new Date().toISOString().split('T')[0]}
              className="w-full"
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="height" className="block text-sm font-medium text-zinc-100 mb-2">
                  Рост (см)
                </label>
                <input
                  type="number"
                  id="height"
                  value={height === '' ? '' : height}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '') {
                      setHeight('')
                    } else {
                      const num = parseInt(val, 10)
                      if (!isNaN(num)) {
                        setHeight(num)
                      }
                    }
                  }}
                  min={100}
                  max={250}
                  className="w-full p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none placeholder:text-zinc-600 tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="weight" className="block text-sm font-medium text-zinc-100 mb-2">
                  Текущий вес (кг)
                </label>
                <input
                  type="number"
                  id="weight"
                  value={weight === '' ? '' : weight}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '') {
                      setWeight('')
                    } else {
                      const num = parseFloat(val)
                      if (!isNaN(num)) {
                        setWeight(num)
                      }
                    }
                  }}
                  min={30}
                  max={300}
                  step="0.1"
                  className="w-full p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-100 focus:ring-2 focus:ring-zinc-700 outline-none placeholder:text-zinc-600 tabular-nums"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Активность */}
        {currentStep === 'activity' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 bg-zinc-800 rounded-full flex items-center justify-center">
                <Activity size={24} className="text-zinc-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-zinc-100">Уровень активности</h1>
                  <OnboardingTooltip
                    title="Что такое уровень активности?"
                    content="Уровень активности определяет коэффициент, на который умножается ваш базовый метаболизм. Чем выше активность, тем больше калорий вам нужно для поддержания веса."
                    position="top"
                  />
                </div>
                <p className="text-sm text-zinc-400">Как часто вы тренируетесь?</p>
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
                  className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${activityLevel === activity.value
                      ? 'border-white bg-white text-zinc-950'
                      : 'border-zinc-800 bg-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                >
                  <div className="font-semibold">{activity.label}</div>
                  <div className={`text-sm ${activityLevel === activity.value ? 'text-zinc-600' : 'text-zinc-400'}`}>
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
              <div className="h-12 w-12 bg-zinc-800 rounded-full flex items-center justify-center">
                <Target size={24} className="text-zinc-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-zinc-100">Ваша цель</h1>
                  <OnboardingTooltip
                    title="Как работает расчет целей?"
                    content="В зависимости от выбранной цели система автоматически корректирует калорийность: для похудения создается дефицит 15%, для набора веса - профицит 10%, для поддержания - баланс."
                    position="top"
                  />
                </div>
                <p className="text-sm text-zinc-400">Что вы хотите достичь?</p>
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
                  className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${goal === g.value
                      ? 'border-white bg-white text-zinc-950'
                      : 'border-zinc-800 bg-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                >
                  <div className="font-semibold">{g.label}</div>
                  <div className={`text-sm ${goal === g.value ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {g.desc}
                  </div>
                </button>
              ))}
            </div>

            {/* Preview расчетов */}
            {birthDate && typeof height === 'number' && typeof weight === 'number' && (
              <div className="mt-6 p-4 bg-zinc-800 rounded-xl">
                <div className="text-sm font-medium text-zinc-100 mb-2">Предварительный расчет:</div>
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
                    <div className="text-sm text-zinc-400 space-y-1 tabular-nums">
                      <div>Базовый метаболизм (BMR): {Math.round(bmr)} ккал</div>
                      <div>Расход энергии (TDEE): {Math.round(tdee)} ккал</div>
                      <div className="font-semibold text-zinc-100 mt-2">
                        Целевые калории: {targetCalories} ккал/день
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
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
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 'biometrics' || saving}
            className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={16} />
            Назад
          </button>

          {currentStep === 'goal' ? (
            <button
              type="button"
              onClick={handleFinish}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-white text-zinc-950 rounded-xl font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Сохранение...' : 'Завершить настройку'}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-white text-zinc-950 rounded-xl font-medium hover:bg-zinc-200 transition-colors"
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
