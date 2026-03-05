import { create } from 'zustand'

interface OnboardingState {
    currentStep: number
    totalSteps: number
    avatarUrl: string
    language: 'ru' | 'en'
    units: 'metric' | 'imperial'
    timezone: string
    birthDate: string
    biologicalSex: 'male' | 'female' | ''
    currentWeight: string
    height: string
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'active'
    fitnessGoal: 'loss' | 'maintain' | 'gain'
    telegram: string
    instagram: string
    appleHealthEnabled: boolean

    setStep: (step: number) => void
    nextStep: () => void
    prevStep: () => void
    setAvatarUrl: (url: string) => void
    setLanguage: (lang: 'ru' | 'en') => void
    setUnits: (units: 'metric' | 'imperial') => void
    setTimezone: (timezone: string) => void
    setBirthDate: (val: string) => void
    setBiologicalSex: (val: 'male' | 'female' | '') => void
    setCurrentWeight: (val: string) => void
    setHeight: (val: string) => void
    setActivityLevel: (val: 'sedentary' | 'light' | 'moderate' | 'active') => void
    setFitnessGoal: (val: 'loss' | 'maintain' | 'gain') => void
    setTelegram: (val: string) => void
    setInstagram: (val: string) => void
    setAppleHealth: (val: boolean) => void
    reset: () => void
}

const initialState = {
    currentStep: 0,
    totalSteps: 5,
    avatarUrl: '',
    language: 'ru' as const,
    units: 'metric' as const,
    timezone: typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'Europe/Moscow',
    birthDate: '',
    biologicalSex: '' as const,
    currentWeight: '',
    height: '',
    activityLevel: 'moderate' as const,
    fitnessGoal: 'maintain' as const,
    telegram: '',
    instagram: '',
    appleHealthEnabled: false,
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
    ...initialState,
    setStep: (step) => set({ currentStep: step }),
    nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, s.totalSteps - 1) })),
    prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),
    setAvatarUrl: (url) => set({ avatarUrl: url }),
    setLanguage: (language) => set({ language }),
    setUnits: (units) => set({ units }),
    setTimezone: (timezone) => set({ timezone }),
    setBirthDate: (birthDate) => set({ birthDate }),
    setBiologicalSex: (biologicalSex) => set({ biologicalSex }),
    setCurrentWeight: (currentWeight) => set({ currentWeight }),
    setHeight: (height) => set({ height }),
    setActivityLevel: (activityLevel) => set({ activityLevel }),
    setFitnessGoal: (fitnessGoal) => set({ fitnessGoal }),
    setTelegram: (telegram) => set({ telegram }),
    setInstagram: (instagram) => set({ instagram }),
    setAppleHealth: (appleHealthEnabled) => set({ appleHealthEnabled }),
    reset: () => set(initialState),
}))
