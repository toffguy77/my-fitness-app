/**
 * Онбординг: причина отказа доезжает до человека.
 *
 * Здесь человек ещё ничего про продукт не знает, и заготовка «не удалось
 * сохранить» стоит дороже, чем где-либо: он просто уходит. «Слишком много
 * запросов, подождите немного» — это указание подождать, а не повод уйти.
 *
 * Что здесь намеренно НЕ проверяется: гостевая форма не должна становиться
 * оракулом существования аккаунта. Ручка POST /api/v1/public/leads про
 * зарегистрированный адрес не знает ничего и отвечает одинаково — поэтому
 * показывать её отказ безопасно.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/shared/errors/apiErrors'

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
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: jest.fn() }),
    useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/features/settings/api/settings', () => ({
    updateSettings: jest.fn(),
    getProfile: jest.fn(),
}))

jest.mock('../../api/onboarding', () => ({
    completeOnboarding: jest.fn(),
}))

jest.mock('@/shared/components/settings', () => ({
    LanguageSelector: () => <div data-testid="language-selector">Lang</div>,
    UnitSelector: () => <div data-testid="unit-selector">Units</div>,
    TimezoneSelector: () => <div data-testid="timezone-selector">TZ</div>,
}))

import toast from 'react-hot-toast'
import { GuestOnboarding } from '../GuestOnboarding'
import { OnboardingWizard } from '../OnboardingWizard'
import { guestApi } from '../../api/guest'
import { useGuestOnboardingStore, GUEST_STEPS } from '../../store/guestOnboardingStore'
import { useOnboardingStore } from '../../store/onboardingStore'
import { updateSettings, getProfile } from '@/features/settings/api/settings'
import { completeOnboarding } from '../../api/onboarding'

const api = guestApi as jest.Mocked<typeof guestApi>
const mockUpdateSettings = updateSettings as jest.MockedFunction<typeof updateSettings>
const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>
const mockComplete = completeOnboarding as jest.MockedFunction<typeof completeOnboarding>

/** Отказ, который сервер объяснил кодом. */
function refusal(status: number, code: string) {
    return new ApiError(status, { code, message: 'серверная проза' })
}

const WAIT = { timeout: 1500 }

const result = {
    calories: 1800, protein: 120, fat: 50, carbs: 200,
    bmr: 1400, tdee: 2100, water_glasses: 8,
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
    localStorage.clear()
    useGuestOnboardingStore.getState().reset()
    useOnboardingStore.getState().reset()
    mockGetProfile.mockResolvedValue({} as never)
    mockUpdateSettings.mockResolvedValue(undefined as never)
    mockComplete.mockResolvedValue(undefined)
})

describe('Гостевой расчёт', () => {
    // «Подождите немного» — это указание, что делать; «не удалось рассчитать»
    // читается как «у них не работает» и заканчивается уходом.
    it('говорит, что запросов слишком много, а не «не удалось рассчитать»', async () => {
        answerEverything()
        useGuestOnboardingStore.setState({ step: GUEST_STEPS.activity })
        api.calculate.mockRejectedValue(refusal(429, 'rate_limited'))

        render(<GuestOnboarding />)
        await userEvent.click(screen.getByRole('button', { name: 'Показать мою норму' }))

        await waitFor(
            () => expect(toast.error).toHaveBeenCalledWith('Слишком много запросов. Подождите немного.'),
            WAIT
        )
    })

    it('показывает причину, по которой результат не сохранился', async () => {
        answerEverything()
        useGuestOnboardingStore.setState({ step: GUEST_STEPS.contact, result })
        api.createLead.mockRejectedValue(refusal(400, 'validation'))

        render(<GuestOnboarding />)
        await userEvent.type(screen.getByLabelText('Email'), 'guest@example.com')
        await userEvent.click(screen.getByRole('checkbox', { name: /обработку моих данных/ }))
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить и продолжить' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Проверьте введённые данные'), WAIT)
    })
})

describe('Мастер первого входа', () => {
    it('показывает причину, по которой шаг не сохранился', async () => {
        mockUpdateSettings.mockRejectedValue(refusal(400, 'validation'))

        render(<OnboardingWizard />)
        await userEvent.click(screen.getByRole('button', { name: 'Далее' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Проверьте введённые данные'), WAIT)
    })

    it('показывает причину, по которой онбординг не завершился', async () => {
        useOnboardingStore.setState({ currentStep: 1 })
        mockComplete.mockRejectedValue(refusal(401, 'session_ended'))

        render(<OnboardingWizard />)
        await userEvent.click(screen.getByRole('button', { name: 'Пропустить' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Сессия завершена, войдите заново'), WAIT)
    })

    // Предзаполнение — необязательная любезность: мастер работает и с
    // умолчаниями. Здесь молчание — решение, и оно должно остаться молчанием.
    it('молчит, когда профиль для предзаполнения не прочитался', async () => {
        mockGetProfile.mockRejectedValue(refusal(500, 'internal'))

        render(<OnboardingWizard />)

        await screen.findByTestId('language-selector')
        await waitFor(() => expect(mockGetProfile).toHaveBeenCalled(), WAIT)
        expect(toast.error).not.toHaveBeenCalled()
    })
})
