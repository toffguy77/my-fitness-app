import { apiClient } from '../api-client'
import { getToken } from '../token-storage'

/**
 * Which 401 means "your session ended" and which means "that credential is
 * wrong".
 *
 * Treating the second as the first signed people out of the settings screen
 * they were standing on, for mistyping their current password.
 */
describe('A 401 from a credential-checking endpoint', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
        localStorage.clear()
        apiClient.setToken('access-token')
    })

    afterEach(() => {
        global.fetch = originalFetch
        localStorage.clear()
    })

    function respondWith401Once() {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: false,
            status: 401,
            headers: new Headers(),
            json: async () => ({ status: 'error', code: 'invalid_credentials' }),
        })
        global.fetch = fetchMock as unknown as typeof fetch
        return fetchMock
    }

    it.each([
        '/api/v1/auth/change-password',
        '/api/v1/auth/oauth/link',
        '/api/v1/users/me/deletion',
    ])('is reported to the caller rather than refreshed: %s', async (url) => {
        const fetchMock = respondWith401Once()

        await expect(apiClient.post(url, {})).rejects.toMatchObject({ status: 401 })

        // One request: no refresh attempt, no retry, no sign-out.
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(getToken()).not.toBeNull()
    })

    // An ordinary endpoint answering 401 does mean the session ended, and the
    // client still tries to renew it before giving up.
    it('still tries to renew the session for an ordinary endpoint', async () => {
        localStorage.setItem('refresh_token', 'a-refresh-token')
        const fetchMock = respondWith401Once()

        await expect(apiClient.get('/api/v1/dashboard/tasks')).rejects.toBeDefined()

        const attempted = fetchMock.mock.calls.map((call) => String(call[0]))
        expect(attempted.some((url) => url.includes('/auth/refresh'))).toBe(true)
    })
})

/**
 * 204 from the refresh endpoint: the browser held nothing to exchange.
 *
 * The server answers it instead of 400 because every anonymous page load asks,
 * and a 400 put an error in every visitor's console. To the client it means
 * exactly what the 400 did — no session — and has to be read as that, not as
 * a success with an empty body.
 */
describe('A refresh answered with 204', () => {
    const originalFetch = global.fetch

    afterEach(() => {
        global.fetch = originalFetch
        apiClient.clearToken()
        localStorage.clear()
    })

    function noContent() {
        return {
            ok: true,
            status: 204,
            headers: new Headers(),
            json: async () => {
                throw new SyntaxError('Unexpected end of JSON input')
            },
        }
    }

    it('means no session when restoring one on page load', async () => {
        global.fetch = jest.fn().mockResolvedValue(noContent()) as unknown as typeof fetch

        await expect(apiClient.refreshSession()).rejects.toThrow('No session (204)')
        expect(getToken()).toBeNull()
    })

    it('ends the session after a 401 at once, without retrying', async () => {
        apiClient.setToken('expired-access-token')
        const fetchMock = jest.fn().mockImplementation(async (url: string) =>
            String(url).includes('/auth/refresh')
                ? noContent()
                : { ok: false, status: 401, headers: new Headers(), json: async () => ({}) }
        )
        global.fetch = fetchMock as unknown as typeof fetch

        await expect(apiClient.get('/api/v1/dashboard/tasks')).rejects.toThrow('Refresh rejected')

        const refreshes = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/auth/refresh'))
        expect(refreshes).toHaveLength(1)
        expect(getToken()).toBeNull()
    })

    it('gives the caller nothing rather than a parse error', async () => {
        global.fetch = jest.fn().mockResolvedValue(noContent()) as unknown as typeof fetch

        await expect(apiClient.post('/api/v1/auth/refresh', {})).resolves.toBeUndefined()
    })
})
