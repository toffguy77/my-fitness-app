import { logger } from '@/shared/utils/logger'
import { reportError, resetErrorReporting } from '../reportError'

jest.mock('@/shared/utils/logger', () => ({
    logger: { error: jest.fn() },
}))

describe('reportError', () => {
    beforeEach(() => {
        resetErrorReporting()
        jest.clearAllMocks()
    })

    it('sends the error with an id, path and source', () => {
        const errorId = reportError(new Error('boom'), { source: 'error-boundary' })

        expect(errorId).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
        expect(logger.error).toHaveBeenCalledWith(
            'boom',
            expect.any(Error),
            expect.objectContaining({ errorId, source: 'error-boundary', path: expect.any(String) }),
        )
    })

    // A component throwing on every render would otherwise flood our own log
    // endpoint — a self-inflicted denial of service.
    it('throttles repeats of the same error', () => {
        const error = new Error('repeats')
        error.stack = 'Error: repeats\n    at sameFrame (file.ts:1:1)'

        for (let i = 0; i < 10; i++) {
            reportError(error, { source: 'window.onerror' })
        }

        expect(logger.error).toHaveBeenCalledTimes(3)
    })

    it('reports distinct errors independently', () => {
        reportError(new Error('first'), { source: 'a' })
        reportError(new Error('second'), { source: 'b' })

        expect(logger.error).toHaveBeenCalledTimes(2)
    })

    // Reporting must never be the reason a page fails to render.
    it('returns an id even when the logger throws', () => {
        ;(logger.error as jest.Mock).mockImplementationOnce(() => {
            throw new Error('logger is down')
        })

        expect(() => reportError(new Error('x'), { source: 'a' })).not.toThrow()
    })
})
