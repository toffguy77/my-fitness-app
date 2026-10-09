import { apiClient, forgetReadsInFlight } from '../api-client'

/**
 * Identical reads in flight at the same moment share one request.
 *
 * A page assembles itself from independent components, and each used to ask
 * for itself: the same weekly plan or unread counter went out two to four
 * times on every load.
 */
/** Lets the client reach fetch: the token is resolved asynchronously. */
async function flush() {
    for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('Shared reads', () => {
    const originalFetch = global.fetch
    let resolvers: Array<(value: unknown) => void>

    beforeEach(() => {
        resolvers = []
        apiClient.setToken('token')
        global.fetch = jest.fn(
            () =>
                new Promise((resolve) => {
                    resolvers.push((body) =>
                        resolve({ ok: true, status: 200, headers: new Headers(), json: async () => ({ data: body }) }),
                    )
                }),
        ) as unknown as typeof fetch
    })

    afterEach(() => {
        global.fetch = originalFetch
        forgetReadsInFlight()
        jest.useRealTimers()
    })

    it('three components asking at once cause one request, and each gets its own copy', async () => {
        const reads = [
            apiClient.get<{ items: number[] }>('/api/v1/dashboard/tasks'),
            apiClient.get<{ items: number[] }>('/api/v1/dashboard/tasks'),
            apiClient.get<{ items: number[] }>('/api/v1/dashboard/tasks'),
        ]
        await flush()
        expect(global.fetch).toHaveBeenCalledTimes(1)

        resolvers[0]({ items: [1, 2] })
        const [a, b, c] = await Promise.all(reads)

        expect(a).toEqual({ items: [1, 2] })
        expect(b).toEqual(a)
        a.items.push(3)
        expect(b.items).toEqual([1, 2])
        expect(c.items).toEqual([1, 2])
    })

    it('a read after the first one finished is a new request', async () => {
        const first = apiClient.get('/api/v1/dashboard/tasks')
        await flush()
        resolvers[0]({ n: 1 })
        await first

        const second = apiClient.get('/api/v1/dashboard/tasks')
        await flush()
        expect(global.fetch).toHaveBeenCalledTimes(2)
        resolvers[1]({ n: 2 })
        await expect(second).resolves.toEqual({ n: 2 })
    })

    it('different addresses are not shared', async () => {
        void apiClient.get('/api/v1/dashboard/tasks')
        void apiClient.get('/api/v1/dashboard/tasks?week=3')
        await flush()
        expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('a read with options of its own is private', async () => {
        void apiClient.get('/api/v1/dashboard/tasks')
        void apiClient.get('/api/v1/dashboard/tasks', { headers: { 'X-Trace': '1' } })
        await flush()
        expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('writes are never shared', async () => {
        void apiClient.post('/api/v1/dashboard/tasks/1/complete', {})
        void apiClient.post('/api/v1/dashboard/tasks/1/complete', {})
        await flush()
        expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('a read that has been hanging for a while is not joined', async () => {
        jest.useFakeTimers({ now: new Date('2026-10-07T10:00:00Z') })
        void apiClient.get('/api/v1/dashboard/tasks')
        jest.setSystemTime(new Date('2026-10-07T10:00:06Z'))
        void apiClient.get('/api/v1/dashboard/tasks')
        await flush()
        expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('a failure reaches every reader', async () => {
        global.fetch = jest.fn(async () => ({
            ok: false,
            status: 500,
            headers: new Headers(),
            json: async () => ({ error: { message: 'boom' } }),
        })) as unknown as typeof fetch

        const reads = [apiClient.get('/api/v1/dashboard/tasks'), apiClient.get('/api/v1/dashboard/tasks')]
        const results = await Promise.allSettled(reads)
        expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    describe('getRecent', () => {
        it('a second part of the screen a moment later reuses the answer', async () => {
            const first = apiClient.getRecent<{ n: number }>('/api/v1/dashboard/progress?weeks=4', 15000)
            await flush()
            resolvers[0]({ n: 1 })
            await expect(first).resolves.toEqual({ n: 1 })

            const second = apiClient.getRecent<{ n: number }>('/api/v1/dashboard/progress?weeks=4', 15000)
            await expect(second).resolves.toEqual({ n: 1 })
            expect(global.fetch).toHaveBeenCalledTimes(1)
        })

        it('an older answer, or one forgotten after a write, is asked for again', async () => {
            jest.useFakeTimers({ now: new Date('2026-10-07T10:00:00Z'), doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] })
            const url = '/api/v1/dashboard/progress?weeks=4'
            const first = apiClient.getRecent(url, 15000)
            await flush()
            resolvers[0]({ n: 1 })
            await first

            jest.setSystemTime(new Date('2026-10-07T10:00:16Z'))
            void apiClient.getRecent(url, 15000)
            await flush()
            expect(global.fetch).toHaveBeenCalledTimes(2)
            resolvers[1]({ n: 2 })
            await flush()

            apiClient.forgetRecent(url)
            void apiClient.getRecent(url, 15000)
            await flush()
            expect(global.fetch).toHaveBeenCalledTimes(3)
        })

        it('a failed answer is not kept', async () => {
            global.fetch = jest.fn(async () => ({ ok: false, status: 502, headers: new Headers(), json: async () => ({}) })) as unknown as typeof fetch
            await expect(apiClient.getRecent('/api/v1/dashboard/progress?weeks=4', 15000)).rejects.toBeDefined()
            await expect(apiClient.getRecent('/api/v1/dashboard/progress?weeks=4', 15000)).rejects.toBeDefined()
            expect(global.fetch).toHaveBeenCalledTimes(2)
        })
    })
})
