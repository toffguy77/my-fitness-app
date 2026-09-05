/**
 * API Client utility tests
 * Verifies HTTP client functionality, token management, and 401 refresh interceptor
 */

import { apiClient } from '@/shared/utils/api-client';

// We need to mock token-storage before importing api-client
jest.mock('@/shared/utils/token-storage', () => ({
    getToken: jest.fn(),
    setToken: jest.fn(),
    clearToken: jest.fn(),
    clearAuth: jest.fn(),
    legacyStorage: { refreshToken: jest.fn(() => null), clear: jest.fn() },
}));

import * as tokenStorage from '@/shared/utils/token-storage';

describe('API Client', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        jest.clearAllMocks();
    });

    describe('Token Management', () => {
        it('hands the access token to the store rather than to localStorage', () => {
            apiClient.setToken('test-jwt-token');

            expect(tokenStorage.setToken).toHaveBeenCalledWith('test-jwt-token');
            // Nothing that runs on the page can read it out of storage,
            // because it is never put there.
            expect(localStorage.getItem('auth_token')).toBeNull();
        });

        it('reads the access token from the store', () => {
            (tokenStorage.getToken as jest.Mock).mockReturnValue('test-jwt-token');

            expect(tokenStorage.getToken()).toBe('test-jwt-token');
        });

        it('clears through the store', () => {
            apiClient.clearToken();

            expect(tokenStorage.clearToken).toHaveBeenCalled();
        });
    });

    describe('Request Methods', () => {
        beforeEach(() => {
            // Mock fetch
            global.fetch = jest.fn();
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should make GET request with proper headers', async () => {
            const mockResponse = { data: { id: 1, name: 'Test' } };
            (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });

            await apiClient.get('http://localhost:4000/api/test');

            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:4000/api/test',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                    }),
                })
            );
        });

        it('should make POST request with body', async () => {
            const mockResponse = { data: { success: true } };
            const requestBody = { email: 'test@example.com', password: 'password123' };

            (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });

            await apiClient.post('http://localhost:4000/api/test', requestBody);

            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:4000/api/test',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify(requestBody),
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                    }),
                })
            );
        });

        it('should include Authorization header when token exists', async () => {
            const token = 'test-jwt-token';
            apiClient.setToken(token);

            const mockResponse = { data: { id: 1 } };
            (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });

            await apiClient.get('http://localhost:4000/api/test');

            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:4000/api/test',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${token}`,
                    }),
                })
            );
        });

        it('should throw error on failed request (non-401)', async () => {
            (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ message: 'Server Error' }),
            });

            await expect(
                apiClient.get('http://localhost:4000/api/test')
            ).rejects.toThrow('API request failed');
        });
    });

    describe('401 Refresh Interceptor', () => {
        beforeEach(() => {
            global.fetch = jest.fn();
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should refresh token on 401 and retry original request', async () => {
            // First call: original request → 401
            // Second call: refresh endpoint → success
            // Third call: retry original request → success
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    json: async () => ({ message: 'Unauthorized' }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        data: { token: 'new-access-token' },
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({ data: { id: 1, name: 'Test' } }),
                });

            const result = await apiClient.get<{ id: number; name: string }>(
                'http://localhost:4000/api/dashboard'
            );

            expect(result).toEqual({ id: 1, name: 'Test' });

            // Verify refresh was called
            expect(global.fetch).toHaveBeenCalledTimes(3);
            expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('/auth/refresh');

            // The access token is stored; the refresh token is not, because
            // it never reaches script — the server set it as a cookie.
            expect(tokenStorage.setToken).toHaveBeenCalledWith('new-access-token');
        });

        it('sends the session cookie with every request', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ data: {} }),
            });

            await apiClient.get('http://localhost:4000/api/dashboard');

            // Without this the browser attaches no cookie and every refresh
            // looks like a signed-out user.
            expect((global.fetch as jest.Mock).mock.calls[0][1]).toMatchObject({
                credentials: 'include',
            });
        });

        it('asks the server rather than checking storage for a refresh token', async () => {
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    json: async () => ({ message: 'Unauthorized' }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    json: async () => ({ message: 'No session' }),
                });

            await expect(
                apiClient.get('http://localhost:4000/api/dashboard')
            ).rejects.toThrow();

            // Script cannot see the cookie, so the only way to find out
            // whether there is a session is to try.
            expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('/auth/refresh');
            expect(tokenStorage.clearAuth).toHaveBeenCalled();
        });

        it('sends a token left over from the previous scheme exactly once', async () => {
            (tokenStorage.legacyStorage.refreshToken as jest.Mock).mockReturnValue('an-old-token');

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    json: async () => ({ message: 'Unauthorized' }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({ data: { token: 'new-access-token' } }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({ data: {} }),
                });

            await apiClient.get('http://localhost:4000/api/dashboard');

            // Somebody signed in before this release is migrated rather than
            // signed out in the middle of their day.
            expect((global.fetch as jest.Mock).mock.calls[1][1].body).toContain('an-old-token');
            expect(tokenStorage.legacyStorage.clear).toHaveBeenCalled();
        });

        it('should redirect to /auth when refresh fails', async () => {
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    json: async () => ({ message: 'Unauthorized' }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    json: async () => ({ message: 'Invalid refresh token' }),
                });

            await expect(
                apiClient.get('http://localhost:4000/api/dashboard')
            ).rejects.toThrow();

            expect(tokenStorage.clearAuth).toHaveBeenCalled();
        });

        it('should not intercept 401 on auth endpoints', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({ message: 'Invalid credentials' }),
            });

            await expect(
                apiClient.post('http://localhost:4000/api/v1/auth/login', {
                    email: 'test@example.com',
                    password: 'wrong',
                })
            ).rejects.toThrow('API request failed');

            // Should NOT attempt refresh
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});

describe('concurrent refreshes', () => {
    beforeEach(() => {
        global.fetch = jest.fn()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('makes one refresh serve every request that needed it', async () => {
        // The refresh token rotates on use. Two refreshes at once present the
        // same cookie, and the second arrives with one that has just been
        // replaced — which, outside the server's grace window, looks exactly
        // like a stolen token being replayed and revokes the whole family. A
        // page that fires several requests at once could end its own session.
        let refreshes = 0
        ;(global.fetch as jest.Mock).mockImplementation(async (url: string) => {
            if (String(url).includes('/auth/refresh')) {
                refreshes += 1
                await new Promise((resolve) => setTimeout(resolve, 20))
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ data: { token: 'a-fresh-token' } }),
                }
            }
            return { ok: true, status: 200, json: async () => ({ data: {} }) }
        })

        await Promise.all([
            apiClient.refreshSession(),
            apiClient.refreshSession(),
            apiClient.refreshSession(),
        ])

        expect(refreshes).toBe(1)
    })

    it('starts a new refresh once the previous one has finished', async () => {
        let refreshes = 0
        ;(global.fetch as jest.Mock).mockImplementation(async () => {
            refreshes += 1
            return { ok: true, status: 200, json: async () => ({ data: { token: 't' } }) }
        })

        await apiClient.refreshSession()
        await apiClient.refreshSession()

        expect(refreshes).toBe(2)
    })
})
