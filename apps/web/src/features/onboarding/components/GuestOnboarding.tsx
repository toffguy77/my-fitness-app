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
import { CheckCircle2, Droplet } from 'lucide-react'
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
import { SupportWidget } from '@/features/support/components/SupportWidget'
import { EVENTS, track, TrackView } from '@/shared/analytics'
import { storedAttribution, counterClientId } from '@/shared/analytics/attribution'
import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
import { Button } from '@/shared/components/ui/Button'
import { MACRO_COLORS } from '@/shared/constants/macros'
import { cn } from '@/shared/utils/cn'

// Поле ввода по системе: 48 px, текст 16 px — iOS не масштабирует страницу.
const FIELD =
    'h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums ' +
    'placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30'

// Выбранный вариант — инверсия чернилами, а не терракота: терракота у кнопки
// «Далее», и второй акцент рядом с ней спорил бы с ней за внимание.
function option(selected: boolean) {
    return cn(
        'w-full min-h-14 rounded-tile border px-4 py-3.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
        selected ? 'border-fg bg-fg text-fg-inverse' : 'border-line bg-surface text-fg hover:bg-subtle',
    )
}

function chip(selected: boolean) {
    return cn(
        'h-12 rounded-full border text-sm font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
        selected ? 'border-fg bg-fg text-fg-inverse' : 'border-line bg-surface text-fg hover:bg-subtle',
    )
}

const goals: FitnessGoal[] = ['loss', 'maintain', 'gain']

const activityLevels: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active']

const sexes: Sex[] = ['female', 'male']

// Only its length is read during render; the titles themselves come from the
// dictionary at the point of use.
const stepCount = 5

/**
 * Передаёт идентификатор браузера заявке, когда счётчик его выдаст.
 *
 * Намеренно не ожидается: обратный вызов счётчика не приходит вовсе, если
 * стоит блокировщик или согласия не было. Ожидание стоило бы контакта всем,
 * у кого блокировщик, — в обмен на атрибуцию, которой в этом случае всё
 * равно не было бы.
 */
