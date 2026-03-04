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
    'Социальные сети',
    'Apple Health',
]

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
        telegram,
        instagram,
        appleHealthEnabled,
        nextStep,
        setAvatarUrl,
        setLanguage,
        setUnits,
        setTimezone,
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
                    // Social accounts step — save all current values
                    await updateSettings(buildSettingsPayload())
                    nextStep()
                    break

                case 3:
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
                        <SocialAccountsForm
                            telegram={telegram}
                            instagram={instagram}
                            onTelegramChange={setTelegram}
                            onInstagramChange={setInstagram}
                        />
                    )}

                    {currentStep === 3 && (
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
