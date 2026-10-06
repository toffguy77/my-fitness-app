'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

import {
    LanguageSelector,
    UnitSelector,
    TimezoneSelector,
} from '@/shared/components/settings'
import { updateSettings, getProfile } from '@/features/settings/api/settings'
import { completeOnboarding } from '../api/onboarding'
import { useOnboardingStore } from '../store/onboardingStore'
import { StepIndicator } from './StepIndicator'
import { cn } from '@/shared/utils/cn'
import { Button } from '@/shared/components/ui/Button'
import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'

// What actually has to happen before the first useful screen. The photo,
// social accounts and Apple Health used to stand between a new user and their
// dashboard; they are optional, they live in settings, and asking for a
// portrait first put the most personal step in front of the least value.
// Read at render, not at import: a module-level constant would fix the
// language to whatever it was when the bundle first evaluated.
const stepTitles = () => [t('onboarding.stepSettings'), t('onboarding.stepBodyGoals')]

// Поле ввода по системе: 48 px, текст 16 px — iOS не масштабирует страницу.
const FIELD =
    'h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums ' +
    'placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30'

// Выбранный вариант — инверсия чернилами, не терракота: терракота у кнопки «Далее».
function chip(selected: boolean) {
    return cn(
        'flex h-12 flex-1 cursor-pointer items-center justify-center rounded-full border px-3 text-sm font-semibold transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2',
        selected ? 'border-fg bg-fg text-fg-inverse' : 'border-line bg-surface text-fg hover:bg-subtle',
    )
}

const activityLevels = ['sedentary', 'light', 'moderate', 'active'] as const

const goals = ['loss', 'maintain', 'gain'] as const

