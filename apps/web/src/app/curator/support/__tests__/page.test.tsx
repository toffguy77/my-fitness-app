import { render, screen } from '@testing-library/react'
import CuratorSupportPage from '../page'

/**
 * Same reasoning as the leads page test: importing `SupportQueue` from
 * `@/features/admin` instead of `@/features/curator` would look identical
 * on screen while still calling the retired `/api/v1/admin/support/...`
 * paths underneath. This asserts the wiring, not just the pixels.
 */
jest.mock('@/features/curator/components/SupportQueue', () => ({
    SupportQueue: () => <div data-testid="curator-support-queue">очередь обращений куратора</div>,
}))

describe('CuratorSupportPage', () => {
    it('shows the support heading and the curator support queue', () => {
        render(<CuratorSupportPage />)

        expect(screen.getByRole('heading', { name: 'Обращения' })).toBeInTheDocument()
        expect(screen.getByTestId('curator-support-queue')).toBeInTheDocument()
    })
})
