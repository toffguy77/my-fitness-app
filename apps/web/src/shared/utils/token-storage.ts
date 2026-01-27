/**
 * Token storage utility for JWT authentication
 * Provides secure token management using localStorage
 */

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user';

/**
 * Store JWT token in localStorage
 */
export function setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Retrieve JWT token from localStorage
 */
export function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Remove JWT token from localStorage
 */
export function clearToken(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
}

/**
 * Check if user is authenticated (has valid token)
 */
export function isAuthenticated(): boolean {
    return getToken() !== null;
}

/**
 * Store user data in localStorage
 */
export function setUser(user: any): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Retrieve user data from localStorage
 */
export function getUser(): any | null {
    if (typeof window === 'undefined') return null;
    const userData = localStorage.getItem(USER_KEY);
    if (!userData) return null;

    try {
        return JSON.parse(userData);
    } catch {
        return null;
    }
}

/**
 * Remove user data from localStorage
 */
export function clearUser(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(USER_KEY);
}

/**
 * Clear all authentication data
 */
export function clearAuth(): void {
    clearToken();
    clearUser();
}
