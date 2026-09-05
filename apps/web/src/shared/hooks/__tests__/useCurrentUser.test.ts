import { renderHook, waitFor } from '@testing-library/react'

import { useCurrentUser, fetchCurrentUser, resetCurrentUser, readCachedUser } from '../useCurrentUser'
import { apiClient } from '@/shared/utils/api-client'
import { setUser, clearToken, setToken } from '@/shared/utils/token-storage'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn() },
}))

const get = apiClient.get as jest.Mock

beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    resetCurrentUser()
    clearToken()
})

const curator = { id: '2', email: 'c@b.c', full_name: 'Curator', role: 'coordinator' }

describe('who is signed in', () => {
    it('asks the server, and caches the answer', async () => {
        get.mockResolvedValue({ user: curator })

        const { result } = renderHook(() => useCurrentUser())

        await waitFor(() => expect(result.current.state).toBe('ready'))
        expect(result.current.user).toEqual(curator)
        expect(readCachedUser()).toEqual(curator)
    })

    it('paints from the cache before the server answers', async () => {
        setUser(curator)
        get.mockReturnValue(new Promise(() => {}))

        const { result } = renderHook(() => useCurrentUser())

        // No blank frame for somebody whose profile we already know.
        expect(result.current.user).toEqual(curator)
        expect(result.current.state).toBe('ready')
    })

    it('is not fooled by a cold cache into reporting nobody', async () => {
        // A session established by cookie alone has no cache. It is still a
        // session, and the role still has to come from somewhere.
        get.mockResolvedValue({ user: curator })

        const { result } = renderHook(() => useCurrentUser())

        expect(result.current.state).toBe('loading')
        await waitFor(() => expect(result.current.user?.role).toBe('coordinator'))
    })

    it('asks once however many components need the answer', async () => {
        get.mockResolvedValue({ user: curator })

        await Promise.all([fetchCurrentUser(), fetchCurrentUser(), fetchCurrentUser()])

        expect(get).toHaveBeenCalledTimes(1)
    })

    it('reports nobody when the server says so and nothing is cached', async () => {
        get.mockRejectedValue(new Error('401'))

        const { result } = renderHook(() => useCurrentUser())

        await waitFor(() => expect(result.current.state).toBe('anonymous'))
    })

    it('keeps showing a cached profile when one request fails', async () => {
        // Blanking the screen over a single failed request would be worse than
        // a slightly stale name; a session that has genuinely ended is signed
        // out by the api client.
        setUser(curator)
        get.mockRejectedValue(new Error('network'))

        const { result } = renderHook(() => useCurrentUser())

        await waitFor(() => expect(result.current.state).toBe('ready'))
        expect(result.current.user).toEqual(curator)
    })

    it('follows a sign-out', async () => {
        get.mockResolvedValue({ user: curator })
        setToken('a-token')

        const { result } = renderHook(() => useCurrentUser())
        await waitFor(() => expect(result.current.state).toBe('ready'))

        clearToken()

        await waitFor(() => expect(result.current.state).toBe('anonymous'))
        expect(result.current.user).toBeNull()
    })

    it('treats a corrupt cache as no cache', () => {
        localStorage.setItem('user', 'not json')

        expect(readCachedUser()).toBeNull()
    })
})
