import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

import { updateSettings, getProfile, uploadAvatar } from '@/features/settings/api/settings'
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
    uploadAvatar: jest.fn(),
    getProfile: jest.fn().mockResolvedValue({}),
}))

jest.mock('../../api/onboarding', () => ({
    completeOnboarding: jest.fn(),
}))

jest.mock('@/shared/components/settings', () => ({
    PhotoUploader: ({ onUpload }: { onUpload: (f: File) => Promise<string> }) => (
        <div data-testid="photo-uploader">
            <button onClick={() => onUpload(new File([''], 'test.jpg'))}>upload</button>
        </div>
    ),
    LanguageSelector: () => <div data-testid="language-selector">Lang</div>,
    UnitSelector: () => <div data-testid="unit-selector">Units</div>,
    TimezoneSelector: () => <div data-testid="timezone-selector">TZ</div>,
    SocialAccountsForm: () => <div data-testid="social-form">Social</div>,
    AppleHealthToggle: () => <div data-testid="apple-health">AH</div>,
}))

const mockPush = jest.fn()
const mockUpdateSettings = updateSettings as jest.MockedFunction<typeof updateSettings>
const mockCompleteOnboarding = completeOnboarding as jest.MockedFunction<typeof completeOnboarding>
const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>
const mockUploadAvatar = uploadAvatar as jest.MockedFunction<typeof uploadAvatar>

