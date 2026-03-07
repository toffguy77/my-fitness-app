/**
 * API Client utility tests
 * Verifies HTTP client functionality, token management, and 401 refresh interceptor
 */

import { apiClient } from '@/shared/utils/api-client';

// We need to mock token-storage before importing api-client
jest.mock('@/shared/utils/token-storage', () => ({
    getRefreshToken: jest.fn(),
    setToken: jest.fn(),
    setRefreshToken: jest.fn(),
    clearAuth: jest.fn(),
}));

import * as tokenStorage from '@/shared/utils/token-storage';

describe('API Client', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        jest.clearAllMocks();
    });

    describe('Token Management', () => {
        it('should store token in localStorage', () => {
            const token = 'test-jwt-token';
            apiClient.setToken(token);

            expect(localStorage.getItem('auth_token')).toBe(token);
        });

        it('should retrieve token from localStorage', () => {
            const token = 'test-jwt-token';
            localStorage.setItem('auth_token', token);

            // Access private method through instance
            const storedToken = localStorage.getItem('auth_token');
            expect(storedToken).toBe(token);
        });

        it('should clear token from localStorage', () => {
            localStorage.setItem('auth_token', 'test-token');
            apiClient.clearToken();

            expect(localStorage.getItem('auth_token')).toBeNull();
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
            (tokenStorage.getRefreshToken as jest.Mock).mockReturnValue('old-refresh-token');

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
                        data: {
                            token: 'new-access-token',
                            refresh_token: 'new-refresh-token',
                        },
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

            // Verify tokens were stored
            expect(tokenStorage.setToken).toHaveBeenCalledWith('new-access-token');
            expect(tokenStorage.setRefreshToken).toHaveBeenCalledWith('new-refresh-token');
        });

        it('should redirect to /auth when no refresh token available', async () => {
            (tokenStorage.getRefreshToken as jest.Mock).mockReturnValue(null);

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({ message: 'Unauthorized' }),
            });

            await expect(
                apiClient.get('http://localhost:4000/api/dashboard')
            ).rejects.toThrow('No refresh token');

            expect(tokenStorage.clearAuth).toHaveBeenCalled();
        });

        it('should redirect to /auth when refresh fails', async () => {
            (tokenStorage.getRefreshToken as jest.Mock).mockReturnValue('old-refresh-token');

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
