import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../useAuth'
import { server } from '@/__mocks__/server'

describe('useAuth', () => {
    beforeAll(() => server.listen())
    afterEach(() => server.resetHandlers())
    afterAll(() => server.close())

    it('initializes with loading state', () => {
        const { result } = renderHook(() => useAuth())

        expect(result.current.isLoading).toBe(true)
        expect(result.current.user).toBeNull()
    })

    it('loads user data on mount', async () => {
        const { result } = renderHook(() => useAuth())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.user).toEqual({
            id: '1',
            email: 'test@example.com',
            name: 'Test User',
            role: 'client',
        })
    })

    it('handles login successfully', async () => {
        const { result } = renderHook(() => useAuth())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        const loginResult = await result.current.login('test@example.com', 'password')

        expect(loginResult.success).toBe(true)
        expect(result.current.user).toBeTruthy()
    })

    it('handles login failure', async () => {
        const { result } = renderHook(() => useAuth())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        const loginResult = await result.current.login('wrong@example.com', 'wrong')

        expect(loginResult.success).toBe(false)
        expect(loginResult.error).toBeTruthy()
    })

    it('handles logout', async () => {
        const { result } = renderHook(() => useAuth())

        await waitFor(() => {
            expect(result.current.user).toBeTruthy()
        })

        await result.current.logout()

        expect(result.current.user).toBeNull()
    })
})
