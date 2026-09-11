import { ApiError } from '@/shared/errors/apiErrors'
import { logger } from '../logger'

/**
 * A failure reported from a browser and the server's own record of it have to
 * be the same event. That is only true if they carry the same identifier.
 */
describe('the server’s trace id reaches the client’s log', () => {
    it('an API error keeps the identifier the server answered with', () => {
        const error = new ApiError(500, {}, 'err-1', '4f2a9c1e7b3d5a6f8e0c2b4d6a8f0e1c')
        expect(error.traceId).toBe('4f2a9c1e7b3d5a6f8e0c2b4d6a8f0e1c')
    })

    it('the logger records it, so the two accounts can be lined up', () => {
        const entry = (logger as unknown as {
            createLogEntry: (level: unknown, message: string, context?: unknown, error?: Error) => { requestId?: string }
        })

        const error = new ApiError(500, {}, undefined, 'trace-from-the-server')
        const line = entry['createLogEntry'].call(logger, 'error', 'request failed', undefined, error)

        expect(line.requestId).toBe('trace-from-the-server')
    })

    it('leaves it out when there is none, rather than inventing one', () => {
        const entry = (logger as unknown as {
            createLogEntry: (level: unknown, message: string, context?: unknown, error?: Error) => { requestId?: string }
        })

        const line = entry['createLogEntry'].call(logger, 'error', 'something else', undefined, new Error('local'))

        expect(line.requestId).toBeUndefined()
    })
})
