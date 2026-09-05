/**
 * Who gets to see the notifications page.
 *
 * The redirect for a signed-out visitor moved to middleware.ts, which runs
 * before the page is rendered at all. What the page still has to get right is
 * the wait while the session is minted from the cookie: showing nothing during
 * it is correct, showing the sign-in screen is not.
 */

import { render, screen, waitFor } from '@testing-library/react'

import NotificationsPage from '../page'
import { useSession } from '@/shared/hooks/useSession'

jest.mock('@/features/notifications/components/NotificationsPage', () => ({
    NotificationsPage: () => (
        <div data-testid="notifications-page-component">Notifications Content</div>
    ),
}))

jest.mock('@/shared/hooks/useSession', () => ({
    useSession: jest.fn(),
}))

const session = useSession as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('NotificationsPage', () => {
    it('renders the notifications once the session is established', async () => {
        session.mockReturnValue('authenticated')

        render(<NotificationsPage />)

        await waitFor(() => {
            expect(screen.getByTestId('notifications-page-component')).toBeInTheDocument()
        })
    })

    it('shows the loading state while the session is being restored', () => {
        session.mockReturnValue('restoring')

        render(<NotificationsPage />)

        expect(screen.getByText('Загрузка...')).toBeInTheDocument()
        expect(screen.queryByTestId('notifications-page-component')).not.toBeInTheDocument()
    })

    it('renders nothing when there turns out to be no session', () => {
        session.mockReturnValue('anonymous')

        render(<NotificationsPage />)

        expect(screen.queryByTestId('notifications-page-component')).not.toBeInTheDocument()
        expect(screen.queryByText('Загрузка...')).not.toBeInTheDocument()
    })

    it('stops showing the loading state once the session is established', async () => {
        session.mockReturnValue('authenticated')

        render(<NotificationsPage />)

        await waitFor(() => {
            expect(screen.getByTestId('notifications-page-component')).toBeInTheDocument()
        })
        expect(screen.queryByText('Загрузка...')).not.toBeInTheDocument()
    })
})
