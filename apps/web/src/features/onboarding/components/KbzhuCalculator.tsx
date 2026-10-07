'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { guestApi } from '../api/guest'
import type { ActivityLevel, FitnessGoal, Sex } from '../api/guest'
import { useGuestOnboardingStore, GUEST_STEPS, parametersOf } from '../store/guestOnboardingStore'
import { EVENTS, track } from '@/shared/analytics'
import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
import { Button } from '@/shared/components/ui/Button'
import { MACRO_COLORS } from '@/shared/constants/macros'
import { cn } from '@/shared/utils/cn'

const goals: FitnessGoal[] = ['loss', 'maintain', 'gain']
const activityLevels: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active']
const sexes: Sex[] = ['female', 'male']

// Поле ввода по системе: 48 px, текст 16 px — iOS не масштабирует страницу.
const fieldClass =
    'h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums ' +
    'placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30'

const noSubscription = () => () => {}

/**
 * The calculator on the open page: every question on one screen, the answer
 * right under it.
 *
 * The same server formula as the wizard, and the wizard's own store, written
 * on every keystroke: the calculator and the wizard are two views of one set
 * of answers. The answers used to sit in local state and reach the store only
 * when a calculation succeeded, so the wizard showed whatever an earlier
 * visit had left there — or the numbers from before the last edit.
 *
 * The store is persisted in the browser, and the server rendered the form
 * empty: until the first render on the client is over, the form stays empty
 * too, or the two renders would differ.
 */