function attachBrowserId(token: string): void {
    void counterClientId().then((clientId) => {
        if (clientId) {
            void guestApi.attachClientId(token, clientId).catch(() => {})
        }
    })
}

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
        } catch (err) {
            // «Подождите немного» — указание, что делать дальше. Заготовка
            // «проверьте параметры» посылала проверять то, что в порядке.
            toast.error(messageForOr(err, t('onboarding.guest.calcFailed')))
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
        // pb-24 (96px), not the pt-8's matching 32px: SupportWidget floats
        // fixed at bottom-6/right-6 with a 48px-tall collapsed button, so its
        // footprint reaches ~72px above the viewport bottom. On the goal/body/
        // activity steps the "mt-8 flex-1" block above absorbs all spare
        // height in this min-h-screen column, pinning the "Далее"/"Показать
        // мою норму" button flush to this padding — with the old 32px it sat
        // inside the widget's footprint and the corner was unreachable
        // (arithmetic: button spans ~32-80px from the bottom, bubble spans
        // 24-72px). 96px clears it with margin. Guarded by
        // e2e/tests/guest-onboarding.spec.ts ("не даёт плавающему виджету
        // перекрыть кнопку продолжения").
        <main className="mx-auto flex min-h-screen max-w-md flex-col bg-canvas px-screen-x pt-8 pb-24">
            <TrackView event={EVENTS.onboardingStarted} />
            <StepIndicator
                currentStep={Math.min(state.step, stepCount - 1)}
                totalSteps={stepCount}
            />

            <div className="mt-8 flex-1">
                {state.step === GUEST_STEPS.goal && (
                    <section>
                        <h1 className="type-title-1 text-fg">{t('onboarding.guest.goalTitle')}</h1>
                        <p className="mt-3 type-body text-fg-muted">
                            {t('onboarding.guest.goalHint')}
                        </p>
                        <div className="mt-8 space-y-3">
                            {goals.map((goal) => (
                                <button
                                    key={goal}
                                    onClick={() => state.setGoal(goal)}
                                    aria-pressed={state.goal === goal}
                                    className={option(state.goal === goal)}
                                >
                                    <span className="block type-headline">
                                        {t(`onboarding.guestGoal.${goal}`)}
                                    </span>
                                    <span className="mt-0.5 block text-sm opacity-75">
                                        {t(`onboarding.guestGoalHint.${goal}`)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {state.step === GUEST_STEPS.body && (
                    <section>
                        <h1 className="type-title-1 text-fg">{t('onboarding.guest.bodyTitle')}</h1>
                        <p className="mt-3 type-body text-fg-muted">
                            {t('onboarding.guest.bodyHint')}
                        </p>

                        <fieldset className="mt-6">
                            <legend className="text-sm font-medium text-fg-muted">{t('onboarding.sex')}</legend>
                            <div className="mt-1.5 grid grid-cols-2 gap-2">
                                {sexes.map((sex) => (
                                    <button
                                        key={sex}
                                        onClick={() => state.setSex(sex)}
                                        aria-pressed={state.sex === sex}
                                        className={chip(state.sex === sex)}
                                    >
                                        {sex === 'female' ? t('onboarding.female') : t('onboarding.male')}
                                    </button>
                                ))}
                            </div>
                        </fieldset>

                        <div className="mt-6 space-y-4">
                            <div>
                                <label htmlFor="guest-birth" className="mb-1.5 block text-sm font-medium text-fg-muted">
                                    {t('onboarding.birthDate')}
                                </label>
                                <input
                                    id="guest-birth"
                                    type="date"
                                    value={state.birthDate}
                                    onChange={(e) => state.setBirthDate(e.target.value)}
                                    className={FIELD}
                                />
                            </div>
                            <div>
                                <label htmlFor="guest-height" className="mb-1.5 block text-sm font-medium text-fg-muted">
                                    {t('onboarding.guest.heightCm')}
                                </label>
                                <input
                                    id="guest-height"
                                    type="number"
                                    inputMode="decimal"
                                    value={state.heightCm}
                                    onChange={(e) => state.setHeightCm(e.target.value)}
                                    placeholder="170"
                                    className={FIELD}
                                />
                            </div>
                            <div>
                                <label htmlFor="guest-weight" className="mb-1.5 block text-sm font-medium text-fg-muted">
                                    {t('onboarding.guest.weightKg')}
                                </label>
                                <input
                                    id="guest-weight"
                                    type="number"
                                    inputMode="decimal"
                                    value={state.weightKg}
                                    onChange={(e) => state.setWeightKg(e.target.value)}
                                    placeholder="65"
                                    className={FIELD}
                                />
                            </div>
                        </div>
                    </section>
                )}

                {state.step === GUEST_STEPS.activity && (
                    <section>
                        <h1 className="type-title-1 text-fg">{t('onboarding.guest.activityTitle')}</h1>
                        <p className="mt-3 type-body text-fg-muted">{t('onboarding.guest.activityHint')}</p>
                        <div className="mt-8 space-y-3">
                            {activityLevels.map((level) => (
                                <button
                                    key={level}
                                    onClick={() => state.setActivityLevel(level)}
                                    aria-pressed={state.activityLevel === level}
                                    className={option(state.activityLevel === level)}
                                >
                                    <span className="block type-headline">
                                        {t(`onboarding.activity.${level}`)}
                                    </span>
                                    <span className="mt-0.5 block text-sm opacity-75">
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
                <div className="mt-8 space-y-2">
                    <Button
                        onClick={() => {
                            if (state.step === GUEST_STEPS.activity) {
                                handleCalculate()
                                return
                            }
                            state.next()
                            recordStep(state.step + 1)
                        }}
                        disabled={!canContinue() || calculating}
                        isLoading={calculating}
                        size="lg"
                        block
                    >
                        {state.step === GUEST_STEPS.activity
                            ? t('onboarding.guest.showMyNorm')
                            : t('onboarding.guest.next')}
                    </Button>

                    {state.step > GUEST_STEPS.goal && (
                        <Button
                            variant="ghost"
                            size="lg"
                            block
                            onClick={state.back}
                            className="font-medium text-fg-muted"
                        >
                            {t('onboarding.guest.back')}
                        </Button>
                    )}
                </div>
            )}

            <p className="mt-8 text-center text-sm text-fg-muted">
                {t('onboarding.guest.haveAccount')}{' '}
                <a href="/auth" className="font-semibold text-primary hover:underline">
                    {t('onboarding.guest.signIn')}
                </a>
            </p>

            {/* Somewhere to ask before there is a curator to ask. */}
            <p className="mt-3 text-center">
                <SupportLink />
            </p>

            <SupportWidget />
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
        { key: 'protein' as const, label: t('onboarding.guest.protein'), value: Math.round(result.protein) },
        { key: 'fat' as const, label: t('onboarding.guest.fat'), value: Math.round(result.fat) },
        { key: 'carbs' as const, label: t('onboarding.guest.carbs'), value: Math.round(result.carbs) },
    ]

    return (
        <section>
            <h1 className="type-title-1 text-fg">{t('onboarding.guest.resultTitle')}</h1>
            <p className="mt-3 type-body text-fg-muted">
                {t('onboarding.guest.resultHint')}
            </p>

            <div className="mt-8 rounded-card border border-line bg-surface p-6 text-center">
                <p className="type-overline text-fg-subtle">{t('onboarding.guest.calories')}</p>
                <p className="mt-1 type-num-xl text-fg" data-testid="guest-calories">
                    {Math.round(result.calories)}
                </p>
                <p className="text-sm text-fg-muted">{t('onboarding.guest.kcalPerDay')}</p>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
                {macros.map((macro) => (
                    <div key={macro.label} className="rounded-tile border border-line bg-surface p-3 text-center">
                        <p className="flex items-center justify-center gap-1.5 type-caption text-fg-muted">
                            <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: MACRO_COLORS[macro.key] }}
                                aria-hidden="true"
                            />
                            {macro.label}
                        </p>
                        <p className="mt-0.5 type-num-l text-fg">
                            {macro.value}
                            <span className="text-xs font-normal text-fg-muted">
                                {' '}
                                {t('onboarding.guest.gram')}
                            </span>
                        </p>
                    </div>
                ))}
            </div>

            <p className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
                <Droplet className="h-4 w-4 shrink-0 text-water" strokeWidth={1.8} aria-hidden="true" />
                {t('onboarding.guest.water', { glasses: result.water_glasses })}
            </p>

            <GuestResultCapture />

            <Button onClick={onSave} size="lg" block className="mt-8">
                {t('onboarding.guest.saveResult')}
            </Button>
        </section>
    )
}

// The second place a contact can be left: right here, under the numbers,
// without going anywhere near the contact step. Somebody who only wants the
// number emailed to them should not have to sit through a form asking for
// their name too.
function GuestResultCapture() {
    const state = useGuestOnboardingStore()
    // Адрес — из общего хранилища, а не из состояния этого экрана: его уже
    // могли назвать на соседнем шаге, и спрашивать второй раз незачем.
    const email = state.email
    const setEmail = state.setEmail
    const [dataConsent, setDataConsent] = useState(false)
    const [contactConsent, setContactConsent] = useState(false)
    const [saving, setSaving] = useState(false)
    const [sent, setSent] = useState(false)

    const handleSend = async () => {
        const parameters = parametersOf(state)
        if (!parameters || !email || !dataConsent) return

        setSaving(true)
        try {
            const { token } = await guestApi.createLead({
                email,
                parameters,
                result: state.result,
                last_step: 'result',
                capture_source: 'result',
                // Кампания, из которой пришёл этот заход: считана на первой
                // странице и пережила переходы мастера. Раньше сюда писался
                // document.referrer, а он не отвечал ни на что — пусто при
                // прямом заходе, домен площадки при переходе из рекламы.
                attribution: storedAttribution(),
                consents: { data_processing: dataConsent, contact: contactConsent },
            })
            rememberLeadToken(token)
            attachBrowserId(token)
            track(EVENTS.leadSaved, { contact_consent: contactConsent, capture_source: 'result' })
            // Факт «контакт оставили», без адреса и без цифр расчёта —
            // отдельно от EVENTS.leadSaved, который несёт свойства для CRM-нужд.
            track(EVENTS.contactCaptured, { source: 'result' })
            setSent(true)
        } catch {
            toast.error(t('onboarding.guest.resultCapture.failed'))
        } finally {
            setSaving(false)
        }
    }

    if (sent) {
        // Confirmation must not promise a letter that was never scheduled: the
        // reminder only ever goes out to somebody who checked guest.reminder
        // (contactConsent) — without it, createLead still saves the lead, but
        // nothing sends anything.
        return (
            <p role="status" className="mt-6 flex items-start gap-3 rounded-tile bg-success-soft p-4 text-sm text-success-fg">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                {contactConsent
                    ? t('onboarding.guest.resultCapture.successWithReminder')
                    : t('onboarding.guest.resultCapture.success')}
            </p>
        )
    }

    return (
        <div className="mt-6 space-y-4 rounded-card border border-line bg-surface p-5">
            <p className="text-sm text-fg-muted">{t('onboarding.guest.resultCapture.hint')}</p>

            <div>
                <label htmlFor="guest-result-email" className="mb-1.5 block text-sm font-medium text-fg-muted">
                    {t('onboarding.guest.resultCapture.emailLabel')}
                </label>
                <input
                    id="guest-result-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('onboarding.guest.resultCapture.emailPlaceholder')}
                    className={FIELD}
                />
            </div>

            {/* Same two consents as the contact step, the same wording: one
                set of formulations, not a second one invented for this
                screen. */}
            <div className="space-y-3">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                    <input
                        type="checkbox"
                        checked={dataConsent}
                        onChange={(e) => setDataConsent(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded-xs border-line accent-primary"
                    />
                    <span className="text-sm text-fg-muted">{t('onboarding.guest.consent')}</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                    <input
                        type="checkbox"
                        checked={contactConsent}
                        onChange={(e) => setContactConsent(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded-xs border-line accent-primary"
                    />
                    <span className="text-sm text-fg-muted">{t('onboarding.guest.reminder')}</span>
                </label>
            </div>

            {/* Второе действие экрана — контуром: главное здесь «Сохранить результат». */}
            <Button
                variant="secondary"
                size="lg"
                block
                onClick={handleSend}
                disabled={!email || !dataConsent || saving}
            >
                {saving
                    ? t('onboarding.guest.resultCapture.sending')
                    : t('onboarding.guest.resultCapture.submit')}
            </Button>
        </div>
    )
}

function GuestContactStep({ onSaved, onSkip }: { onSaved: () => void; onSkip: () => void }) {
    const state = useGuestOnboardingStore()
    // То же общее хранилище: экран результата и этот шаг спрашивали адрес
    // каждый по-своему, и человек вводил его дважды подряд.
    const email = state.email
    const setEmail = state.setEmail
    const [name, setName] = useState('')
    const [dataConsent, setDataConsent] = useState(false)
    const [contactConsent, setContactConsent] = useState(false)
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        const parameters = parametersOf(state)
        if (!parameters || !email || !dataConsent) return

        setSaving(true)
        try {
            // A contact left on the result screen already has a lead behind
            // it. Creating a second one here would give the same person two
            // rows instead of one that carries on; the token proves there is
            // already something to carry on.
            if (leadToken()) {
                track(EVENTS.leadSaved, { contact_consent: contactConsent, capture_source: 'contact_step' })
                track(EVENTS.contactCaptured, { source: 'contact_step' })
                toast.success(t('onboarding.guest.saved'))
                onSaved()
                return
            }

            const { token } = await guestApi.createLead({
                email,
                name,
                parameters,
                result: state.result,
                last_step: 'contact',
                capture_source: 'contact_step',
                // Кампания, из которой пришёл этот заход: считана на первой
                // странице и пережила переходы мастера. Раньше сюда писался
                // document.referrer, а он не отвечал ни на что — пусто при
                // прямом заходе, домен площадки при переходе из рекламы.
                attribution: storedAttribution(),
                consents: { data_processing: dataConsent, contact: contactConsent },
            })
            rememberLeadToken(token)
            attachBrowserId(token)
            track(EVENTS.leadSaved, { contact_consent: contactConsent, capture_source: 'contact_step' })
            track(EVENTS.contactCaptured, { source: 'contact_step' })
            toast.success(t('onboarding.guest.saved'))
            onSaved()
        } catch (err) {
            // Ручка публичная и про зарегистрированный адрес ничего не знает:
            // ответ одинаков для любого адреса, так что показать причину
            // безопасно — оракулом существования аккаунта форма не станет.
            toast.error(messageForOr(err, t('onboarding.guest.saveFailed')))
        } finally {
            setSaving(false)
        }
    }

    return (
        <section>
            <h1 className="type-title-1 text-fg">{t('onboarding.guest.saveTitle')}</h1>
            <p className="mt-3 type-body text-fg-muted">
                {t('onboarding.guest.saveHint')}
            </p>

            <div className="mt-8 space-y-4">
                <div>
                    <label htmlFor="guest-email" className="mb-1.5 block text-sm font-medium text-fg-muted">
                        Email
                    </label>
                    <input
                        id="guest-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="user@example.com"
                        className={FIELD}
                    />
                </div>
                <div>
                    <label htmlFor="guest-name" className="mb-1.5 block text-sm font-medium text-fg-muted">
                        {t('onboarding.guest.nameOptional')}
                    </label>
                    <input
                        id="guest-name"
                        type="text"
                        autoComplete="given-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={FIELD}
                    />
                </div>
            </div>

            {/* Two consents, not one: saving the result and writing to you are
                different permissions, and bundling them makes neither explicit. */}
            <div className="mt-6 space-y-3">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                    <input
                        type="checkbox"
                        checked={dataConsent}
                        onChange={(e) => setDataConsent(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded-xs border-line accent-primary"
                    />
                    <span className="text-sm text-fg-muted">
                        {t('onboarding.guest.consent')}
                    </span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                    <input
                        type="checkbox"
                        checked={contactConsent}
                        onChange={(e) => setContactConsent(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded-xs border-line accent-primary"
                    />
                    <span className="text-sm text-fg-muted">
                        {t('onboarding.guest.reminder')}
                    </span>
                </label>
            </div>

            <Button
                onClick={handleSave}
                disabled={!email || !dataConsent || saving}
                size="lg"
                block
                className="mt-8"
            >
                {saving ? t('onboarding.guest.saving') : t('onboarding.guest.saveAndContinue')}
            </Button>

            <Button variant="ghost" size="lg" block onClick={onSkip} className="mt-2 font-medium text-fg-muted">
                {t('onboarding.guest.continueWithoutSaving')}
            </Button>
        </section>
    )
}
