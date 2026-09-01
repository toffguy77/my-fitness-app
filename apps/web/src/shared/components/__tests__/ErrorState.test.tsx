import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorState } from '../ErrorState'

describe('ErrorState', () => {
    it('shows the error id so support can find the log entry', () => {
        render(<ErrorState errorId="ABCD-2345" />)

        expect(screen.getByText('ABCD-2345')).toBeInTheDocument()
    })

    it('retries through the supplied handler', async () => {
        const onRetry = jest.fn()
        render(<ErrorState onRetry={onRetry} />)

        await userEvent.click(screen.getByRole('button', { name: /Повторить/ }))

        expect(onRetry).toHaveBeenCalled()
    })

    it('is announced to assistive technology', () => {
        render(<ErrorState />)

        expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // An inline failure belongs to one widget; offering "go home" there would
    // suggest the whole page is broken.
    it('omits the home link in the inline variant', () => {
        render(<ErrorState variant="inline" showHomeLink={false} />)

        expect(screen.queryByText('На главную')).not.toBeInTheDocument()
    })
})