export function KbzhuCalculator() {
    const router = useRouter()
    const onClient = useSyncExternalStore(noSubscription, () => true, () => false)
    const stored = useGuestOnboardingStore()

    const sex = onClient ? stored.sex : ''
    const birthDate = onClient ? stored.birthDate : ''
    const heightCm = onClient ? stored.heightCm : ''
    const weightKg = onClient ? stored.weightKg : ''
    const activityLevel = onClient ? stored.activityLevel : ''
    const goal = onClient ? stored.goal : ''
    const result = onClient ? stored.result : null

    const [problem, setProblem] = useState<string | null>(null)
    const [calculating, setCalculating] = useState(false)

    const handleCalculate = async () => {
        const parameters = parametersOf(useGuestOnboardingStore.getState())
        if (!parameters) {
            setProblem(t('onboarding.guest.fillAll'))
            return
        }

        setProblem(null)
        setCalculating(true)
        try {
            const calculated = await guestApi.calculate(parameters)
            // An answer changed while the request was out: these numbers are
            // for parameters nobody is looking at any more.
            const current = parametersOf(useGuestOnboardingStore.getState())
            if (JSON.stringify(current) !== JSON.stringify(parameters)) return
            stored.setResult(calculated)
            stored.setStep(GUEST_STEPS.result)
            track(EVENTS.calculatorResult, {
                goal: parameters.goal,
                activity_level: parameters.activity_level,
            })
        } catch (err) {
            setProblem(messageForOr(err, t('onboarding.guest.calcFailed')))
        } finally {
            setCalculating(false)
        }
    }

    const handleSave = () => {
        stored.setStep(GUEST_STEPS.result)
        router.push('/onboarding')
    }

    const macros = result
        ? [
              { key: 'protein' as const, label: t('onboarding.guest.protein'), value: Math.round(result.protein) },
              { key: 'fat' as const, label: t('onboarding.guest.fat'), value: Math.round(result.fat) },
              { key: 'carbs' as const, label: t('onboarding.guest.carbs'), value: Math.round(result.carbs) },
          ]
        : []

    return (
        <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    void handleCalculate()
                }}
                className="grid gap-4 sm:grid-cols-2"
            >
                <fieldset className="sm:col-span-2">
                    <legend className="text-sm font-medium text-fg-muted">{t('onboarding.sex')}</legend>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                        {sexes.map((value) => (
                            <label
                                key={value}
                                className={cn(
                                    'flex h-12 cursor-pointer items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2',
                                    // Выбранное — инверсия чернилами: терракота у кнопки «Рассчитать».
                                    sex === value
                                        ? 'border-fg bg-fg text-fg-inverse'
                                        : 'border-line bg-surface text-fg hover:bg-subtle',
                                )}
                            >
                                <input
                                    type="radio"
                                    name="sex"
                                    value={value}
                                    checked={sex === value}
                                    onChange={() => stored.setSex(value)}
                                    className="sr-only"
                                />
                                {value === 'female' ? t('onboarding.female') : t('onboarding.male')}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div>
                    <label htmlFor="calc-birth" className="mb-1.5 block text-sm font-medium text-fg-muted">
                        {t('onboarding.birthDate')}
                    </label>
                    <input
                        id="calc-birth"
                        type="date"
                        value={birthDate}
                        onChange={(e) => stored.setBirthDate(e.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label htmlFor="calc-height" className="mb-1.5 block text-sm font-medium text-fg-muted">
                        {t('onboarding.guest.heightCm')}
                    </label>
                    <input
                        id="calc-height"
                        type="number"
                        inputMode="decimal"
                        value={heightCm}
                        onChange={(e) => stored.setHeightCm(e.target.value)}
                        placeholder="170"
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label htmlFor="calc-weight" className="mb-1.5 block text-sm font-medium text-fg-muted">
                        {t('onboarding.guest.weightKg')}
                    </label>
                    <input
                        id="calc-weight"
                        type="number"
                        inputMode="decimal"
                        value={weightKg}
                        onChange={(e) => stored.setWeightKg(e.target.value)}
                        placeholder="65"
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label htmlFor="calc-activity" className="mb-1.5 block text-sm font-medium text-fg-muted">
                        {t('onboarding.activityLevel')}
                    </label>
                    <select
                        id="calc-activity"
                        value={activityLevel}
                        onChange={(e) => stored.setActivityLevel(e.target.value as ActivityLevel | '')}
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
                    <label htmlFor="calc-goal" className="mb-1.5 block text-sm font-medium text-fg-muted">
                        {t('onboarding.goalLabel')}
                    </label>
                    <select
                        id="calc-goal"
                        value={goal}
                        onChange={(e) => stored.setGoal(e.target.value as FitnessGoal | '')}
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
                    <p role="alert" className="text-sm text-danger-fg sm:col-span-2">
                        {problem}
                    </p>
                )}

                <Button
                    type="submit"
                    disabled={calculating}
                    isLoading={calculating}
                    size="lg"
                    className="mt-2 sm:col-span-2"
                >
                    {calculating ? t('onboarding.calculator.calculating') : t('onboarding.calculator.calculate')}
                </Button>
            </form>

            {result && (
                <div className="mt-6 border-t border-line pt-6" aria-live="polite">
                    <h2 className="type-title-2 text-fg">{t('onboarding.guest.resultTitle')}</h2>
                    <div className="mt-4 rounded-tile bg-canvas p-5 text-center">
                        <p className="type-overline text-fg-subtle">{t('onboarding.guest.calories')}</p>
                        <p className="mt-1 type-num-xl text-fg">{Math.round(result.calories)}</p>
                        <p className="text-sm text-fg-muted">{t('onboarding.guest.kcalPerDay')}</p>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        {macros.map((macro) => (
                            <div key={macro.label} className="rounded-tile bg-canvas p-3 text-center">
                                <p className="flex items-center justify-center gap-1.5 type-caption text-fg-muted">
                                    <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: MACRO_COLORS[macro.key] }}
                                        aria-hidden="true"
                                    />
                                    {macro.label}
                                </p>
                                <p className="mt-0.5 type-num-l text-fg">
                                    <span>{macro.value}</span>
                                    <span className="text-xs font-normal text-fg-muted">
                                        {' '}
                                        {t('onboarding.guest.gram')}
                                    </span>
                                </p>
                            </div>
                        ))}
                    </div>
                    <p className="mt-4 text-sm text-fg-muted">{t('onboarding.calculator.saveHint')}</p>
                    {/* Контуром: главное действие формы — «Рассчитать», вторая
                        терракотовая кнопка на экране спорила бы с ней. */}
                    <Button type="button" variant="secondary" size="lg" block onClick={handleSave} className="mt-3">
                        {t('onboarding.calculator.saveAndPlan')}
                    </Button>
                </div>
            )}
        </section>
    )
}
