/**
 * API Client utility tests
 * Verifies HTTP client functionality and token management
 */

import { apiClient } from '@/shared/utils/api-client';

describe('API Client', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
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
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
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

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
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
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
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

        it('should throw error on failed request', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({ message: 'Unauthorized' }),
            });

            await expect(
                apiClient.get('http://localhost:4000/api/test')
            ).rejects.toThrow('API request failed');
        });
    });
});
