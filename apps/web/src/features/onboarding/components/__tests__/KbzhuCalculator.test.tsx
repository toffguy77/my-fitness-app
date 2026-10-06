import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KbzhuCalculator } from '../KbzhuCalculator'
import { guestApi } from '../../api/guest'
import { useGuestOnboardingStore, GUEST_STEPS } from '../../store/guestOnboardingStore'
import { track } from '@/shared/analytics'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

jest.mock('../../api/guest', () => ({
    ...jest.requireActual('../../api/guest'),
    guestApi: { calculate: jest.fn() },
}))

jest.mock('@/shared/analytics', () => ({
    track: jest.fn(),
    EVENTS: jest.requireActual('@/shared/analytics/events').EVENTS,
}))

const mockCalculate = guestApi.calculate as jest.MockedFunction<typeof guestApi.calculate>
const mockTrack = track as jest.MockedFunction<typeof track>

const result = { calories: 1850, protein: 117, fat: 51.4, carbs: 230.6, bmr: 1400, tdee: 2170, water_glasses: 8 }

function fillEverything() {
    fireEvent.click(screen.getByLabelText('Женский'))
    fireEvent.change(screen.getByLabelText('Дата рождения'), { target: { value: '1990-05-01' } })
    fireEvent.change(screen.getByLabelText('Рост, см'), { target: { value: '168' } })
    fireEvent.change(screen.getByLabelText('Вес, кг'), { target: { value: '65' } })
    fireEvent.change(screen.getByLabelText('Уровень активности'), { target: { value: 'moderate' } })
    fireEvent.change(screen.getByLabelText('Цель'), { target: { value: 'loss' } })
}

describe('KbzhuCalculator', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        useGuestOnboardingStore.getState().reset()
        mockCalculate.mockResolvedValue(result)
    })

    it('calculates with the server formula and shows the four numbers', async () => {
        render(<KbzhuCalculator />)
        fillEverything()
        fireEvent.click(screen.getByRole('button', { name: 'Рассчитать' }))

        await waitFor(() => expect(screen.getByText('1850')).toBeInTheDocument())
        expect(mockCalculate).toHaveBeenCalledWith({
            sex: 'female',
            birth_date: '1990-05-01',
            height_cm: 168,
            weight_kg: 65,
            activity_level: 'moderate',
            goal: 'loss',
        })
        expect(screen.getByText('117')).toBeInTheDocument()
        // Rounded as the wizard rounds them: the same numbers on both screens.
        expect(screen.getByText('51')).toBeInTheDocument()
        expect(screen.getByText('231')).toBeInTheDocument()
    })

    it('says what is missing instead of asking the server', () => {
        render(<KbzhuCalculator />)
        fireEvent.change(screen.getByLabelText('Рост, см'), { target: { value: '168' } })
        fireEvent.click(screen.getByRole('button', { name: 'Рассчитать' }))

        expect(mockCalculate).not.toHaveBeenCalled()
        expect(screen.getByRole('alert')).toHaveTextContent('Заполните все параметры')
    })

    // Своё событие: под onboarding_result_shown расчёт на этой странице
    // засорил бы воронку мастера людьми, которые в мастер не заходили.
    it('records the calculation as its own event', async () => {
        render(<KbzhuCalculator />)
        fillEverything()
        fireEvent.click(screen.getByRole('button', { name: 'Рассчитать' }))

        await waitFor(() =>
            expect(mockTrack).toHaveBeenCalledWith('calculator_result', {
                goal: 'loss',
                activity_level: 'moderate',
            }),
        )
        expect(mockTrack).not.toHaveBeenCalledWith('onboarding_result_shown', expect.anything())
    })

    it('carries the answers into the wizard, on its result screen', async () => {
        render(<KbzhuCalculator />)
        fillEverything()
        fireEvent.click(screen.getByRole('button', { name: 'Рассчитать' }))
        await waitFor(() => expect(screen.getByText('1850')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: 'Сохранить результат и получить план' }))

        const state = useGuestOnboardingStore.getState()
        expect(state.step).toBe(GUEST_STEPS.result)
        expect(state.result).toEqual(result)
        expect(state.goal).toBe('loss')
        expect(state.weightKg).toBe('65')
        expect(mockPush).toHaveBeenCalledWith('/onboarding')
    })

    // The reported defect: the answers reached the wizard only with a
    // successful calculation, so /onboarding showed what an earlier visit had
    // left in the browser instead of what was just typed here.
    it('hands what was typed to the wizard without a calculation', () => {
        useGuestOnboardingStore.getState().load({
            goal: 'gain',
            sex: 'male',
            birth_date: '1980-01-01',
            height_cm: 190,
            weight_kg: 100,
            activity_level: 'active',
        })
        render(<KbzhuCalculator />)
        fillEverything()

        expect(useGuestOnboardingStore.getState()).toMatchObject({
            goal: 'loss',
            sex: 'female',
            birthDate: '1990-05-01',
            heightCm: '168',
            weightKg: '65',
            activityLevel: 'moderate',
            result: null,
        })
        expect(mockCalculate).not.toHaveBeenCalled()
    })

    it('shows the answers the wizard already has', () => {
        useGuestOnboardingStore.getState().load({ goal: 'gain', height_cm: 190, weight_kg: 100 })
        render(<KbzhuCalculator />)

        expect(screen.getByLabelText('Цель')).toHaveValue('gain')
        expect(screen.getByLabelText('Рост, см')).toHaveValue(190)
        expect(screen.getByLabelText('Вес, кг')).toHaveValue(100)
    })

    // The second leak: an edit after the calculation stayed on this page, and
    // "save" carried the old weight and the old numbers into the wizard.
    it('drops a result the answers no longer match', async () => {
        render(<KbzhuCalculator />)
        fillEverything()
        fireEvent.click(screen.getByRole('button', { name: 'Рассчитать' }))
        await waitFor(() => expect(screen.getByText('1850')).toBeInTheDocument())

        fireEvent.change(screen.getByLabelText('Вес, кг'), { target: { value: '90' } })

        expect(screen.queryByText('1850')).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Сохранить результат и получить план' }),
        ).not.toBeInTheDocument()
        const state = useGuestOnboardingStore.getState()
        expect(state.weightKg).toBe('90')
        expect(state.result).toBeNull()
        expect(state.step).toBe(GUEST_STEPS.activity)
    })

    it('discards a calculation an edit overtook', async () => {
        let answer: (value: typeof result) => void = () => {}
        mockCalculate.mockReturnValue(new Promise((resolve) => (answer = resolve)))
        render(<KbzhuCalculator />)
        fillEverything()
        fireEvent.click(screen.getByRole('button', { name: 'Рассчитать' }))

        fireEvent.change(screen.getByLabelText('Вес, кг'), { target: { value: '90' } })
        answer(result)

        await waitFor(() => expect(screen.getByRole('button', { name: 'Рассчитать' })).toBeEnabled())
        expect(screen.queryByText('1850')).not.toBeInTheDocument()
        expect(useGuestOnboardingStore.getState().result).toBeNull()
    })

    it('reports a failed calculation', async () => {
        mockCalculate.mockRejectedValue(new Error('boom'))
        render(<KbzhuCalculator />)
        fillEverything()
        fireEvent.click(screen.getByRole('button', { name: 'Рассчитать' }))

        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
        expect(screen.queryByText('1850')).not.toBeInTheDocument()
    })
})
