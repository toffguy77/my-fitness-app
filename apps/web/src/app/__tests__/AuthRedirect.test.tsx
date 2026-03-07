import { render } from '@testing-library/react'
import { AuthRedirect } from '../_components/AuthRedirect'

const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        replace: mockReplace,
        push: jest.fn(),
    }),
}))

jest.mock('@/shared/utils/token-storage', () => ({
    isAuthenticated: jest.fn(),
}))

import { isAuthenticated } from '@/shared/utils/token-storage'

const mockIsAuthenticated = isAuthenticated as jest.MockedFunction<typeof isAuthenticated>

describe('AuthRedirect', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('redirects to /dashboard when authenticated', () => {
        mockIsAuthenticated.mockReturnValue(true)

        render(<AuthRedirect />)

        expect(mockReplace).toHaveBeenCalledWith('/dashboard')
    })

    it('does not redirect when not authenticated', () => {
        mockIsAuthenticated.mockReturnValue(false)

        render(<AuthRedirect />)

        expect(mockReplace).not.toHaveBeenCalled()
    })

    it('renders nothing', () => {
        mockIsAuthenticated.mockReturnValue(false)

        const { container } = render(<AuthRedirect />)

        expect(container.firstChild).toBeNull()
    })
})
