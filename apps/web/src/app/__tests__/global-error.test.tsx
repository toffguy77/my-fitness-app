import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GlobalError from '../global-error'
import { reportError } from '@/shared/errors/reportError'

jest.mock('@/shared/errors/reportError', () => ({
    reportError: jest.fn(() => 'ABCD-2345'),
}))

// global-error replaces the whole document, so it renders its own <html>.
// Rendering that inside jsdom's body produces a validateDOMNesting warning we
// deliberately silence; the behaviour under test is the reporting and the reset.
describe('GlobalError', () => {
    let consoleError: jest.SpyInstance

    beforeEach(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
        jest.clearAllMocks()
    })

    afterEach(() => consoleError.mockRestore())

    it('reports the failure and offers a retry', async () => {
        const reset = jest.fn()
        const error = Object.assign(new Error('root layout failed'), { digest: 'xyz' })

        render(<GlobalError error={error} reset={reset} />)

        expect(reportError).toHaveBeenCalledWith(
            error,
            expect.objectContaining({ source: 'global-error', digest: 'xyz' }),
        )
        expect(screen.getByText(/Приложение не смогло загрузиться/)).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: /Повторить/ }))
        expect(reset).toHaveBeenCalled()
    })

    // The router is part of what just failed, so navigation must be a plain
    // full-page load rather than a client-side transition.
    it('navigates home with a full page load', () => {
        render(<GlobalError error={new Error('x')} reset={jest.fn()} />)

        expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/')
    })
})
