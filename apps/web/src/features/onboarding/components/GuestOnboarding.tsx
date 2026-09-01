'use client'

/**
 * The onboarding a visitor does before they have an account.
 *
 * It asks only what the calculation needs, shows the result, and only then
 * offers to save it. The registration form used to stand first, before the
 * product had shown anybody anything.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

import {
    guestApi,
    rememberLeadToken,
    leadToken,
    type ActivityLevel,
    type FitnessGoal,
    type Sex,
} from '../api/guest'
import {
    useGuestOnboardingStore,
    parametersOf,
    GUEST_STEPS,
    GUEST_STEP_NAMES,
} from '../store/guestOnboardingStore'
import { StepIndicator } from './StepIndicator'
import { SupportLink } from '@/shared/components/SupportLink'

const goals: { value: FitnessGoal; label: string; hint: string }[] = [
    { value: 'loss', label: 'Снизить вес', hint: 'дефицит калорий' },
    { value: 'maintain', label: 'Удержать вес', hint: 'норма поддержания' },
    { value: 'gain', label: 'Набрать массу', hint: 'профицит калорий' },
]

const activityLevels: { value: ActivityLevel; label: string; hint: string }[] = [
    { value: 'sedentary', label: 'Сидячий образ жизни', hint: 'офис, мало ходьбы' },
    { value: 'light', label: 'Лёгкая активность', hint: '1–2 тренировки в неделю' },
    { value: 'moderate', label: 'Умеренная активность', hint: '3–4 тренировки в неделю' },
    { value: 'active', label: 'Высокая активность', hint: '5+ тренировок в неделю' },
]

const stepTitles = ['Цель', 'Параметры', 'Активность', 'Результат', 'Сохранить']

export function GuestOnboarding() {
    const router = useRouter()
    const params = useSearchParams()
    const state = useGuestOnboardingStore()
    const [calculating, setCalculating] = useState(false)

    const resumeToken = params.get('resume')

    // Coming back through the link in the reminder: their own answers, not a
    // blank form.
    useEffect(() => {
        if (!resumeToken) return
        guestApi
            .resume(resumeToken)
            .then((lead) => {
                rememberLeadToken(resumeToken)
                state.load(lead.parameters, lead.result)
            })
            .catch(() => toast.error('Ссылка устарела — параметры можно ввести заново'))
        // Runs once for the token in the URL.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumeToken])

    const recordStep = useCallback((step: number) => {
        const token = leadToken()
        if (!token) return
        // Best effort: the step is a hint for whoever follows up, not the
        // visitor's data, and it must never interrupt them.
        guestApi.updateStep(token, GUEST_STEP_NAMES[step] ?? 'unknown').catch(() => {})
    }, [])

    const handleCalculate = async () => {
        const parameters = parametersOf(state)
        if (!parameters) {
            toast.error('Заполните все параметры')
            return
        }

        setCalculating(true)
        try {
            const result = await guestApi.calculate(parameters)
            state.setResult(result)
            state.setStep(GUEST_STEPS.result)
            recordStep(GUEST_STEPS.result)
        } catch {
            toast.error('Не удалось выполнить расчёт. Проверьте параметры.')
        } finally {
            setCalculating(false)
        }
    }

    const canContinue = () => {
        switch (state.step) {
            case GUEST_STEPS.goal:
                return state.goal !== ''
            case GUEST_STEPS.body:
                return (
                    state.sex !== '' &&
                    state.birthDate !== '' &&
                    state.heightCm !== '' &&
                    state.weightKg !== ''
                )
            case GUEST_STEPS.activity:
                return state.activityLevel !== ''
            default:
                return true
        }
    }

    return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
            <StepIndicator
                currentStep={Math.min(state.step, stepTitles.length - 1)}
                totalSteps={stepTitles.length}
            />

            <div className="mt-8 flex-1">
                {state.step === GUEST_STEPS.goal && (
                    <section>
                        <h1 className="text-xl font-bold text-gray-900">Какая у вас цель?</h1>
                        <p className="mt-2 text-sm text-gray-600">
                            От неё зависит норма калорий — расчёт займёт минуту и не потребует аккаунта.
                        </p>
                        <div className="mt-6 space-y-3">
                            {goals.map((goal) => (
                                <button
                                    key={goal.value}
                                    onClick={() => state.setGoal(goal.value)}
                                    aria-pressed={state.goal === goal.value}
                                    className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                                        state.goal === goal.value
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-gray-300 bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    <span className="block text-sm font-medium text-gray-900">
                                        {goal.label}
                                    </span>
                                    <span className="block text-xs text-gray-500">{goal.hint}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {state.step === GUEST_STEPS.body && (
                    <section>
                        <h1 className="text-xl font-bold text-gray-900">Ваши параметры</h1>
                        <p className="mt-2 text-sm text-gray-600">
                            Нужны для расчёта. Пока вы не сохраните результат, они остаются в этом браузере.
                        </p>

                        <fieldset className="mt-6">
                            <legend className="text-sm font-medium text-gray-900">Пол</legend>
                            <div className="mt-2 grid grid-cols-2 gap-3">
                                {(
                                    [
                                        { value: 'female', label: 'Женский' },
                                        { value: 'male', label: 'Мужской' },
                                    ] as { value: Sex; label: string }[]
                                ).map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => state.setSex(option.value)}
                                        aria-pressed={state.sex === option.value}
                                        className={`rounded-lg border py-3 text-sm transition-colors ${
                                            state.sex === option.value
                                                ? 'border-blue-600 bg-blue-50 text-gray-900'
                                                : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </fieldset>

                        <div className="mt-6 space-y-4">
                            <div>
                                <label htmlFor="guest-birth" className="block text-sm font-medium text-gray-900">
                                    Дата рождения
                                </label>
                                <input
                                    id="guest-birth"
                                    type="date"
                                    value={state.birthDate}
                                    onChange={(e) => state.setBirthDate(e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900"
                                />
                            </div>
                            <div>
                                <label htmlFor="guest-height" className="block text-sm font-medium text-gray-900">
                                    Рост, см
                                </label>
                                <input
                                    id="guest-height"
                                    type="number"
                                    inputMode="decimal"
                                    value={state.heightCm}
                                    onChange={(e) => state.setHeightCm(e.target.value)}
                                    placeholder="170"
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900"
                                />
                            </div>
                            <div>
                                <label htmlFor="guest-weight" className="block text-sm font-medium text-gray-900">
                                    Вес, кг
                                </label>
                                <input
                                    id="guest-weight"
                                    type="number"
                                    inputMode="decimal"
                                    value={state.weightKg}
                                    onChange={(e) => state.setWeightKg(e.target.value)}
                                    placeholder="65"
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900"
                                />
                            </div>
                        </div>
                    </section>
                )}

                {state.step === GUEST_STEPS.activity && (
                    <section>
                        <h1 className="text-xl font-bold text-gray-900">Насколько вы активны?</h1>
                        <p className="mt-2 text-sm text-gray-600">Последний вопрос перед расчётом.</p>
                        <div className="mt-6 space-y-3">
                            {activityLevels.map((level) => (
                                <button
                                    key={level.value}
                                    onClick={() => state.setActivityLevel(level.value)}
                                    aria-pressed={state.activityLevel === level.value}
                                    className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                                        state.activityLevel === level.value
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-gray-300 bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    <span className="block text-sm font-medium text-gray-900">
                                        {level.label}
                                    </span>
                                    <span className="block text-xs text-gray-500">{level.hint}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {state.step === GUEST_STEPS.result && state.result && (
                    <GuestResultView
                        result={state.result}
                        onSave={() => {
                            state.setStep(GUEST_STEPS.contact)
                            recordStep(GUEST_STEPS.contact)
                        }}
                    />
                )}

                {state.step === GUEST_STEPS.contact && (
                    <GuestContactStep
                        onSaved={() => router.push('/auth?mode=register')}
                        onSkip={() => router.push('/auth?mode=register')}
                    />
                )}
            </div>

            {state.step <= GUEST_STEPS.activity && (
                <div className="mt-8 space-y-3">
                    <button
                        onClick={() => {
                            if (state.step === GUEST_STEPS.activity) {
                                handleCalculate()
                                return
                            }
                            state.next()
                            recordStep(state.step + 1)
                        }}
                        disabled={!canContinue() || calculating}
                        className="flex w-full items-center justify-center rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                        {calculating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {state.step === GUEST_STEPS.activity ? 'Показать мою норму' : 'Далее'}
                    </button>

                    {state.step > GUEST_STEPS.goal && (
                        <button
                            onClick={state.back}
                            className="w-full text-sm text-gray-600 hover:text-gray-900"
                        >
                            Назад
                        </button>
                    )}
                </div>
            )}

            <p className="mt-8 text-center text-sm text-gray-600">
                Уже есть аккаунт?{' '}
                <a href="/auth" className="text-blue-600 hover:underline">
                    Войти
                </a>
            </p>

            {/* Somewhere to ask before there is a curator to ask. */}
            <p className="mt-3 text-center">
                <SupportLink />
            </p>
        </main>
    )
}

