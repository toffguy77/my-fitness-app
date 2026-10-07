import { apiClient } from '../api-client'
import { clearAuth, getToken, setUser } from '../token-storage'

/**
 * The first requests of a page load.
 *
 * The access token lives in memory, so a fresh page has none. Requests sent
 * before the silent refresh finished used to go out bare, come back 401 and
 * refresh a second time — a 401 in the console on every signed-in page and two
 * refreshes racing over one rotating cookie.
 */
describe('Requests sent before the page has a token', () => {
    const originalFetch = global.fetch

    type Call = { url: string; auth: string | null }
    let calls: Call[]

    function serve(refreshStatus = 200) {
        calls = []
        global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            const headers = new Headers(init?.headers)
            calls.push({ url, auth: headers.get('Authorization') })
            if (url.includes('/auth/refresh')) {
                return refreshStatus === 200
                    ? { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { token: 'fresh' } }) }
                    : { ok: false, status: refreshStatus, headers: new Headers(), json: async () => ({}) }
            }
            const authorised = headers.get('Authorization') === 'Bearer fresh'
            return authorised
                ? { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { ok: true } }) }
                : { ok: false, status: 401, headers: new Headers(), json: async () => ({}) }
        }) as unknown as typeof fetch
    }

    beforeEach(() => {
        localStorage.clear()
        clearAuth()
    })

    afterEach(() => {
        global.fetch = originalFetch
        clearAuth()
        localStorage.clear()
    })

    it('a tab with a signed-in profile mints a token first — no bare request, no 401', async () => {
        setUser({ id: '1', email: 'c@b.c', role: 'client' })
        serve()

        await expect(apiClient.get('/api/v1/users/profile')).resolves.toEqual({ ok: true })

        expect(calls.map((c) => c.url.replace(/^.*\/api\/v1/, ''))).toEqual(['/auth/refresh', '/users/profile'])
        expect(calls[1].auth).toBe('Bearer fresh')
        expect(getToken()).toBe('fresh')
    })

    it('requests fired together share one refresh', async () => {
        setUser({ id: '1', email: 'c@b.c', role: 'client' })
        serve()

        await Promise.all([
            apiClient.get('/api/v1/users/profile'),
            apiClient.get('/api/v1/dashboard/tasks'),
            apiClient.get('/api/v1/notifications'),
        ])

        expect(calls.filter((c) => c.url.includes('/auth/refresh'))).toHaveLength(1)
        expect(calls.filter((c) => !c.url.includes('/auth/refresh')).every((c) => c.auth === 'Bearer fresh')).toBe(true)
    })

    it('a request joins the silent refresh already under way', async () => {
        serve()
        const silent = apiClient.refreshSession()

        await apiClient.get('/api/v1/users/profile')
        await silent

        expect(calls.filter((c) => c.url.includes('/auth/refresh'))).toHaveLength(1)
        expect(calls.find((c) => c.url.includes('/users/profile'))?.auth).toBe('Bearer fresh')
    })

    it('a guest — no cached profile, no refresh under way — pays nothing extra', async () => {
        serve()
        global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(input), auth: new Headers(init?.headers).get('Authorization') })
            return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: [] }) }
        }) as unknown as typeof fetch

        await apiClient.get('/api/v1/content/feed')

        expect(calls).toHaveLength(1)
        expect(calls[0].auth).toBeNull()
    })

    it('a token already in memory is used as is', async () => {
        apiClient.setToken('fresh')
        setUser({ id: '1', email: 'c@b.c', role: 'client' })
        serve()

        await apiClient.get('/api/v1/users/profile')

        expect(calls).toHaveLength(1)
        expect(calls[0].auth).toBe('Bearer fresh')
    })
})
