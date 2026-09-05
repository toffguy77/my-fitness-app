import { render, waitFor } from '@testing-library/react'

import { AuthRedirect } from '../_components/AuthRedirect'
import { useSession } from '@/shared/hooks/useSession'

const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}))

jest.mock('@/shared/hooks/useSession', () => ({
    useSession: jest.fn(),
}))

const session = useSession as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('AuthRedirect', () => {
    it('sends a signed-in visitor to their dashboard', async () => {
        session.mockReturnValue('authenticated')

        render(<AuthRedirect />)

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard'))
    })

    it('leaves a visitor with no session where they are', async () => {
        session.mockReturnValue('anonymous')

        render(<AuthRedirect />)

        await waitFor(() => expect(mockReplace).not.toHaveBeenCalled())
    })

    it('waits rather than acting while the session is being restored', async () => {
        // Redirecting here would take somebody off the sign-in page they
        // opened deliberately; not redirecting would leave a signed-in person
        // looking at a form they do not need. Neither, until it is known.
        session.mockReturnValue('restoring')

        render(<AuthRedirect />)

        await waitFor(() => expect(mockReplace).not.toHaveBeenCalled())
    })
})