function GuestResultView({
    result,
    onSave,
}: {
    result: { calories: number; protein: number; fat: number; carbs: number; water_glasses: number }
    onSave: () => void
}) {
    const macros = [
        { label: 'Белки', value: Math.round(result.protein), unit: 'г' },
        { label: 'Жиры', value: Math.round(result.fat), unit: 'г' },
        { label: 'Углеводы', value: Math.round(result.carbs), unit: 'г' },
    ]

    return (
        <section>
            <h1 className="text-xl font-bold text-gray-900">Ваша дневная норма</h1>
            <p className="mt-2 text-sm text-gray-600">
                Рассчитано по вашим параметрам — это то, с чем работает дневник питания.
            </p>

            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 text-center">
                <p className="text-sm text-gray-600">Калории</p>
                <p className="text-4xl font-bold text-gray-900" data-testid="guest-calories">
                    {Math.round(result.calories)}
                </p>
                <p className="text-sm text-gray-600">ккал в день</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
                {macros.map((macro) => (
                    <div key={macro.label} className="rounded-lg border border-gray-200 bg-white p-3 text-center">
                        <p className="text-xs text-gray-600">{macro.label}</p>
                        <p className="text-lg font-semibold text-gray-900">
                            {macro.value}
                            <span className="text-xs font-normal text-gray-500"> {macro.unit}</span>
                        </p>
                    </div>
                ))}
            </div>

            <p className="mt-4 text-sm text-gray-600">
                Вода: {result.water_glasses} стаканов по 250 мл в день.
            </p>

            <button
                onClick={onSave}
                className="mt-8 w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
                Сохранить результат
            </button>
        </section>
    )
}

