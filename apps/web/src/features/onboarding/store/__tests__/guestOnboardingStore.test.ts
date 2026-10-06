import { useGuestOnboardingStore, GUEST_STEPS } from '../guestOnboardingStore'

const result = { calories: 1850, protein: 117, fat: 51.4, carbs: 230.6, bmr: 1400, tdee: 2170, water_glasses: 8 }

describe('useGuestOnboardingStore', () => {
    beforeEach(() => {
        useGuestOnboardingStore.getState().reset()
        useGuestOnboardingStore.getState().load(
            {
                goal: 'loss',
                sex: 'female',
                birth_date: '1990-05-01',
                height_cm: 168,
                weight_kg: 65,
                activity_level: 'moderate',
            },
            result,
        )
    })

    // On the result step without a result the wizard renders an empty screen
    // with no button at all; the calculator edits answers while the wizard
    // stands there.
    it('takes a changed answer back to the last question, without the old result', () => {
        useGuestOnboardingStore.getState().setWeightKg('90')

        const state = useGuestOnboardingStore.getState()
        expect(state.weightKg).toBe('90')
        expect(state.result).toBeNull()
        expect(state.step).toBe(GUEST_STEPS.activity)
    })

    it('does the same from the contact step, so no lead is saved with old numbers', () => {
        useGuestOnboardingStore.getState().setStep(GUEST_STEPS.contact)
        useGuestOnboardingStore.getState().setGoal('gain')

        const state = useGuestOnboardingStore.getState()
        expect(state.result).toBeNull()
        expect(state.step).toBe(GUEST_STEPS.activity)
    })

    it('leaves an earlier step where it is', () => {
        useGuestOnboardingStore.getState().setStep(GUEST_STEPS.body)
        useGuestOnboardingStore.getState().setHeightCm('170')

        expect(useGuestOnboardingStore.getState().step).toBe(GUEST_STEPS.body)
    })

    it('keeps the result when the same answer is given again', () => {
        useGuestOnboardingStore.getState().setGoal('loss')

        const state = useGuestOnboardingStore.getState()
        expect(state.result).toEqual(result)
        expect(state.step).toBe(GUEST_STEPS.result)
    })
})