export function OnboardingWizard() {
    const router = useRouter()
    const [saving, setSaving] = useState(false)

    const {
        currentStep,
        totalSteps,
        language,
        units,
        timezone,
        birthDate,
        biologicalSex,
        currentWeight,
        height,
        activityLevel,
        fitnessGoal,
        telegram,
        instagram,
        appleHealthEnabled,
        nextStep,
        setLanguage,
        setUnits,
        setTimezone,
        setBirthDate,
        setBiologicalSex,
        setCurrentWeight,
        setHeight,
        setActivityLevel,
        setFitnessGoal,
        setTelegram,
        setInstagram,
        setAppleHealth,
    } = useOnboardingStore()

    // Signed-out visitors never reach this page: middleware.ts redirects
    // them before it renders.

    // Pre-populate store from existing profile on mount
    useEffect(() => {
        async function loadProfile() {
            try {
                const profile = await getProfile()
                if (profile.settings) {
                    const s = profile.settings
                    if (s.language === 'ru' || s.language === 'en') {
                        setLanguage(s.language)
                    }
                    if (s.units === 'metric' || s.units === 'imperial') {
                        setUnits(s.units)
                    }
                    if (s.timezone) setTimezone(s.timezone)
                    if (s.birth_date) setBirthDate(s.birth_date)
                    if (s.biological_sex === 'male' || s.biological_sex === 'female') {
                        setBiologicalSex(s.biological_sex)
                    }
                    if (s.height) setHeight(String(s.height))
                    if (s.activity_level === 'sedentary' || s.activity_level === 'light' || s.activity_level === 'moderate' || s.activity_level === 'active') {
                        setActivityLevel(s.activity_level)
                    }
                    if (s.fitness_goal === 'loss' || s.fitness_goal === 'maintain' || s.fitness_goal === 'gain') {
                        setFitnessGoal(s.fitness_goal)
                    }
                    if (s.telegram_username) setTelegram(s.telegram_username)
                    if (s.instagram_username) setInstagram(s.instagram_username)
                    if (s.apple_health_enabled) setAppleHealth(s.apple_health_enabled)
                }
            } catch {
                // Молчим намеренно: это необязательное предзаполнение, а не
                // действие человека. Мастер целиком работает и с умолчаниями,
                // и тост про непрочитанный профиль на первом же экране —
                // сообщение о том, чего никто не просил.
            }
        }
        loadProfile()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function buildSettingsPayload() {
        return {
            language,
            units,
            timezone,
            telegram_username: telegram,
            instagram_username: instagram,
            apple_health_enabled: appleHealthEnabled,
        }
    }

    function buildBodyPayload(): Record<string, unknown> {
        const payload: Record<string, unknown> = {}
        if (birthDate) payload.birth_date = birthDate
        if (biologicalSex) payload.biological_sex = biologicalSex
        if (activityLevel) payload.activity_level = activityLevel
        if (fitnessGoal) payload.fitness_goal = fitnessGoal
        if (height) payload.height = parseFloat(height)
        if (currentWeight) payload.target_weight = parseFloat(currentWeight)
        return payload
    }

    async function handleNext() {
        setSaving(true)
        try {
            switch (currentStep) {
                case 0:
                    // Settings step — save language, units & timezone
                    await updateSettings(buildSettingsPayload())
                    nextStep()
                    break

                case 1:
                    // Body & goals, then straight to the dashboard.
                    await updateSettings({ ...buildSettingsPayload(), ...buildBodyPayload() })
                    await completeOnboarding()
                    toast(t('onboarding.welcome'))
                    router.push('/dashboard')
                    break
            }
        } catch (err) {
            toast.error(messageForOr(err, t('onboarding.saveFailed')))
        } finally {
            setSaving(false)
        }
    }

    async function handleSkip() {
        if (currentStep === totalSteps - 1) {
            // Last step — complete onboarding and redirect
            setSaving(true)
            try {
                await completeOnboarding()
                router.push('/dashboard')
            } catch (err) {
                toast.error(messageForOr(err, t('onboarding.finishFailed')))
            } finally {
                setSaving(false)
            }
        } else {
            nextStep()
        }
    }

    const isLastStep = currentStep === totalSteps - 1

    return (
        <div className="min-h-screen bg-canvas">
            <div className="mx-auto max-w-md px-screen-x pb-10 pt-12">
                {/* Step indicator */}
                <div className="mb-8">
                    <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />
                </div>

                {/* Step title */}
                <h1 className="mb-8 text-center type-title-1 text-fg">
                    {stepTitles()[currentStep]}
                </h1>

                {/* Step content */}
                <div className="mb-8">
                    {currentStep === 0 && (
                        <div className="flex flex-col gap-6">
                            <LanguageSelector
                                value={language}
                                onChange={setLanguage}
                            />
                            <UnitSelector
                                value={units}
                                onChange={setUnits}
                            />
                            <TimezoneSelector
                                value={timezone}
                                onChange={setTimezone}
                            />
                        </div>
                    )}

                    {currentStep === 1 && (
                        <div className="flex flex-col gap-6">
                            {/* Birth date */}
                            <div>
                                <label htmlFor="birth-date" className="mb-1.5 block text-sm font-medium text-fg-muted">
                                    {t('onboarding.birthDate')}
                                </label>
                                <input
                                    id="birth-date"
                                    type="date"
                                    value={birthDate}
                                    onChange={(e) => setBirthDate(e.target.value)}
                                    className={FIELD}
                                />
                            </div>

                            {/* Sex */}
                            <fieldset>
                                <legend className="mb-1.5 block text-sm font-medium text-fg-muted">
                                    {t('onboarding.sex')}
                                </legend>
                                <div className="flex gap-2">
                                    <label
className={chip(biologicalSex === 'male')}
                                    >
                                        <input
                                            type="radio"
                                            name="biological-sex"
                                            value="male"
                                            checked={biologicalSex === 'male'}
                                            onChange={() => setBiologicalSex('male')}
                                            className="sr-only"
                                        />
                                        {t('onboarding.male')}
                                    </label>
                                    <label
className={chip(biologicalSex === 'female')}
                                    >
                                        <input
                                            type="radio"
                                            name="biological-sex"
                                            value="female"
                                            checked={biologicalSex === 'female'}
                                            onChange={() => setBiologicalSex('female')}
                                            className="sr-only"
                                        />
                                        {t('onboarding.female')}
                                    </label>
                                </div>
                            </fieldset>

                            {/* Current weight */}
                            <div>
                                <label htmlFor="current-weight" className="mb-1.5 block text-sm font-medium text-fg-muted">
                                    {t('onboarding.currentWeight', {
                                        unit: units === 'metric' ? t('onboarding.unitKg') : t('onboarding.unitLbs'),
                                    })}
                                </label>
                                <input
                                    id="current-weight"
                                    type="number"
                                    step="0.1"
                                    min="20"
                                    max="500"
                                    value={currentWeight}
                                    onChange={(e) => setCurrentWeight(e.target.value)}
                                    placeholder={units === 'metric' ? '70' : '154'}
                                    className={FIELD}
                                />
                            </div>

                            {/* Height */}
                            <div>
                                <label htmlFor="height-input" className="mb-1.5 block text-sm font-medium text-fg-muted">
                                    {t('onboarding.height', {
                                        unit: units === 'metric' ? t('onboarding.unitCm') : t('onboarding.unitIn'),
                                    })}
                                </label>
                                <input
                                    id="height-input"
                                    type="number"
                                    step="1"
                                    min="50"
                                    max="300"
                                    value={height}
                                    onChange={(e) => setHeight(e.target.value)}
                                    placeholder={units === 'metric' ? '175' : '69'}
                                    className={FIELD}
                                />
                            </div>

                            {/* Activity level */}
                            <div>
                                <label htmlFor="activity-level" className="mb-1.5 block text-sm font-medium text-fg-muted">
                                    {t('onboarding.activityLevel')}
                                </label>
                                <select
                                    id="activity-level"
                                    value={activityLevel}
                                    onChange={(e) => setActivityLevel(e.target.value as typeof activityLevel)}
                                    className={FIELD}
                                >
                                    {activityLevels.map((level) => (
                                        <option key={level} value={level}>
                                            {t(`onboarding.activity.${level}`)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Goal */}
                            <fieldset>
                                <legend className="mb-1.5 block text-sm font-medium text-fg-muted">
                                    {t('onboarding.goalLabel')}
                                </legend>
                                <div className="flex gap-2">
                                    {goals.map((goal) => (
                                        <label
                                            key={goal}
className={chip(fitnessGoal === goal)}
                                        >
                                            <input
                                                type="radio"
                                                name="fitness-goal"
                                                value={goal}
                                                checked={fitnessGoal === goal}
                                                onChange={() => setFitnessGoal(goal)}
                                                className="sr-only"
                                            />
                                            {t(`onboarding.goal.${goal}`)}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>

                            <p className="text-center type-caption text-fg-subtle">
                                {t('onboarding.allOptional')}
                            </p>
                        </div>
                    )}

                </div>

                {/* Bottom buttons */}
                <div className="flex flex-col gap-2">
                    <Button
                        type="button"
                        disabled={saving}
                        isLoading={saving}
                        onClick={handleNext}
                        size="lg"
                        block
                    >
                        {saving
                            ? t('onboarding.saving')
                            : isLastStep ? t('onboarding.finish') : t('onboarding.next')}
                    </Button>

                    <Button
                        type="button"
                        variant="ghost"
                        size="lg"
                        block
                        disabled={saving}
                        onClick={handleSkip}
                        className="font-medium text-fg-muted"
                    >
                        {t('onboarding.skip')}
                    </Button>
                </div>
            </div>
        </div>
    )
}

OnboardingWizard.displayName = 'OnboardingWizard'
