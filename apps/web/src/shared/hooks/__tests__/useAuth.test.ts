import { renderHook, act, waitFor } from '@testing-library/react'
import { useAuth } from '../useAuth'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
    },
}))

import { apiClient } from '@/shared/utils/api-client'

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

// Mock localStorage
const mockLocalStorage = (() => {
    let store: Record<string, string> = {}
    return {
        getItem: jest.fn((key: string) => store[key] ?? null),
        setItem: jest.fn((key: string, value: string) => {
            store[key] = value
        }),
        removeItem: jest.fn((key: string) => {
            delete store[key]
        }),
        clear: jest.fn(() => {
            store = {}
        }),
    }
})()

Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
})

describe('useAuth', () => {
    const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
    }

    beforeEach(() => {
        jest.clearAllMocks()
        mockLocalStorage.clear()
    })

    describe('loadUser on mount', () => {
        it('should set isLoading to false and not fetch when no token exists', async () => {
            mockLocalStorage.getItem.mockReturnValue(null as unknown as string)

            const { result } = renderHook(() => useAuth())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            expect(result.current.user).toBeNull()
            expect(mockApiClient.get).not.toHaveBeenCalled()
        })

        it('should load user when a valid token exists', async () => {
            mockLocalStorage.getItem.mockReturnValue('valid-token')
            mockApiClient.get.mockResolvedValueOnce({ user: mockUser })

            const { result } = renderHook(() => useAuth())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            expect(result.current.user).toEqual(mockUser)
            expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/auth/me')
        })

        it('should not set user when API returns error', async () => {
            mockLocalStorage.getItem.mockReturnValue('expired-token')
            mockApiClient.get.mockRejectedValueOnce(new Error('API request failed'))

            const { result } = renderHook(() => useAuth())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            expect(result.current.user).toBeNull()
        })

        it('should handle fetch errors gracefully', async () => {
            mockLocalStorage.getItem.mockReturnValue('some-token')
            mockApiClient.get.mockRejectedValueOnce(new Error('Network failure'))

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

            const { result } = renderHook(() => useAuth())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            expect(result.current.user).toBeNull()
            expect(consoleSpy).toHaveBeenCalledWith(
                'Failed to load user:',
                expect.any(Error)
            )

            consoleSpy.mockRestore()
        })
    })

    describe('login', () => {
        beforeEach(() => {
            // Prevent loadUser from running on mount
            mockLocalStorage.getItem.mockReturnValue(null as unknown as string)
        })

        it('should log in successfully and store token', async () => {
            mockApiClient.post.mockResolvedValueOnce({ user: mockUser, token: 'new-token' })

            const { result } = renderHook(() => useAuth())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            let loginResult: { success: boolean; error?: string }

            await act(async () => {
                loginResult = await result.current.login('test@example.com', 'password123')
            })

            expect(loginResult!.success).toBe(true)
            expect(result.current.user).toEqual(mockUser)
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token', 'new-token')
            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/api/v1/auth/login',
                { email: 'test@example.com', password: 'password123' }
            )
        })

        it('should return error when login fails', async () => {
            mockApiClient.post.mockRejectedValueOnce(new Error('Invalid credentials'))

            const { result } = renderHook(() => useAuth())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            let loginResult: { success: boolean; error?: string }

            await act(async () => {
                loginResult = await result.current.login('test@example.com', 'wrong-pass')
            })

            expect(loginResult!.success).toBe(false)
            expect(loginResult!.error).toBe('Invalid credentials')
            expect(result.current.user).toBeNull()
            expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
        })

        it('should return network error when fetch throws', async () => {
            mockApiClient.post.mockRejectedValueOnce(new TypeError('Connection refused'))

            const { result } = renderHook(() => useAuth())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            let loginResult: { success: boolean; error?: string }

            await act(async () => {
                loginResult = await result.current.login('test@example.com', 'pass')
            })

            expect(loginResult!.success).toBe(false)
            expect(loginResult!.error).toBe('Connection refused')
        })
    })

    describe('logout', () => {
        it('should clear auth_token and user on logout', async () => {
            // Start with a logged-in user
            mockLocalStorage.getItem.mockReturnValue('valid-token')
            mockApiClient.get.mockResolvedValueOnce({ user: mockUser })

            const { result } = renderHook(() => useAuth())

            await waitFor(() => {
                expect(result.current.user).toEqual(mockUser)
            })

            await act(async () => {
                await result.current.logout()
            })

            expect(result.current.user).toBeNull()
            expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('auth_token')
        })

        it('should work even when no user is logged in', async () => {
            mockLocalStorage.getItem.mockReturnValue(null as unknown as string)

            const { result } = renderHook(() => useAuth())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            await act(async () => {
                await result.current.logout()
            })

            expect(result.current.user).toBeNull()
            expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('auth_token')
        })
    })

    describe('return value shape', () => {
        it('should return the expected AuthState interface', async () => {
            mockLocalStorage.getItem.mockReturnValue(null as unknown as string)

            const { result } = renderHook(() => useAuth())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            expect(result.current).toEqual({
                user: null,
                isLoading: false,
                login: expect.any(Function),
                logout: expect.any(Function),
            })
        })
    })
})
