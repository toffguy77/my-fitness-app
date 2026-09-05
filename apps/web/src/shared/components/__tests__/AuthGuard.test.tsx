import { render, screen, waitFor } from '@testing-library/react'

import { AuthGuard } from '../AuthGuard'
import { useSession } from '@/shared/hooks/useSession'

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

jest.mock('@/shared/hooks/useSession', () => ({
    useSession: jest.fn(),
}))

const session = useSession as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('AuthGuard', () => {
    it('renders children once the session is established', () => {
        session.mockReturnValue('authenticated')

        render(<AuthGuard><div>protected</div></AuthGuard>)

        expect(screen.getByText('protected')).toBeInTheDocument()
        expect(mockReplace).not.toHaveBeenCalled()
    })

    it('waits rather than redirecting while the session is being restored', () => {
        // The access token does not survive a reload; it is minted from the
        // cookie a moment later. Treating that moment as "signed out" bounced
        // every signed-in person off every page they reloaded.
        session.mockReturnValue('restoring')

        render(<AuthGuard><div>protected</div></AuthGuard>)

        expect(screen.queryByText('protected')).not.toBeInTheDocument()
        expect(screen.getByText('Загрузка...')).toBeInTheDocument()
        expect(mockReplace).not.toHaveBeenCalled()
    })

    it('sends somebody with no session to sign in', async () => {
        session.mockReturnValue('anonymous')

        render(<AuthGuard><div>protected</div></AuthGuard>)

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth'))
        expect(screen.queryByText('protected')).not.toBeInTheDocument()
    })
})
