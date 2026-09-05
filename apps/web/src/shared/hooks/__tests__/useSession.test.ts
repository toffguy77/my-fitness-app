/**
 * Getting the session back after a reload.
 *
 * The access token lives in memory and does not survive one; the refresh token
 * lives in a cookie script cannot read. So a freshly loaded page knows nothing
 * until it asks — and "still asking" is a state that has to be rendered as
 * itself, not as "signed out".
 */

import { renderHook, waitFor } from '@testing-library/react'

import { restoreSession, resetSessionRestore, useSession } from '../useSession'
import { apiClient } from '@/shared/utils/api-client'
import { clearToken, getToken, setToken } from '@/shared/utils/token-storage'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { refreshSession: jest.fn() },
}))

const refreshSession = apiClient.refreshSession as jest.Mock

beforeEach(() => {
    jest.clearAllMocks()
    clearToken()
    resetSessionRestore()
})

describe('restoreSession', () => {
    it('mints an access token from whatever the browser holds', async () => {
        refreshSession.mockResolvedValue('a-fresh-token')

        await expect(restoreSession()).resolves.toBe(true)
        expect(getToken()).toBe('a-fresh-token')
    })

    it('answers no rather than throwing when there is no session', async () => {
        // Most visitors to the sign-in page have none. That is an ordinary
        // answer here, not a failure.
        refreshSession.mockRejectedValue(new Error('No session (401)'))

        await expect(restoreSession()).resolves.toBe(false)
        expect(getToken()).toBeNull()
    })

    it('asks once however many components need the answer', async () => {
        refreshSession.mockResolvedValue('a-fresh-token')

        await Promise.all([restoreSession(), restoreSession(), restoreSession()])

        expect(refreshSession).toHaveBeenCalledTimes(1)
    })

    it('does not ask at all when this tab already has a token', async () => {
        setToken('an-existing-token')

        await expect(restoreSession()).resolves.toBe(true)
        expect(refreshSession).not.toHaveBeenCalled()
    })

    it('asks again after a later sign-in', async () => {
        refreshSession.mockRejectedValueOnce(new Error('No session'))
        await restoreSession()

        refreshSession.mockResolvedValueOnce('a-fresh-token')
        await expect(restoreSession()).resolves.toBe(true)

        expect(refreshSession).toHaveBeenCalledTimes(2)
    })
})

describe('useSession', () => {
    it('starts as restoring and settles on authenticated', async () => {
        refreshSession.mockResolvedValue('a-fresh-token')

        const { result } = renderHook(() => useSession())

        expect(result.current).toBe('restoring')
        await waitFor(() => expect(result.current).toBe('authenticated'))
    })

    it('settles on anonymous when there is no session', async () => {
        refreshSession.mockRejectedValue(new Error('No session'))

        const { result } = renderHook(() => useSession())

        await waitFor(() => expect(result.current).toBe('anonymous'))
    })

    it('follows a sign-out that happens elsewhere', async () => {
        refreshSession.mockResolvedValue('a-fresh-token')

        const { result } = renderHook(() => useSession())
        await waitFor(() => expect(result.current).toBe('authenticated'))

        clearToken()

        await waitFor(() => expect(result.current).toBe('anonymous'))
    })
})
