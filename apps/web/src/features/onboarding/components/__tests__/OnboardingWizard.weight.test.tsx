/**
 * «Текущий вес» в онбординге — замер, а не цель.
 *
 * Поле уходило в настройки как `target_weight`: человек вводил свой вес,
 * а получал его же целью, и ни одного замера. Спека onboarding-body-step.
 *
 * Подменён только транспорт: проверяется то, что действительно уходит на
 * сервер, а не то, что компонент передал вспомогательной функции.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'

import { apiClient } from '@/shared/utils/api-client'
import { useOnboardingStore } from '../../store/onboardingStore'
import { OnboardingWizard } from '../OnboardingWizard'
import { todayIn } from '../../api/onboarding'

jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { error: jest.fn() }),
}))

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        put: jest.fn(),
        post: jest.fn(),
    },
}))

jest.mock('@/shared/components/settings', () => ({
    LanguageSelector: () => <div />,
    UnitSelector: () => <div />,
    TimezoneSelector: () => <div />,
}))

const mockGet = apiClient.get as jest.Mock
const mockPut = apiClient.put as jest.Mock
const mockPost = apiClient.post as jest.Mock
const mockPush = jest.fn()

function settingsCalls() {
    return mockPut.mock.calls.filter(([url]) => url === '/api/v1/users/settings')
}

function weightCalls() {
    return mockPost.mock.calls.filter(([url]) => url === '/api/v1/dashboard/daily')
}

describe('Онбординг: текущий вес', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
        ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
        useOnboardingStore.getState().reset()
        mockGet.mockResolvedValue({ profile: { settings: null } })
        mockPut.mockResolvedValue({})
        mockPost.mockResolvedValue({})
    })

    // «Ввод текущего веса»
    it('сохраняет 78,4 кг замером за сегодня и не шлёт target_weight', async () => {
        useOnboardingStore.setState({ currentStep: 1, timezone: 'Europe/Moscow' })
        render(<OnboardingWizard />)

        await user.type(screen.getByLabelText(/Текущий вес/), '78.4')
        await user.click(screen.getByRole('button', { name: 'Завершить' }))

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'))

        expect(weightCalls()).toEqual([
            [
                '/api/v1/dashboard/daily',
                {
                    date: todayIn('Europe/Moscow'),
                    metric: { type: 'weight', data: { weight: 78.4 } },
                },
            ],
        ])
        expect(settingsCalls()).toHaveLength(1)
        expect(settingsCalls()[0][1]).not.toHaveProperty('target_weight')
    })

    // «Вес не введён»
    it('не отправляет замер, когда поле пустое', async () => {
        useOnboardingStore.setState({ currentStep: 1 })
        render(<OnboardingWizard />)

        await user.click(screen.getByRole('button', { name: 'Завершить' }))

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'))
        expect(weightCalls()).toHaveLength(0)
        expect(settingsCalls()[0][1]).not.toHaveProperty('target_weight')
    })

    // Замеры хранятся в килограммах: 154 фунта — это 69,9 кг, а не 154.
    it('переводит фунты в килограммы при имперских единицах', async () => {
        useOnboardingStore.setState({ currentStep: 1, units: 'imperial', currentWeight: '154' })
        render(<OnboardingWizard />)

        await user.click(screen.getByRole('button', { name: 'Завершить' }))

        await waitFor(() => expect(weightCalls()).toHaveLength(1))
        expect(weightCalls()[0][1].metric).toEqual({ type: 'weight', data: { weight: 69.9 } })
    })

    // Неудавшийся замер — не тихая потеря: онбординг не завершается, и
    // человек видит ошибку, а не дашборд без своего веса.
    it('не уводит на дашборд, если замер не сохранился', async () => {
        mockPost.mockRejectedValueOnce(new Error('boom'))
        useOnboardingStore.setState({ currentStep: 1, currentWeight: '80' })
        render(<OnboardingWizard />)

        await user.click(screen.getByRole('button', { name: 'Завершить' }))

        await waitFor(() => expect(weightCalls()).toHaveLength(1))
        expect(mockPut).not.toHaveBeenCalledWith('/api/v1/users/onboarding/complete', {})
        expect(mockPush).not.toHaveBeenCalled()
    })
})

describe('todayIn', () => {
    // 2026-10-15 22:30 UTC — в Москве уже 16-е, в Лос-Анджелесе ещё 15-е.
    const lateEvening = new Date(Date.UTC(2026, 9, 15, 22, 30))

    it('считает день в выбранном часовом поясе', () => {
        expect(todayIn('Europe/Moscow', lateEvening)).toBe('2026-10-16')
        expect(todayIn('America/Los_Angeles', lateEvening)).toBe('2026-10-15')
    })

    it('берёт местный день, если пояс не задан или неизвестен', () => {
        const local = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        expect(todayIn(undefined, lateEvening)).toBe(local(lateEvening))
        expect(todayIn('Not/AZone', lateEvening)).toBe(local(lateEvening))
    })
})
