import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ActivityLevel, FitnessGoal, GuestParameters, GuestResult, Sex } from '../api/guest'

/**
 * The guest wizard's progress.
 *
 * Persisted to the device, and only to the device: until somebody has given a
 * contact and a consent, their answers are theirs alone. Nothing here reaches
 * the server on its own.
 */
export interface GuestOnboardingState {
    step: number
    goal: FitnessGoal | ''
    sex: Sex | ''
    birthDate: string
    heightCm: string
    weightKg: string
    activityLevel: ActivityLevel | ''
    result: GuestResult | null

    setStep: (step: number) => void
    next: () => void
    back: () => void
    setGoal: (goal: FitnessGoal) => void
    setSex: (sex: Sex) => void
    setBirthDate: (value: string) => void
    setHeightCm: (value: string) => void
    setWeightKg: (value: string) => void
    setActivityLevel: (value: ActivityLevel) => void
    setResult: (result: GuestResult | null) => void
    load: (values: Partial<GuestParameters>, result?: GuestResult | null) => void
    reset: () => void
}

/** Step indices, named so the wizard never reads as arithmetic. */
export const GUEST_STEPS = {
    goal: 0,
    body: 1,
    activity: 2,
    result: 3,
    contact: 4,
} as const

/** The names the server records, so "where did they stop" is legible. */
export const GUEST_STEP_NAMES = ['goal', 'body', 'activity', 'result', 'contact'] as const

const initialState = {
    step: GUEST_STEPS.goal,
    goal: '' as const,
    sex: '' as const,
    birthDate: '',
    heightCm: '',
    weightKg: '',
    activityLevel: '' as const,
    result: null,
}

export const useGuestOnboardingStore = create<GuestOnboardingState>()(
    persist(
        (set) => ({
            ...initialState,

            setStep: (step) => set({ step }),
            next: () => set((state) => ({ step: Math.min(state.step + 1, GUEST_STEPS.contact) })),
            back: () => set((state) => ({ step: Math.max(state.step - 1, GUEST_STEPS.goal) })),
            setGoal: (goal) => set({ goal }),
            setSex: (sex) => set({ sex }),
            setBirthDate: (birthDate) => set({ birthDate }),
            setHeightCm: (heightCm) => set({ heightCm }),
            setWeightKg: (weightKg) => set({ weightKg }),
            setActivityLevel: (activityLevel) => set({ activityLevel }),
            setResult: (result) => set({ result }),

            // Used when somebody comes back through the link in the reminder.
            load: (values, result) =>
                set({
                    goal: (values.goal as FitnessGoal) || '',
                    sex: (values.sex as Sex) || '',
                    birthDate: values.birth_date || '',
                    heightCm: values.height_cm != null ? String(values.height_cm) : '',
                    weightKg: values.weight_kg != null ? String(values.weight_kg) : '',
                    activityLevel: (values.activity_level as ActivityLevel) || '',
                    result: result ?? null,
                    step: GUEST_STEPS.result,
                }),

            reset: () => set(initialState),
        }),
        {
            name: 'guest-onboarding',
            storage: createJSONStorage(() => localStorage),
        }
    )
)

/** The parameters as the calculation endpoint wants them, or null if incomplete. */
export function parametersOf(state: GuestOnboardingState): GuestParameters | null {
    const height = parseFloat(state.heightCm)
    const weight = parseFloat(state.weightKg)

    if (!state.sex || !state.birthDate || !state.activityLevel || !state.goal) return null
    if (!Number.isFinite(height) || !Number.isFinite(weight)) return null

    return {
        sex: state.sex,
        birth_date: state.birthDate,
        height_cm: height,
        weight_kg: weight,
        activity_level: state.activityLevel,
        goal: state.goal,
    }
}
