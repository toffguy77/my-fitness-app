import { create } from 'zustand'

interface OnboardingState {
    currentStep: number
    totalSteps: number
    avatarUrl: string
    language: 'ru' | 'en'
    units: 'metric' | 'imperial'
    telegram: string
    instagram: string
    appleHealthEnabled: boolean

    setStep: (step: number) => void
    nextStep: () => void
    prevStep: () => void
    setAvatarUrl: (url: string) => void
    setLanguage: (lang: 'ru' | 'en') => void
    setUnits: (units: 'metric' | 'imperial') => void
    setTelegram: (val: string) => void
    setInstagram: (val: string) => void
    setAppleHealth: (val: boolean) => void
    reset: () => void
}

const initialState = {
    currentStep: 0,
    totalSteps: 4,
    avatarUrl: '',
    language: 'ru' as const,
    units: 'metric' as const,
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
    setTelegram: (telegram) => set({ telegram }),
    setInstagram: (instagram) => set({ instagram }),
    setAppleHealth: (appleHealthEnabled) => set({ appleHealthEnabled }),
    reset: () => set(initialState),
}))