describe('OnboardingWizard - branch coverage', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
        ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
        localStorage.setItem('auth_token', 'test-token')
        useOnboardingStore.getState().reset()
        mockUpdateSettings.mockResolvedValue(undefined as never)
        mockCompleteOnboarding.mockResolvedValue(undefined)
        mockGetProfile.mockResolvedValue({} as never)
    })

    afterEach(() => {
        localStorage.clear()
    })

    // Branch: loadProfile with full profile settings (lines 85-108)
    it('pre-populates store from existing profile with all fields', async () => {
        mockGetProfile.mockResolvedValue({
            avatar_url: 'https://example.com/avatar.jpg',
            settings: {
                language: 'en',
                units: 'imperial',
                timezone: 'US/Eastern',
                birth_date: '1990-01-01',
                biological_sex: 'male',
                height: 180,
                activity_level: 'active',
                fitness_goal: 'gain',
                telegram_username: '@user',
                instagram_username: 'insta',
                apple_health_enabled: true,
            },
        } as never)

        render(<OnboardingWizard />)

        await waitFor(() => {
            const state = useOnboardingStore.getState()
            expect(state.avatarUrl).toBe('https://example.com/avatar.jpg')
            expect(state.language).toBe('en')
            expect(state.units).toBe('imperial')
            expect(state.timezone).toBe('US/Eastern')
            expect(state.birthDate).toBe('1990-01-01')
            expect(state.biologicalSex).toBe('male')
            expect(state.height).toBe('180')
            expect(state.activityLevel).toBe('active')
            expect(state.fitnessGoal).toBe('gain')
            expect(state.telegram).toBe('@user')
            expect(state.instagram).toBe('insta')
            expect(state.appleHealthEnabled).toBe(true)
        })
    })

    // Branch: loadProfile with female biological_sex (line 96-98)
    it('pre-populates female biological sex', async () => {
        mockGetProfile.mockResolvedValue({
            settings: {
                biological_sex: 'female',
            },
        } as never)

        render(<OnboardingWizard />)

        await waitFor(() => {
            expect(useOnboardingStore.getState().biologicalSex).toBe('female')
        })
    })

    // Branch: loadProfile with various activity levels (lines 100-102)
    it.each(['sedentary', 'light', 'moderate'] as const)(
        'pre-populates activity level: %s',
        async (level) => {
            mockGetProfile.mockResolvedValue({
                settings: { activity_level: level },
            } as never)

            render(<OnboardingWizard />)

            await waitFor(() => {
                expect(useOnboardingStore.getState().activityLevel).toBe(level)
            })
        }
    )

    // Branch: loadProfile with fitness goals (lines 103-105)
    it.each(['loss', 'maintain'] as const)(
        'pre-populates fitness goal: %s',
        async (goal) => {
            mockGetProfile.mockResolvedValue({
                settings: { fitness_goal: goal },
            } as never)

            render(<OnboardingWizard />)

            await waitFor(() => {
                expect(useOnboardingStore.getState().fitnessGoal).toBe(goal)
            })
        }
    )

    // Branch: loadProfile with no avatar_url (line 85)
    it('does not set avatar url when profile has none', async () => {
        mockGetProfile.mockResolvedValue({
            settings: { language: 'ru' },
        } as never)

        render(<OnboardingWizard />)

        await waitFor(() => {
            expect(useOnboardingStore.getState().avatarUrl).toBe('')
        })
    })

    // Branch: loadProfile with no settings (line 86)
    it('uses defaults when profile has no settings', async () => {
        mockGetProfile.mockResolvedValue({} as never)

        render(<OnboardingWizard />)

        await waitFor(() => {
            expect(useOnboardingStore.getState().language).toBe('ru')
        })
    })

    // Branch: loadProfile with invalid language value (line 88 - not 'ru' or 'en')
    it('ignores invalid language values', async () => {
        mockGetProfile.mockResolvedValue({
            settings: { language: 'fr' },
        } as never)

        render(<OnboardingWizard />)

        await waitFor(() => {
            expect(useOnboardingStore.getState().language).toBe('ru')
        })
    })

    // Branch: loadProfile with invalid units value (line 91)
    it('ignores invalid units values', async () => {
        mockGetProfile.mockResolvedValue({
            settings: { units: 'stones' },
        } as never)

        render(<OnboardingWizard />)

        await waitFor(() => {
            expect(useOnboardingStore.getState().units).toBe('metric')
        })
    })

    // Branch: loadProfile with invalid biological_sex (line 96)
    it('ignores invalid biological_sex values', async () => {
        mockGetProfile.mockResolvedValue({
            settings: { biological_sex: 'other' },
        } as never)

        render(<OnboardingWizard />)

        await waitFor(() => {
            expect(useOnboardingStore.getState().biologicalSex).toBe('')
        })
    })

    // Branch: loadProfile with invalid activity_level (line 100)
    it('ignores invalid activity level values', async () => {
        mockGetProfile.mockResolvedValue({
            settings: { activity_level: 'extreme' },
        } as never)

        render(<OnboardingWizard />)

        await waitFor(() => {
            expect(useOnboardingStore.getState().activityLevel).toBe('moderate')
        })
    })

    // Branch: loadProfile with invalid fitness_goal (line 103)
    it('ignores invalid fitness goal values', async () => {
        mockGetProfile.mockResolvedValue({
            settings: { fitness_goal: 'bulk' },
        } as never)

        render(<OnboardingWizard />)

        await waitFor(() => {
            expect(useOnboardingStore.getState().fitnessGoal).toBe('maintain')
        })
    })

    // Branch: loadProfile fails (line 110 - catch block)
    it('continues with defaults when getProfile throws', async () => {
        mockGetProfile.mockRejectedValue(new Error('Network error'))

        render(<OnboardingWizard />)

        await waitFor(() => {
            expect(screen.getByText('Фото профиля')).toBeInTheDocument()
        })
    })

    // Branch: handlePhotoUpload (line 118-122)
    it('handles photo upload via PhotoUploader', async () => {
        mockUploadAvatar.mockResolvedValue('https://example.com/new-avatar.jpg')
        render(<OnboardingWizard />)

        await user.click(screen.getByText('upload'))

        await waitFor(() => {
            expect(mockUploadAvatar).toHaveBeenCalled()
            expect(useOnboardingStore.getState().avatarUrl).toBe('https://example.com/new-avatar.jpg')
        })
    })

    // Branch: buildBodyPayload with body values set (lines 137-143)
    it('includes body payload fields in step 2 when values are set', async () => {
        useOnboardingStore.setState({
            currentStep: 2,
            birthDate: '1990-01-01',
            biologicalSex: 'male',
            activityLevel: 'active',
            fitnessGoal: 'gain',
            height: '180',
            currentWeight: '80',
        })

        render(<OnboardingWizard />)
        await user.click(screen.getByRole('button', { name: 'Далее' }))

        await waitFor(() => {
            expect(mockUpdateSettings).toHaveBeenCalledWith(
                expect.objectContaining({
                    birth_date: '1990-01-01',
                    biological_sex: 'male',
                    activity_level: 'active',
                    fitness_goal: 'gain',
                    height: 180,
                    target_weight: 80,
                })
            )
        })
    })

    // Branch: buildBodyPayload with no body values (lines 137-143 all false)
    it('sends only settings payload when no body values set in step 2', async () => {
        useOnboardingStore.setState({
            currentStep: 2,
            birthDate: '',
            biologicalSex: '',
            activityLevel: 'moderate',
            fitnessGoal: 'maintain',
            height: '',
            currentWeight: '',
        })

        render(<OnboardingWizard />)
        await user.click(screen.getByRole('button', { name: 'Далее' }))

        await waitFor(() => {
            expect(mockUpdateSettings).toHaveBeenCalled()
            const call = mockUpdateSettings.mock.calls[0][0] as Record<string, unknown>
            expect(call).not.toHaveProperty('birth_date')
            expect(call).not.toHaveProperty('biological_sex')
            expect(call).not.toHaveProperty('height')
            expect(call).not.toHaveProperty('target_weight')
        })
    })

    // Branch: step rendering — step 2 content (lines 246-400)
    it('renders body and goals form on step 2', () => {
        useOnboardingStore.setState({ currentStep: 2 })
        render(<OnboardingWizard />)

        expect(screen.getByLabelText(/Дата рождения/)).toBeInTheDocument()
        expect(screen.getByText('Мужской')).toBeInTheDocument()
        expect(screen.getByText('Женский')).toBeInTheDocument()
        expect(screen.getByLabelText(/Текущий вес/)).toBeInTheDocument()
        expect(screen.getByLabelText(/Рост/)).toBeInTheDocument()
        expect(screen.getByLabelText(/Уровень активности/)).toBeInTheDocument()
        expect(screen.getByText('Снижение')).toBeInTheDocument()
        expect(screen.getByText('Поддержание')).toBeInTheDocument()
        expect(screen.getByText('Набор')).toBeInTheDocument()
    })

    // Branch: step 3 shows social accounts form (line 402-409)
    it('renders social accounts form on step 3', () => {
        useOnboardingStore.setState({ currentStep: 3 })
        render(<OnboardingWizard />)
        expect(screen.getByTestId('social-form')).toBeInTheDocument()
    })

    // Branch: step 4 shows apple health toggle (line 411-416)
    it('renders apple health toggle on step 4', () => {
        useOnboardingStore.setState({ currentStep: 4 })
        render(<OnboardingWizard />)
        expect(screen.getByTestId('apple-health')).toBeInTheDocument()
    })

    // Branch: saving state - shows spinner (line 431-458)
    it('shows saving spinner while saving', async () => {
        let resolveUpdate: () => void
        mockUpdateSettings.mockImplementation(() => new Promise<void>((resolve) => {
            resolveUpdate = resolve
        }) as never)

        useOnboardingStore.setState({ currentStep: 1 })
        render(<OnboardingWizard />)

        await user.click(screen.getByRole('button', { name: 'Далее' }))

        expect(screen.getByText('Сохранение...')).toBeInTheDocument()

        // Resolve to clean up
        resolveUpdate!()
        await waitFor(() => {
            expect(screen.queryByText('Сохранение...')).not.toBeInTheDocument()
        })
    })

    // Branch: units === 'metric' vs 'imperial' label text (lines 310, 320, 328, 338)
    it('shows metric labels when units is metric', () => {
        useOnboardingStore.setState({ currentStep: 2, units: 'metric' })
        render(<OnboardingWizard />)
        expect(screen.getByLabelText(/кг/)).toBeInTheDocument()
        expect(screen.getByLabelText(/см/)).toBeInTheDocument()
    })

    it('shows imperial labels when units is imperial', () => {
        useOnboardingStore.setState({ currentStep: 2, units: 'imperial' })
        render(<OnboardingWizard />)
        expect(screen.getByLabelText(/lbs/)).toBeInTheDocument()
        expect(screen.getByLabelText(/\bin\b/)).toBeInTheDocument()
    })

    // Branch: handleSkip on last step succeeds (line 189-194)
    it('completes onboarding and redirects on skip at last step', async () => {
        useOnboardingStore.setState({ currentStep: 4 })
        render(<OnboardingWizard />)

        await user.click(screen.getByRole('button', { name: 'Пропустить' }))

        await waitFor(() => {
            expect(mockCompleteOnboarding).toHaveBeenCalled()
            expect(mockPush).toHaveBeenCalledWith('/dashboard')
        })
    })

    // Branch: handleSkip on non-last step (line 200-202)
    it('advances to next step on skip at non-last step', async () => {
        useOnboardingStore.setState({ currentStep: 2 })
        render(<OnboardingWizard />)

        await user.click(screen.getByRole('button', { name: 'Пропустить' }))

        await waitFor(() => {
            expect(screen.getByText('Социальные сети')).toBeInTheDocument()
        })
    })

    // Branch: handleNext step 4 success with toast (line 177)
    it('shows welcome toast on completing last step', async () => {
        useOnboardingStore.setState({ currentStep: 4 })
        render(<OnboardingWizard />)

        await user.click(screen.getByRole('button', { name: 'Завершить' }))

        await waitFor(() => {
            expect(toast).toHaveBeenCalledWith('Добро пожаловать!')
        })
    })
})
