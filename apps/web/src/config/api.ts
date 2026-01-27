/**
 * API configuration
 * Centralized configuration for API endpoints and settings
 */

export const API_CONFIG = {
    /**
     * Base URL for the Golang backend API
     */
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',

    /**
     * API version prefix
     */
    version: '/api/v1',

    /**
     * Request timeout in milliseconds
     */
    timeout: 30000, // 30 seconds

    /**
     * Endpoints
     */
    endpoints: {
        auth: {
            login: '/auth/login',
            register: '/auth/register',
            logout: '/auth/logout',
            me: '/auth/me',
        },
    },
} as const;

/**
 * Get full API URL for an endpoint
 */
export function getApiUrl(endpoint: string): string {
    return `${API_CONFIG.baseUrl}${API_CONFIG.version}${endpoint}`;
}
