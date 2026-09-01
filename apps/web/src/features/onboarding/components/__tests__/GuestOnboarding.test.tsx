import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestOnboarding } from '../GuestOnboarding'
import { guestApi, leadToken } from '../../api/guest'
import { useGuestOnboardingStore, GUEST_STEPS } from '../../store/guestOnboardingStore'

jest.mock('../../api/guest', () => {
    const actual = jest.requireActual('../../api/guest')
    return {
        ...actual,
        guestApi: {
            calculate: jest.fn(),
            createLead: jest.fn(),
            updateStep: jest.fn().mockResolvedValue(undefined),
            resume: jest.fn(),
        },
    }
})

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const push = jest.fn()
let searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: jest.fn() }),
    useSearchParams: () => searchParams,
}))

const api = guestApi as jest.Mocked<typeof guestApi>

const result = {
    calories: 1800,
    protein: 120,
    fat: 50,
    carbs: 200,
    bmr: 1400,
    tdee: 2100,
    water_glasses: 8,
}

function answerEverything() {
    useGuestOnboardingStore.setState({
        goal: 'loss',
        sex: 'female',
        birthDate: '1990-05-01',
        heightCm: '170',
        weightKg: '65',
        activityLevel: 'moderate',
    })
}

beforeEach(() => {
    jest.clearAllMocks()
    searchParams = new URLSearchParams()
    localStorage.clear()
    useGuestOnboardingStore.getState().reset()
})

describe('The guest onboarding', () => {
    // The whole premise: the calculation comes before the account, because it
    // is the first useful thing the product has and it needs no account.
    it('asks for a goal first, not for an email address', () => {
        render(<GuestOnboarding />)

        expect(screen.getByText('Какая у вас цель?')).toBeInTheDocument()
        expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    })

    it('will not advance until the step is answered', async () => {
        render(<GuestOnboarding />)

        expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()

        await userEvent.click(screen.getByRole('button', { name: /Снизить вес/ }))

        expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled()
    })

    it('shows the numbers it calculated', async () => {
        answerEverything()
        useGuestOnboardingStore.setState({ step: GUEST_STEPS.activity })
        api.calculate.mockResolvedValue(result)

        render(<GuestOnboarding />)
        await userEvent.click(screen.getByRole('button', { name: 'Показать мою норму' }))

        expect(await screen.findByTestId('guest-calories')).toHaveTextContent('1800')
        expect(screen.getByText(/8 стаканов/)).toBeInTheDocument()
        expect(api.calculate).toHaveBeenCalledWith(
            expect.objectContaining({ sex: 'female', height_cm: 170, weight_kg: 65, goal: 'loss' })
        )
    })

    // Until there is a contact and a consent, the answers belong to the person
    // who typed them and to nobody else.
    it('sends nothing to the server before the contact step', async () => {
        render(<GuestOnboarding />)

        await userEvent.click(screen.getByRole('button', { name: /Снизить вес/ }))
        await userEvent.click(screen.getByRole('button', { name: 'Далее' }))

        expect(api.createLead).not.toHaveBeenCalled()
        expect(leadToken()).toBeNull()
    })

    // Somebody who closes the tab mid-answer should find their answers, not a
    // blank form.
    it('keeps the answers on the device', async () => {
        render(<GuestOnboarding />)
        await userEvent.click(screen.getByRole('button', { name: /Набрать массу/ }))

        expect(useGuestOnboardingStore.getState().goal).toBe('gain')
        expect(localStorage.getItem('guest-onboarding')).toContain('gain')
    })

    describe('the contact step', () => {
        beforeEach(() => {
            answerEverything()
            useGuestOnboardingStore.setState({ step: GUEST_STEPS.contact, result })
        })

        // Storing body measurements because somebody typed an address is not a
        // basis, so the button stays out of reach until they say so.
        it('cannot be submitted without the data-processing consent', async () => {
            render(<GuestOnboarding />)

            await userEvent.type(screen.getByLabelText('Email'), 'guest@example.com')

            expect(screen.getByRole('button', { name: 'Сохранить и продолжить' })).toBeDisabled()
        })

        it('saves once the address and the consent are there', async () => {
            api.createLead.mockResolvedValue({
                token: 'lead-token',
                lead: { id: 'lead-1' } as never,
            })

            render(<GuestOnboarding />)
            await userEvent.type(screen.getByLabelText('Email'), 'guest@example.com')
            await userEvent.click(screen.getByRole('checkbox', { name: /обработку персональных данных/ }))
            await userEvent.click(screen.getByRole('button', { name: 'Сохранить и продолжить' }))

            await waitFor(() => expect(api.createLead).toHaveBeenCalled())
            const [input] = api.createLead.mock.calls[0]
            expect(input.email).toBe('guest@example.com')
            expect(input.consents).toEqual({ data_processing: true, contact: false })
            // The browser keeps its claim, so registration can carry the
            // answers across.
            expect(leadToken()).toBe('lead-token')
            expect(push).toHaveBeenCalledWith('/auth?mode=register')
        })

        // Declining the reminder must not cost somebody their saved result.
        it('records the two consents separately', async () => {
            api.createLead.mockResolvedValue({ token: 't', lead: { id: 'l' } as never })

            render(<GuestOnboarding />)
            await userEvent.type(screen.getByLabelText('Email'), 'guest@example.com')
            await userEvent.click(screen.getByRole('checkbox', { name: /обработку персональных данных/ }))
            await userEvent.click(screen.getByRole('checkbox', { name: /напомнить мне/ }))
            await userEvent.click(screen.getByRole('button', { name: 'Сохранить и продолжить' }))

            await waitFor(() =>
                expect(api.createLead.mock.calls[0][0].consents).toEqual({
                    data_processing: true,
                    contact: true,
                })
            )
        })

        // Nobody is trapped on this screen: the result is theirs either way.
        it('lets somebody carry on without saving anything', async () => {
            render(<GuestOnboarding />)

            await userEvent.click(screen.getByRole('button', { name: 'Продолжить без сохранения' }))

            expect(api.createLead).not.toHaveBeenCalled()
            expect(push).toHaveBeenCalledWith('/auth?mode=register')
        })
    })

    // The link in the reminder opens their own answers rather than a blank form.
    it('restores a saved attempt from the link in the reminder', async () => {
        searchParams = new URLSearchParams({ resume: 'signed-token' })
        api.resume.mockResolvedValue({
            id: 'lead-1',
            email: 'guest@example.com',
            parameters: {
                sex: 'female',
                birth_date: '1990-05-01',
                height_cm: 170,
                weight_kg: 65,
                activity_level: 'moderate',
                goal: 'loss',
            },
            result,
            last_step: 'contact',
        })

        render(<GuestOnboarding />)

        expect(await screen.findByTestId('guest-calories')).toHaveTextContent('1800')
        expect(api.resume).toHaveBeenCalledWith('signed-token')
        expect(leadToken()).toBe('signed-token')
    })
})
