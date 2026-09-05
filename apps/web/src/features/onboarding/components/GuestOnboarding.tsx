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
import { EVENTS, track, TrackView } from '@/shared/analytics'
import { t } from '@/shared/i18n'

const goals: FitnessGoal[] = ['loss', 'maintain', 'gain']

const activityLevels: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active']

const sexes: Sex[] = ['female', 'male']

// Only its length is read during render; the titles themselves come from the
// dictionary at the point of use.
const stepCount = 5

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
            .catch(() => toast.error(t('onboarding.guest.linkExpired')))
        // Runs once for the token in the URL.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumeToken])

    const recordStep = useCallback((step: number) => {
        // Measured for everybody, saved on the server only for somebody who
        // left a contact: the funnel needs the anonymous half most of all.
        track(EVENTS.onboardingStep, { step: GUEST_STEP_NAMES[step] ?? 'unknown' })

        const token = leadToken()
        if (!token) return
        // Best effort: the step is a hint for whoever follows up, not the
        // visitor's data, and it must never interrupt them.
        guestApi.updateStep(token, GUEST_STEP_NAMES[step] ?? 'unknown').catch(() => {})
    }, [])

    const handleCalculate = async () => {
        const parameters = parametersOf(state)
        if (!parameters) {
            toast.error(t('onboarding.guest.fillAll'))
            return
        }

        setCalculating(true)
        try {
            const result = await guestApi.calculate(parameters)
            track(EVENTS.onboardingResult, {
                goal: parameters.goal,
                activity_level: parameters.activity_level,
            })
            state.setResult(result)
            state.setStep(GUEST_STEPS.result)
            recordStep(GUEST_STEPS.result)
        } catch {
            toast.error(t('onboarding.guest.calcFailed'))
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
            <TrackView event={EVENTS.onboardingStarted} />
            <StepIndicator
                currentStep={Math.min(state.step, stepCount - 1)}
                totalSteps={stepCount}
            />

            <div className="mt-8 flex-1">
                {state.step === GUEST_STEPS.goal && (
                    <section>
                        <h1 className="text-xl font-bold text-gray-900">{t('onboarding.guest.goalTitle')}</h1>
                        <p className="mt-2 text-sm text-gray-600">
                            {t('onboarding.guest.goalHint')}
                        </p>
                        <div className="mt-6 space-y-3">
                            {goals.map((goal) => (
                                <button
                                    key={goal}
                                    onClick={() => state.setGoal(goal)}
                                    aria-pressed={state.goal === goal}
                                    className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                                        state.goal === goal
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-gray-300 bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    <span className="block text-sm font-medium text-gray-900">
                                        {t(`onboarding.guestGoal.${goal}`)}
                                    </span>
                                    <span className="block text-xs text-gray-500">
                                        {t(`onboarding.guestGoalHint.${goal}`)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {state.step === GUEST_STEPS.body && (
                    <section>
                        <h1 className="text-xl font-bold text-gray-900">{t('onboarding.guest.bodyTitle')}</h1>
                        <p className="mt-2 text-sm text-gray-600">
                            {t('onboarding.guest.bodyHint')}
                        </p>

                        <fieldset className="mt-6">
                            <legend className="text-sm font-medium text-gray-900">{t('onboarding.sex')}</legend>
                            <div className="mt-2 grid grid-cols-2 gap-3">
                                {sexes.map((sex) => (
                                    <button
                                        key={sex}
                                        onClick={() => state.setSex(sex)}
                                        aria-pressed={state.sex === sex}
                                        className={`rounded-lg border py-3 text-sm transition-colors ${
                                            state.sex === sex
                                                ? 'border-blue-600 bg-blue-50 text-gray-900'
                                                : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
                                        }`}
                                    >
                                        {sex === 'female' ? t('onboarding.female') : t('onboarding.male')}
                                    </button>
                                ))}
                            </div>
                        </fieldset>

                        <div className="mt-6 space-y-4">
                            <div>
                                <label htmlFor="guest-birth" className="block text-sm font-medium text-gray-900">
                                    {t('onboarding.birthDate')}
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
                                    {t('onboarding.guest.heightCm')}
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
                                    {t('onboarding.guest.weightKg')}
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
                        <h1 className="text-xl font-bold text-gray-900">{t('onboarding.guest.activityTitle')}</h1>
                        <p className="mt-2 text-sm text-gray-600">{t('onboarding.guest.activityHint')}</p>
                        <div className="mt-6 space-y-3">
                            {activityLevels.map((level) => (
                                <button
                                    key={level}
                                    onClick={() => state.setActivityLevel(level)}
                                    aria-pressed={state.activityLevel === level}
                                    className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                                        state.activityLevel === level
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-gray-300 bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    <span className="block text-sm font-medium text-gray-900">
                                        {t(`onboarding.activity.${level}`)}
                                    </span>
                                    <span className="block text-xs text-gray-500">
                                        {t(`onboarding.activityHint.${level}`)}
                                    </span>
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
                        {state.step === GUEST_STEPS.activity
                            ? t('onboarding.guest.showMyNorm')
                            : t('onboarding.guest.next')}
                    </button>

                    {state.step > GUEST_STEPS.goal && (
                        <button
                            onClick={state.back}
                            className="w-full text-sm text-gray-600 hover:text-gray-900"
                        >
                            {t('onboarding.guest.back')}
                        </button>
                    )}
                </div>
            )}

            <p className="mt-8 text-center text-sm text-gray-600">
                {t('onboarding.guest.haveAccount')}{' '}
                <a href="/auth" className="text-blue-600 hover:underline">
                    {t('onboarding.guest.signIn')}
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
        { label: t('onboarding.guest.protein'), value: Math.round(result.protein) },
        { label: t('onboarding.guest.fat'), value: Math.round(result.fat) },
        { label: t('onboarding.guest.carbs'), value: Math.round(result.carbs) },
    ]

    return (
        <section>
            <h1 className="text-xl font-bold text-gray-900">{t('onboarding.guest.resultTitle')}</h1>
            <p className="mt-2 text-sm text-gray-600">
                {t('onboarding.guest.resultHint')}
            </p>

            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 text-center">
                <p className="text-sm text-gray-600">{t('onboarding.guest.calories')}</p>
                <p className="text-4xl font-bold text-gray-900" data-testid="guest-calories">
                    {Math.round(result.calories)}
                </p>
                <p className="text-sm text-gray-600">{t('onboarding.guest.kcalPerDay')}</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
                {macros.map((macro) => (
                    <div key={macro.label} className="rounded-lg border border-gray-200 bg-white p-3 text-center">
                        <p className="text-xs text-gray-600">{macro.label}</p>
                        <p className="text-lg font-semibold text-gray-900">
                            {macro.value}
                            <span className="text-xs font-normal text-gray-500">
                                {' '}
                                {t('onboarding.guest.gram')}
                            </span>
                        </p>
                    </div>
                ))}
            </div>

            <p className="mt-4 text-sm text-gray-600">
                {t('onboarding.guest.water', { glasses: result.water_glasses })}
            </p>

            <button
                onClick={onSave}
                className="mt-8 w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
                {t('onboarding.guest.saveResult')}
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
            track(EVENTS.leadSaved, { contact_consent: contactConsent })
            toast.success(t('onboarding.guest.saved'))
            onSaved()
        } catch {
            toast.error(t('onboarding.guest.saveFailed'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <section>
            <h1 className="text-xl font-bold text-gray-900">{t('onboarding.guest.saveTitle')}</h1>
            <p className="mt-2 text-sm text-gray-600">
                {t('onboarding.guest.saveHint')}
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
                        {t('onboarding.guest.nameOptional')}
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
                        {t('onboarding.guest.consent')}
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
                        {t('onboarding.guest.reminder')}
                    </span>
                </label>
            </div>

            <button
                onClick={handleSave}
                disabled={!email || !dataConsent || saving}
                className="mt-8 w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
                {saving ? t('onboarding.guest.saving') : t('onboarding.guest.saveAndContinue')}
            </button>

            <button onClick={onSkip} className="mt-3 w-full text-sm text-gray-600 hover:text-gray-900">
                {t('onboarding.guest.continueWithoutSaving')}
            </button>
        </section>
    )
}
