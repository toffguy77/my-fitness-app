'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

import {
    PhotoUploader,
    LanguageSelector,
    UnitSelector,
    TimezoneSelector,
    SocialAccountsForm,
    AppleHealthToggle,
} from '@/shared/components/settings'
import { updateSettings, uploadAvatar, getProfile } from '@/features/settings/api/settings'
import { completeOnboarding } from '../api/onboarding'
import { useOnboardingStore } from '../store/onboardingStore'
import { StepIndicator } from './StepIndicator'
import { cn } from '@/shared/utils/cn'

const stepTitles = [
    'Фото профиля',
    'Настройки',
    'Тело и цели',
    'Социальные сети',
    'Apple Health',
]

const activityLevelOptions = [
    { value: 'sedentary', label: 'Сидячий образ жизни' },
    { value: 'light', label: 'Лёгкая активность' },
    { value: 'moderate', label: 'Умеренная активность' },
    { value: 'active', label: 'Высокая активность' },
] as const

export function OnboardingWizard() {
    const router = useRouter()
    const [saving, setSaving] = useState(false)

    const {
        currentStep,
        totalSteps,
        avatarUrl,
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
        setAvatarUrl,
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

    // Auth guard
    useEffect(() => {
        const token = localStorage.getItem('auth_token')
        if (!token) {
            router.push('/auth')
        }
    }, [router])

    // Pre-populate store from existing profile on mount
    useEffect(() => {
        async function loadProfile() {
            try {
                const profile = await getProfile()
                if (profile.avatar_url) setAvatarUrl(profile.avatar_url)
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
                // Profile fetch failed — continue with defaults
            }
        }
        loadProfile()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function handlePhotoUpload(file: File): Promise<string> {
        const url = await uploadAvatar(file)
        setAvatarUrl(url)
        return url
    }

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
                    // Photo step — avatar already uploaded via PhotoUploader
                    nextStep()
                    break

                case 1:
                    // Settings step — save language, units & timezone
                    await updateSettings(buildSettingsPayload())
                    nextStep()
                    break

                case 2:
                    // Body & Goals step — save body profile fields
                    await updateSettings({ ...buildSettingsPayload(), ...buildBodyPayload() })
                    nextStep()
                    break

                case 3:
                    // Social accounts step — save all current values
                    await updateSettings(buildSettingsPayload())
                    nextStep()
                    break

                case 4:
                    // Final step — save, complete onboarding, redirect
                    await updateSettings(buildSettingsPayload())
                    await completeOnboarding()
                    toast('Добро пожаловать!')
                    router.push('/dashboard')
                    break
            }
        } catch {
            toast.error('Не удалось сохранить. Попробуйте ещё раз.')
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
            } catch {
                toast.error('Не удалось завершить. Попробуйте ещё раз.')
            } finally {
                setSaving(false)
            }
        } else {
            nextStep()
        }
    }

    const isLastStep = currentStep === totalSteps - 1

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-md px-4 pb-8 pt-12">
                {/* Step indicator */}
                <div className="mb-8">
                    <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />
                </div>

                {/* Step title */}
                <h2 className="mb-6 text-center text-xl font-bold text-gray-900">
                    {stepTitles[currentStep]}
                </h2>

                {/* Step content */}
                <div className="mb-8">
                    {currentStep === 0 && (
                        <PhotoUploader
                            avatarUrl={avatarUrl || undefined}
                            onUpload={handlePhotoUpload}
                        />
                    )}

                    {currentStep === 1 && (
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

                    {currentStep === 2 && (
                        <div className="flex flex-col gap-6">
                            {/* Дата рождения */}
                            <div>
                                <label htmlFor="birth-date" className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Дата рождения
                                </label>
                                <input
                                    id="birth-date"
                                    type="date"
                                    value={birthDate}
                                    onChange={(e) => setBirthDate(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* Пол */}
                            <fieldset>
                                <legend className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Пол
                                </legend>
                                <div className="flex gap-3">
                                    <label
                                        className={cn(
                                            'flex flex-1 cursor-pointer items-center justify-center rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                                            biologicalSex === 'male'
                                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                : 'border-gray-300 text-gray-700 hover:border-gray-400'
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="biological-sex"
                                            value="male"
                                            checked={biologicalSex === 'male'}
                                            onChange={() => setBiologicalSex('male')}
                                            className="sr-only"
                                        />
                                        Мужской
                                    </label>
                                    <label
                                        className={cn(
                                            'flex flex-1 cursor-pointer items-center justify-center rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                                            biologicalSex === 'female'
                                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                : 'border-gray-300 text-gray-700 hover:border-gray-400'
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="biological-sex"
                                            value="female"
                                            checked={biologicalSex === 'female'}
                                            onChange={() => setBiologicalSex('female')}
                                            className="sr-only"
                                        />
                                        Женский
                                    </label>
                                </div>
                            </fieldset>

                            {/* Текущий вес */}
                            <div>
                                <label htmlFor="current-weight" className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Текущий вес ({units === 'metric' ? 'кг' : 'lbs'})
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
                                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* Рост */}
                            <div>
                                <label htmlFor="height-input" className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Рост ({units === 'metric' ? 'см' : 'in'})
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
                                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* Уровень активности */}
                            <div>
                                <label htmlFor="activity-level" className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Уровень активности
                                </label>
                                <select
                                    id="activity-level"
                                    value={activityLevel}
                                    onChange={(e) => setActivityLevel(e.target.value as typeof activityLevel)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    {activityLevelOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Цель */}
                            <fieldset>
                                <legend className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Цель
                                </legend>
                                <div className="flex gap-3">
                                    {([
                                        { value: 'loss', label: 'Снижение' },
                                        { value: 'maintain', label: 'Поддержание' },
                                        { value: 'gain', label: 'Набор' },
                                    ] as const).map((opt) => (
                                        <label
                                            key={opt.value}
                                            className={cn(
                                                'flex flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 py-3 text-sm font-medium transition-colors',
                                                fitnessGoal === opt.value
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="fitness-goal"
                                                value={opt.value}
                                                checked={fitnessGoal === opt.value}
                                                onChange={() => setFitnessGoal(opt.value)}
                                                className="sr-only"
                                            />
                                            {opt.label}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>

                            <p className="text-center text-xs text-gray-400">
                                Все поля необязательны — вы сможете заполнить их позже в настройках
                            </p>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <SocialAccountsForm
                            telegram={telegram}
                            instagram={instagram}
                            onTelegramChange={setTelegram}
                            onInstagramChange={setInstagram}
                        />
                    )}

                    {currentStep === 4 && (
                        <AppleHealthToggle
                            enabled={appleHealthEnabled}
                            onChange={setAppleHealth}
                        />
                    )}
                </div>

                {/* Bottom buttons */}
                <div className="flex flex-col gap-3">
                    <button
                        type="button"
                        disabled={saving}
                        onClick={handleNext}
                        className={cn(
                            'w-full rounded-xl bg-blue-600 py-3 font-medium text-white transition-colors',
                            'hover:bg-blue-700',
                            'disabled:pointer-events-none disabled:opacity-50'
                        )}
                    >
                        {saving ? (
                            <span className="inline-flex items-center justify-center gap-2">
                                <svg
                                    className="h-4 w-4 animate-spin"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                    />
                                </svg>
                                Сохранение...
                            </span>
                        ) : (
                            isLastStep ? 'Завершить' : 'Далее'
                        )}
                    </button>

                    <button
                        type="button"
                        disabled={saving}
                        onClick={handleSkip}
                        className="py-2 text-center text-sm text-gray-500 transition-colors hover:text-gray-700 disabled:pointer-events-none disabled:opacity-50"
                    >
                        Пропустить
                    </button>
                </div>
            </div>
        </div>
    )
}

OnboardingWizard.displayName = 'OnboardingWizard'
