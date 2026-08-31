import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RootError from '../error'
import NotFound from '../not-found'
import DashboardError from '../dashboard/error'
import FoodTrackerError from '../food-tracker/error'
import ChatError from '../chat/error'
import CuratorError from '../curator/error'
import AdminError from '../admin/error'
import SettingsError from '../settings/error'
import NotificationsError from '../notifications/error'
import ContentError from '../content/error'
import ProfileError from '../profile/error'
import OnboardingError from '../onboarding/error'
import { reportError } from '@/shared/errors/reportError'

jest.mock('@/shared/errors/reportError', () => ({
    reportError: jest.fn(() => 'ABCD-2345'),
}))

const segments: Array<[string, React.ComponentType<{ error: Error & { digest?: string }; reset: () => void }>]> = [
    ['root', RootError],
    ['dashboard', DashboardError],
    ['food-tracker', FoodTrackerError],
    ['chat', ChatError],
    ['curator', CuratorError],
    ['admin', AdminError],
    ['settings', SettingsError],
    ['notifications', NotificationsError],
    ['content', ContentError],
    ['profile', ProfileError],
    ['onboarding', OnboardingError],
]

describe('route error components', () => {
    beforeEach(() => jest.clearAllMocks())

    // Before these files existed, any render error showed the framework's own
    // English screen with no navigation and no way to report the problem.
    it.each(segments)('%s renders a Russian error screen and reports the failure', async (_name, Component) => {
        const reset = jest.fn()
        const error = Object.assign(new Error('boom'), { digest: 'abc123' })

        render(<Component error={error} reset={reset} />)

        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByText(/Что-то пошло не так/)).toBeInTheDocument()
        expect(reportError).toHaveBeenCalledWith(
            error,
            expect.objectContaining({ source: 'route-error', errorId: expect.any(String) }),
        )

        await userEvent.click(screen.getByRole('button', { name: /Повторить/ }))
        expect(reset).toHaveBeenCalled()
    })

    it('shows the error id so a user can quote it to support', () => {
        render(<RootError error={new Error('boom')} reset={jest.fn()} />)

        expect(screen.getByText(/[A-Z2-9]{4}-[A-Z2-9]{4}/)).toBeInTheDocument()
    })
})

describe('not found page', () => {
    it('offers navigation instead of a dead end', () => {
        render(<NotFound />)

        expect(screen.getByText('Страница не найдена')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'На главную' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Дневник питания' })).toBeInTheDocument()
    })
})