function GuestContactStep({ onSaved, onSkip }: { onSaved: () => void; onSkip: () => void }) {
    const state = useGuestOnboardingStore()
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')
    const [dataConsent, setDataConsent] = useState(false)
    const [contactConsent, setContactConsent] = useState(false)
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        const parameters = parametersOf(state)
        if (!parameters || !email || !dataConsent) return

        setSaving(true)
        try {
            const { token } = await guestApi.createLead({
                email,
                name,
                parameters,
                result: state.result,
                last_step: 'contact',
                source: typeof document !== 'undefined' ? document.referrer : '',
                consents: { data_processing: dataConsent, contact: contactConsent },
            })
            rememberLeadToken(token)
            toast.success('Результат сохранён')
            onSaved()
        } catch {
            toast.error('Не удалось сохранить результат')
        } finally {
            setSaving(false)
        }
    }

    return (
        <section>
            <h1 className="text-xl font-bold text-gray-900">Куда прислать результат?</h1>
            <p className="mt-2 text-sm text-gray-600">
                Сохраним расчёт, чтобы вы могли вернуться к нему с любого устройства и не вводить
                параметры заново.
            </p>

            <div className="mt-6 space-y-4">
                <div>
                    <label htmlFor="guest-email" className="block text-sm font-medium text-gray-900">
                        Email
                    </label>
                    <input
                        id="guest-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900"
                    />
                </div>
                <div>
                    <label htmlFor="guest-name" className="block text-sm font-medium text-gray-900">
                        Имя (необязательно)
                    </label>
                    <input
                        id="guest-name"
                        type="text"
                        autoComplete="given-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900"
                    />
                </div>
            </div>

            {/* Two consents, not one: saving the result and writing to you are
                different permissions, and bundling them makes neither explicit. */}
            <div className="mt-6 space-y-3">
                <label className="flex cursor-pointer items-start gap-3">
                    <input
                        type="checkbox"
                        checked={dataConsent}
                        onChange={(e) => setDataConsent(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-600">
                        Согласен на обработку персональных данных, включая указанные параметры тела
                    </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                    <input
                        type="checkbox"
                        checked={contactConsent}
                        onChange={(e) => setContactConsent(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-600">
                        Можно напомнить мне о сохранённом расчёте письмом — один раз
                    </span>
                </label>
            </div>

            <button
                onClick={handleSave}
                disabled={!email || !dataConsent || saving}
                className="mt-8 w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
                {saving ? 'Сохраняем...' : 'Сохранить и продолжить'}
            </button>

            <button onClick={onSkip} className="mt-3 w-full text-sm text-gray-600 hover:text-gray-900">
                Продолжить без сохранения
            </button>
        </section>
    )
}
