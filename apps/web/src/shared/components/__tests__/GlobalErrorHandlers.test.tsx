import { render } from '@testing-library/react'
import { GlobalErrorHandlers } from '../GlobalErrorHandlers'
import { reportError, resetErrorReporting } from '@/shared/errors/reportError'

jest.mock('@/shared/errors/reportError', () => {
    const actual = jest.requireActual('@/shared/errors/reportError')
    return { ...actual, reportError: jest.fn(actual.reportError) }
})

describe('GlobalErrorHandlers', () => {
    beforeEach(() => {
        resetErrorReporting()
        jest.clearAllMocks()
    })

    // These errors never reach React, so without a global handler they were
    // visible only to the user who hit them.
    it('reports an uncaught error', () => {
        render(<GlobalErrorHandlers />)

        window.dispatchEvent(
            new ErrorEvent('error', { error: new Error('uncaught'), message: 'uncaught' }),
        )

        expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'uncaught' }),
            expect.objectContaining({ source: 'window.onerror' }),
        )
    })

    it('reports an unhandled promise rejection', () => {
        render(<GlobalErrorHandlers />)

        const event = new Event('unhandledrejection') as PromiseRejectionEvent
        Object.defineProperty(event, 'reason', { value: new Error('rejected') })
        window.dispatchEvent(event)

        expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'rejected' }),
            expect.objectContaining({ source: 'unhandledrejection' }),
        )
    })

    it('stops listening after unmount', () => {
        const { unmount } = render(<GlobalErrorHandlers />)
        unmount()

        // jsdom re-throws an "error" event that nothing handles, so swallow it
        // here; the point of the test is that our handler is gone.
        const swallow = (event: Event) => event.preventDefault()
        window.addEventListener('error', swallow)
        window.dispatchEvent(
            new ErrorEvent('error', { error: new Error('late'), message: 'late', cancelable: true }),
        )
        window.removeEventListener('error', swallow)

        expect(reportError).not.toHaveBeenCalled()
    })
})
