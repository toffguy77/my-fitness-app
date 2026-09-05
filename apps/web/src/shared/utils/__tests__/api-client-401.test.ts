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
