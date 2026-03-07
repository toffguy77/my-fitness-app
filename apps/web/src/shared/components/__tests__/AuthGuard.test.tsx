import { render, screen } from '@testing-library/react'
import { AuthGuard } from '../AuthGuard'

const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
    useRouter: () => ({
        replace: mockReplace,
        push: jest.fn(),
        back: jest.fn(),
        forward: jest.fn(),
        refresh: jest.fn(),
        prefetch: jest.fn(),
    }),
}))

jest.mock('@/shared/utils/token-storage', () => ({
    isAuthenticated: jest.fn(),
}))

import { isAuthenticated } from '@/shared/utils/token-storage'

const mockedIsAuthenticated = isAuthenticated as jest.MockedFunction<typeof isAuthenticated>

describe('AuthGuard', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders children when authenticated', () => {
        mockedIsAuthenticated.mockReturnValue(true)

        render(
            <AuthGuard>
                <div>Protected content</div>
            </AuthGuard>
        )

        expect(screen.getByText('Protected content')).toBeInTheDocument()
        expect(mockReplace).not.toHaveBeenCalled()
    })

    it('redirects to /auth when not authenticated', () => {
        mockedIsAuthenticated.mockReturnValue(false)

        render(
            <AuthGuard>
                <div>Protected content</div>
            </AuthGuard>
        )

        expect(mockReplace).toHaveBeenCalledWith('/auth')
        expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    })

    it('shows loading spinner when not authenticated', () => {
        mockedIsAuthenticated.mockReturnValue(false)

        render(
            <AuthGuard>
                <div>Protected content</div>
            </AuthGuard>
        )

        expect(screen.getByText(/Загрузка/)).toBeInTheDocument()
    })

    it('does not show loading spinner when authenticated', () => {
        mockedIsAuthenticated.mockReturnValue(true)

        render(
            <AuthGuard>
                <div>Protected content</div>
            </AuthGuard>
        )

        expect(screen.queryByText(/Загрузка/)).not.toBeInTheDocument()
    })
})
