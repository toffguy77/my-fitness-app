import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

import { updateSettings } from '@/features/settings/api/settings'
import { completeOnboarding } from '../../api/onboarding'
import { useOnboardingStore } from '../../store/onboardingStore'
import { OnboardingWizard } from '../OnboardingWizard'

// --- Mocks ---

jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { error: jest.fn() }),
}))

jest.mock('@/features/settings/api/settings', () => ({
    updateSettings: jest.fn(),
    getProfile: jest.fn().mockResolvedValue({}),
}))

jest.mock('../../api/onboarding', () => ({
    completeOnboarding: jest.fn(),
}))

jest.mock('@/shared/components/settings', () => ({
    LanguageSelector: () => <div data-testid="language-selector">Lang</div>,
    UnitSelector: () => <div data-testid="unit-selector">Units</div>,
    TimezoneSelector: () => <div data-testid="timezone-selector">TZ</div>,
}))

const mockPush = jest.fn()
const mockUpdateSettings = updateSettings as jest.MockedFunction<typeof updateSettings>
const mockCompleteOnboarding = completeOnboarding as jest.MockedFunction<typeof completeOnboarding>

describe('OnboardingWizard', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
        ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
        localStorage.setItem('auth_token', 'test-token')
        useOnboardingStore.getState().reset()
        mockUpdateSettings.mockResolvedValue(undefined as never)
        mockCompleteOnboarding.mockResolvedValue(undefined)
    })

    afterEach(() => {
        localStorage.clear()
    })

    // The wizard now begins with what has to be set for the app to work at
    // all. A portrait is the most personal thing we could ask for and the least
    // useful; it belongs in settings, not in front of the first screen.
    it('opens on settings rather than a request for a photograph', () => {
        render(<OnboardingWizard />)
        expect(screen.getByText('Настройки')).toBeInTheDocument()
        expect(screen.queryByTestId('photo-uploader')).not.toBeInTheDocument()
    })

    // The guard moved to middleware.ts, which runs before this renders.
    it('does not send anybody to sign in on its own', () => {
        render(<OnboardingWizard />)
        expect(mockPush).not.toHaveBeenCalledWith('/auth')
    })

    it('shows "Далее" on non-last steps', () => {
        render(<OnboardingWizard />)
        expect(screen.getByRole('button', { name: 'Далее' })).toBeInTheDocument()
    })

    it('shows "Завершить" on last step', () => {
        useOnboardingStore.setState({ currentStep: 1 })
        render(<OnboardingWizard />)
        expect(screen.getByRole('button', { name: 'Завершить' })).toBeInTheDocument()
    })

    it('shows "Пропустить" button', () => {
        render(<OnboardingWizard />)
        expect(screen.getByRole('button', { name: 'Пропустить' })).toBeInTheDocument()
    })

    it('navigates to next step on "Далее" click', async () => {
        render(<OnboardingWizard />)
        await user.click(screen.getByRole('button', { name: 'Далее' }))

        await waitFor(() => {
            expect(screen.getByText('Тело и цели')).toBeInTheDocument()
        })
    })

    it('skips step on "Пропустить" click', async () => {
        render(<OnboardingWizard />)
        await user.click(screen.getByRole('button', { name: 'Пропустить' }))

        await waitFor(() => {
            expect(screen.getByText('Тело и цели')).toBeInTheDocument()
        })
    })

    it('calls updateSettings when navigating from the settings step', async () => {
        render(<OnboardingWizard />)

        await user.click(screen.getByRole('button', { name: 'Далее' }))

        await waitFor(() => {
            expect(mockUpdateSettings).toHaveBeenCalledTimes(1)
        })
    })

    it('calls completeOnboarding on last step and redirects to /dashboard', async () => {
        useOnboardingStore.setState({ currentStep: 1 })
        render(<OnboardingWizard />)

        await user.click(screen.getByRole('button', { name: 'Завершить' }))

        await waitFor(() => {
            expect(mockUpdateSettings).toHaveBeenCalled()
            expect(mockCompleteOnboarding).toHaveBeenCalled()
            expect(mockPush).toHaveBeenCalledWith('/dashboard')
        })
    })

    it('shows error toast on API failure during handleNext', async () => {
        useOnboardingStore.setState({ currentStep: 0 })
        mockUpdateSettings.mockRejectedValueOnce(new Error('Network error'))

        render(<OnboardingWizard />)
        await user.click(screen.getByRole('button', { name: 'Далее' }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Не удалось сохранить. Попробуйте ещё раз.'
            )
        })
    })

    it('shows error toast on API failure during handleSkip on last step', async () => {
        useOnboardingStore.setState({ currentStep: 1 })
        mockCompleteOnboarding.mockRejectedValueOnce(new Error('Network error'))

        render(<OnboardingWizard />)
        await user.click(screen.getByRole('button', { name: 'Пропустить' }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Не удалось завершить. Попробуйте ещё раз.'
            )
        })
    })

    describe('step titles', () => {
        const titles = ['Настройки', 'Тело и цели']

        titles.forEach((title, index) => {
            it(`shows "${title}" for step ${index}`, () => {
                useOnboardingStore.setState({ currentStep: index })
                render(<OnboardingWizard />)
                expect(screen.getByText(title)).toBeInTheDocument()
            })
        })
    })
})
