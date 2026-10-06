'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { guestApi } from '../api/guest'
import type { ActivityLevel, FitnessGoal, GuestResult, Sex } from '../api/guest'
import { useGuestOnboardingStore, GUEST_STEPS, parametersOf } from '../store/guestOnboardingStore'
import { EVENTS, track } from '@/shared/analytics'
import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'

const goals: FitnessGoal[] = ['loss', 'maintain', 'gain']
const activityLevels: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active']
const sexes: Sex[] = ['female', 'male']

const fieldClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900'

/**
 * The calculator on the open page: every question on one screen, the answer
 * right under it.
 *
 * The same server formula as the wizard, and the wizard's own store: "save the
 * result" opens the wizard on its result screen with everything already filled
 * in, where the contact is left. The answers live in local state until then —
 * the store is persisted in the browser, and reading it during the first
 * render would differ from what the server rendered.
 */
export function KbzhuCalculator() {
    const router = useRouter()
    const loadIntoWizard = useGuestOnboardingStore((s) => s.load)
    const setWizardStep = useGuestOnboardingStore((s) => s.setStep)

    const [sex, setSex] = useState<Sex | ''>('')
    const [birthDate, setBirthDate] = useState('')
    const [heightCm, setHeightCm] = useState('')
    const [weightKg, setWeightKg] = useState('')
    const [activityLevel, setActivityLevel] = useState<ActivityLevel | ''>('')
    const [goal, setGoal] = useState<FitnessGoal | ''>('')

    const [result, setResult] = useState<GuestResult | null>(null)
    const [problem, setProblem] = useState<string | null>(null)
    const [calculating, setCalculating] = useState(false)

    const handleCalculate = async () => {
        const parameters = parametersOf({
            ...useGuestOnboardingStore.getState(),
            sex,
            birthDate,
            heightCm,
            weightKg,
            activityLevel,
            goal,
        })
        if (!parameters) {
            setProblem(t('onboarding.guest.fillAll'))
            return
        }

        setProblem(null)
        setCalculating(true)
        try {
            const calculated = await guestApi.calculate(parameters)
            setResult(calculated)
            loadIntoWizard(parameters, calculated)
            track(EVENTS.calculatorResult, {
                goal: parameters.goal,
                activity_level: parameters.activity_level,
            })
        } catch (err) {
            setResult(null)
            setProblem(messageForOr(err, t('onboarding.guest.calcFailed')))
        } finally {
            setCalculating(false)
        }
    }

    const handleSave = () => {
        setWizardStep(GUEST_STEPS.result)
        router.push('/onboarding')
    }

    const macros = result
        ? [
              { label: t('onboarding.guest.protein'), value: Math.round(result.protein) },
              { label: t('onboarding.guest.fat'), value: Math.round(result.fat) },
              { label: t('onboarding.guest.carbs'), value: Math.round(result.carbs) },
          ]
        : []

    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    void handleCalculate()
                }}
                className="grid gap-4 sm:grid-cols-2"
            >
                <fieldset className="sm:col-span-2">
                    <legend className="text-sm font-medium text-gray-900">{t('onboarding.sex')}</legend>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                        {sexes.map((value) => (
                            <label
                                key={value}
                                className={`flex cursor-pointer items-center justify-center rounded-lg border py-3 text-sm text-gray-900 ${
                                    sex === value ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-white'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="sex"
                                    value={value}
                                    checked={sex === value}
                                    onChange={() => setSex(value)}
                                    className="sr-only"
                                />
                                {value === 'female' ? t('onboarding.female') : t('onboarding.male')}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div>
                    <label htmlFor="calc-birth" className="block text-sm font-medium text-gray-900">
                        {t('onboarding.birthDate')}
                    </label>
                    <input
                        id="calc-birth"
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label htmlFor="calc-height" className="block text-sm font-medium text-gray-900">
                        {t('onboarding.guest.heightCm')}
                    </label>
                    <input
                        id="calc-height"
                        type="number"
                        inputMode="decimal"
                        value={heightCm}
                        onChange={(e) => setHeightCm(e.target.value)}
                        placeholder="170"
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label htmlFor="calc-weight" className="block text-sm font-medium text-gray-900">
                        {t('onboarding.guest.weightKg')}
                    </label>
                    <input
                        id="calc-weight"
                        type="number"
                        inputMode="decimal"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                        placeholder="65"
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label htmlFor="calc-activity" className="block text-sm font-medium text-gray-900">
                        {t('onboarding.activityLevel')}
                    </label>
                    <select
                        id="calc-activity"
                        value={activityLevel}
                        onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
                        className={fieldClass}
                    >
                        <option value="">{t('onboarding.calculator.choose')}</option>
                        {activityLevels.map((level) => (
                            <option key={level} value={level}>
                                {t(`onboarding.activity.${level}`)} — {t(`onboarding.activityHint.${level}`)}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="calc-goal" className="block text-sm font-medium text-gray-900">
                        {t('onboarding.goalLabel')}
                    </label>
                    <select
                        id="calc-goal"
                        value={goal}
                        onChange={(e) => setGoal(e.target.value as FitnessGoal)}
                        className={fieldClass}
                    >
                        <option value="">{t('onboarding.calculator.choose')}</option>
                        {goals.map((value) => (
                            <option key={value} value={value}>
                                {t(`onboarding.guestGoal.${value}`)}
                            </option>
                        ))}
                    </select>
                </div>

                {problem && (
                    <p role="alert" className="text-sm text-red-600 sm:col-span-2">
                        {problem}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={calculating}
                    className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60 sm:col-span-2"
                >
                    {calculating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {calculating ? t('onboarding.calculator.calculating') : t('onboarding.calculator.calculate')}
                </button>
            </form>

            {result && (
                <div className="mt-6 border-t border-gray-100 pt-6" aria-live="polite">
                    <h2 className="text-lg font-semibold text-gray-900">{t('onboarding.guest.resultTitle')}</h2>
                    <div className="mt-4 rounded-xl bg-gray-50 p-5 text-center">
                        <p className="text-sm text-gray-600">{t('onboarding.guest.calories')}</p>
                        <p className="text-4xl font-bold text-gray-900">{Math.round(result.calories)}</p>
                        <p className="text-sm text-gray-600">{t('onboarding.guest.kcalPerDay')}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                        {macros.map((macro) => (
                            <div key={macro.label} className="rounded-lg bg-gray-50 p-3 text-center">
                                <p className="text-xs text-gray-600">{macro.label}</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    <span>{macro.value}</span>
                                    <span className="text-xs font-normal text-gray-500">
                                        {' '}
                                        {t('onboarding.guest.gram')}
                                    </span>
                                </p>
                            </div>
                        ))}
                    </div>
                    <p className="mt-4 text-sm text-gray-600">{t('onboarding.calculator.saveHint')}</p>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="mt-3 w-full rounded-lg border border-blue-600 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
                    >
                        {t('onboarding.calculator.saveAndPlan')}
                    </button>
                </div>
            )}
        </section>
    )
}
