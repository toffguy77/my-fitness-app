/**
 * Token storage utility tests
 * Verifies token and user data management in localStorage
 */

import {
    setToken,
    getToken,
    clearToken,
    isAuthenticated,
    setUser,
    getUser,
    clearUser,
    clearAuth,
} from '@/shared/utils/token-storage';

describe('Token Storage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('Token Management', () => {
        it('should store token', () => {
            const token = 'test-jwt-token';
            setToken(token);

            expect(localStorage.getItem('auth_token')).toBe(token);
        });

        it('should retrieve token', () => {
            const token = 'test-jwt-token';
            localStorage.setItem('auth_token', token);

            expect(getToken()).toBe(token);
        });

        it('should return null when no token exists', () => {
            expect(getToken()).toBeNull();
        });

        it('should clear token', () => {
            localStorage.setItem('auth_token', 'test-token');
            clearToken();

            expect(getToken()).toBeNull();
        });

        it('should check authentication status', () => {
            expect(isAuthenticated()).toBe(false);

            setToken('test-token');
            expect(isAuthenticated()).toBe(true);

            clearToken();
            expect(isAuthenticated()).toBe(false);
        });
    });

    describe('User Data Management', () => {
        it('should store user data', () => {
            const user = {
                id: '123',
                email: 'test@example.com',
                role: 'client',
            };

            setUser(user);

            const stored = localStorage.getItem('user');
            expect(stored).toBe(JSON.stringify(user));
        });

        it('should retrieve user data', () => {
            const user = {
                id: '123',
                email: 'test@example.com',
                role: 'client',
            };

            localStorage.setItem('user', JSON.stringify(user));

            expect(getUser()).toEqual(user);
        });

        it('should return null when no user data exists', () => {
            expect(getUser()).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            localStorage.setItem('user', 'invalid-json');

            expect(getUser()).toBeNull();
        });

        it('should clear user data', () => {
            const user = { id: '123', email: 'test@example.com' };
            setUser(user);

            clearUser();

            expect(getUser()).toBeNull();
        });
    });

    describe('Clear All Auth Data', () => {
        it('should clear both token and user data', () => {
            setToken('test-token');
            setUser({ id: '123', email: 'test@example.com' });

            clearAuth();

            expect(getToken()).toBeNull();
            expect(getUser()).toBeNull();
        });
    });
});
