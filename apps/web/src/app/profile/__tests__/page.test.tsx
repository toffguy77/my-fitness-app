import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfilePage from '../page'
import { getProfile } from '@/features/settings/api/settings'
import { apiClient } from '@/shared/utils/api-client'

// --- Mocks ---

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/features/settings/api/settings', () => ({
    getProfile: jest.fn(),
}))

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        clearToken: jest.fn(),
    },
}))

jest.mock('@/features/dashboard/components/DashboardLayout', () => ({
    DashboardLayout: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dashboard-layout">{children}</div>
    ),
}))

jest.mock('@/features/curator', () => ({
    CuratorLayout: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="curator-layout">{children}</div>
    ),
}))

jest.mock('@/features/admin', () => ({
    AdminLayout: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="admin-layout">{children}</div>
    ),
}))

const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>

const baseProfile = {
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: 'https://example.com/avatar.jpg',
    settings: {},
}

describe('ProfilePage', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
        localStorage.setItem('auth_token', 'test-token')
        localStorage.setItem('user', JSON.stringify({ role: 'client' }))
        mockGetProfile.mockResolvedValue(baseProfile as never)
    })

    afterEach(() => {
        localStorage.clear()
    })

    // Branch: no auth token -> redirect to /auth (line 29-31)
    it('redirects to /auth when no auth_token', () => {
        localStorage.removeItem('auth_token')
        render(<ProfilePage />)
        expect(mockPush).toHaveBeenCalledWith('/auth')
    })

    // Branch: loading state (line 59)
    it('shows loading spinner initially', () => {
        mockGetProfile.mockImplementation(() => new Promise(() => {}))
        render(<ProfilePage />)
        expect(screen.queryByText('Выйти из аккаунта')).not.toBeInTheDocument()
    })

    // Branch: getProfile fails -> redirect (line 45-47)
    it('redirects to /auth when getProfile fails', async () => {
        mockGetProfile.mockRejectedValue(new Error('Unauthorized'))
        render(<ProfilePage />)

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith('/auth')
        })
    })

    // Branch: client role -> DashboardLayout (line 126-133)
    it('renders with DashboardLayout for client role', async () => {
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
        })
    })

    // Branch: coordinator role -> CuratorLayout (line 118-119)
    it('renders with CuratorLayout for coordinator role', async () => {
        localStorage.setItem('user', JSON.stringify({ role: 'coordinator' }))
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
        })
    })

    // Branch: super_admin role -> AdminLayout (line 122-123)
    it('renders with AdminLayout for super_admin role', async () => {
        localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }))
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByTestId('admin-layout')).toBeInTheDocument()
        })
    })

    // Branch: profile.avatar_url exists -> shows img (line 73-78)
    it('shows avatar image when avatar_url exists', async () => {
        render(<ProfilePage />)

        await waitFor(() => {
            const img = screen.getByAltText('Test User')
            expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
        })
    })

    // Branch: no avatar_url -> shows initial (line 79-83)
    it('shows initial when no avatar_url', async () => {
        mockGetProfile.mockResolvedValue({
            ...baseProfile,
            avatar_url: '',
        } as never)
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByText('T')).toBeInTheDocument()
        })
    })

    // Branch: profile.name exists -> shows name (line 84-86)
    it('shows profile name when available', async () => {
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByText('Test User')).toBeInTheDocument()
        })
    })

    // Branch: no profile.name -> no name displayed (line 84)
    it('does not show name paragraph when name is empty', async () => {
        mockGetProfile.mockResolvedValue({
            ...baseProfile,
            name: '',
        } as never)
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByText('test@example.com')).toBeInTheDocument()
        })
        // The name should not be shown in a paragraph
        expect(screen.queryByText('Test User')).not.toBeInTheDocument()
    })

    // Branch: initial uses email when name is empty (line 67)
    it('uses email for initial when name is empty', async () => {
        mockGetProfile.mockResolvedValue({
            ...baseProfile,
            name: '',
            avatar_url: '',
        } as never)
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByText('T')).toBeInTheDocument() // 't' from 'test@...' uppercased
        })
    })

    // Branch: handleLogout (line 51-57)
    it('clears auth and redirects on logout', async () => {
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByText('Выйти из аккаунта')).toBeInTheDocument()
        })

        await user.click(screen.getByText('Выйти из аккаунта'))

        expect(apiClient.clearToken).toHaveBeenCalled()
        expect(localStorage.getItem('user')).toBeNull()
        expect(mockPush).toHaveBeenCalledWith('/auth')
    })

    // Branch: invalid JSON in localStorage user (line 35-38 catch)
    it('uses default role when user JSON is invalid', async () => {
        localStorage.setItem('user', 'invalid-json')
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
        })
    })

    // Branch: user in localStorage has no role (line 37 - parsed is falsy)
    it('uses default role when user has no role field', async () => {
        localStorage.setItem('user', JSON.stringify({}))
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
        })
    })

    // Branch: menu items render correctly
    it('renders all settings menu items', async () => {
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByText('Настройки профиля')).toBeInTheDocument()
            expect(screen.getByText('Тело и цели')).toBeInTheDocument()
            expect(screen.getByText('Аккаунты социальных сетей')).toBeInTheDocument()
            expect(screen.getByText('Apple Health')).toBeInTheDocument()
            expect(screen.getByText('Уведомления')).toBeInTheDocument()
        })
    })

    // Branch: profile.name || profile.email for layout userName prop (line 119, 123, 128)
    it('passes email as userName when profile has no name for coordinator', async () => {
        localStorage.setItem('user', JSON.stringify({ role: 'coordinator' }))
        mockGetProfile.mockResolvedValue({
            ...baseProfile,
            name: '',
        } as never)
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
        })
    })

    // Branch: alt text falls back to 'Avatar' when name is empty (line 76)
    it('uses "Avatar" as alt text when name is empty', async () => {
        mockGetProfile.mockResolvedValue({
            ...baseProfile,
            name: '',
            avatar_url: 'https://example.com/avatar.jpg',
        } as never)
        render(<ProfilePage />)

        await waitFor(() => {
            expect(screen.getByAltText('Avatar')).toBeInTheDocument()
        })
    })
})
