import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileCompletionBanner } from '../ProfileCompletionBanner'
import { getProfile } from '@/features/settings/api/settings'

jest.mock('@/features/settings/api/settings', () => ({
    getProfile: jest.fn(),
}))

jest.mock('next/link', () => {
    return function MockLink({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) {
        return <a href={href} {...props}>{children}</a>
    }
})

jest.mock('lucide-react', () => ({
    X: function MockX(props: Record<string, unknown>) {
        return <svg data-testid="x-icon" {...props} />
    },
}))

const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>

describe('ProfileCompletionBanner', () => {
    let localStorageStore: Record<string, string>

    beforeEach(() => {
        jest.clearAllMocks()
        localStorageStore = {}
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(
            (key: string) => localStorageStore[key] ?? null
        )
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(
            (key: string, value: string) => { localStorageStore[key] = value }
        )
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    const completeProfile = {
        id: 1,
        email: 'test@test.com',
        name: 'Test',
        role: 'user',
        avatar_url: '',
        onboarding_completed: true,
        settings: {
            language: 'ru',
            units: 'metric',
            timezone: 'Europe/Moscow',
            telegram_username: '',
            instagram_username: '',
            apple_health_enabled: false,
            birth_date: '1990-01-01',
            biological_sex: 'male',
            height: 180,
        },
    }

    it('shows banner when profile is missing birth_date', async () => {
        mockGetProfile.mockResolvedValueOnce({
            ...completeProfile,
            settings: { ...completeProfile.settings, birth_date: null },
        } as never)

        render(<ProfileCompletionBanner />)

        await waitFor(() => {
            expect(screen.getByText(/Заполните профиль/)).toBeInTheDocument()
        })
    })

    it('shows banner when profile is missing biological_sex', async () => {
        mockGetProfile.mockResolvedValueOnce({
            ...completeProfile,
            settings: { ...completeProfile.settings, biological_sex: null },
        } as never)

        render(<ProfileCompletionBanner />)

        await waitFor(() => {
            expect(screen.getByText(/Заполните профиль/)).toBeInTheDocument()
        })
    })

    it('shows banner when profile is missing height', async () => {
        mockGetProfile.mockResolvedValueOnce({
            ...completeProfile,
            settings: { ...completeProfile.settings, height: null },
        } as never)

        render(<ProfileCompletionBanner />)

        await waitFor(() => {
            expect(screen.getByText(/Заполните профиль/)).toBeInTheDocument()
        })
    })

    it('does NOT show banner when profile is complete', async () => {
        mockGetProfile.mockResolvedValueOnce(completeProfile as never)

        render(<ProfileCompletionBanner />)

        // Wait for the profile fetch to complete
        await act(async () => {
            await new Promise(r => setTimeout(r, 0))
        })

        expect(screen.queryByText(/Заполните профиль/)).not.toBeInTheDocument()
    })

    it('does NOT show banner when dismissed less than 3 days ago', async () => {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        localStorageStore['kbju_banner_dismissed'] = yesterday.toISOString()

        mockGetProfile.mockResolvedValueOnce({
            ...completeProfile,
            settings: { ...completeProfile.settings, height: null },
        } as never)

        render(<ProfileCompletionBanner />)

        await act(async () => {
            await new Promise(r => setTimeout(r, 0))
        })

        expect(screen.queryByText(/Заполните профиль/)).not.toBeInTheDocument()
        // getProfile should not even be called since we return early
        expect(mockGetProfile).not.toHaveBeenCalled()
    })

    it('shows banner again after 3 days since dismissal', async () => {
        const fourDaysAgo = new Date()
        fourDaysAgo.setDate(fourDaysAgo.getDate() - 4)
        localStorageStore['kbju_banner_dismissed'] = fourDaysAgo.toISOString()

        mockGetProfile.mockResolvedValueOnce({
            ...completeProfile,
            settings: { ...completeProfile.settings, height: null },
        } as never)

        render(<ProfileCompletionBanner />)

        await waitFor(() => {
            expect(screen.getByText(/Заполните профиль/)).toBeInTheDocument()
        })
    })

    it('dismiss button sets localStorage and hides banner', async () => {
        mockGetProfile.mockResolvedValueOnce({
            ...completeProfile,
            settings: { ...completeProfile.settings, height: null },
        } as never)

        render(<ProfileCompletionBanner />)

        await waitFor(() => {
            expect(screen.getByText(/Заполните профиль/)).toBeInTheDocument()
        })

        const user = userEvent.setup()
        const dismissButton = screen.getByRole('button')
        await user.click(dismissButton)

        expect(screen.queryByText(/Заполните профиль/)).not.toBeInTheDocument()
        expect(localStorageStore['kbju_banner_dismissed']).toBeDefined()
    })

    it('link points to /settings/body', async () => {
        mockGetProfile.mockResolvedValueOnce({
            ...completeProfile,
            settings: { ...completeProfile.settings, birth_date: null },
        } as never)

        render(<ProfileCompletionBanner />)

        await waitFor(() => {
            const link = screen.getByText('Заполнить')
            expect(link).toHaveAttribute('href', '/settings/body')
        })
    })
})
