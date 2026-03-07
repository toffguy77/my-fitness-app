/**
 * HTTP API client utility with fetch wrapper
 * Provides centralized request handling with authentication and error management
 * Includes automatic token refresh on 401 responses
 */

import { getRefreshToken, setToken, setRefreshToken, clearAuth } from './token-storage';

interface RequestOptions extends RequestInit {
    headers?: Record<string, string>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

type RefreshSubscriber = (token: string) => void;

let isRefreshing = false;
let refreshSubscribers: RefreshSubscriber[] = [];

function onTokenRefreshed(newToken: string) {
    refreshSubscribers.forEach(cb => cb(newToken));
    refreshSubscribers = [];
}

function addRefreshSubscriber(cb: RefreshSubscriber) {
    refreshSubscribers.push(cb);
}

class ApiClient {
    /**
     * Make an HTTP request with automatic token injection and error handling
     */
    private async request<T>(url: string, options: RequestOptions = {}): Promise<T> {
        const token = this.getToken();
        const requestId = crypto.randomUUID();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Request-Id': requestId,
            'X-Client-Request-Id': requestId,
            ...options.headers,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers,
            cache: 'no-store',
        });

        if (response.status === 401 && !this.isAuthEndpoint(url)) {
            return this.handleUnauthorized<T>(url, options);
        }

        if (!response.ok) {
            const error: any = new Error('API request failed');
            error.response = {
                status: response.status,
                data: await response.json().catch(() => ({})),
            };
            throw error;
        }

        const data = await response.json();
        // Handle both {data: ...} and direct response formats
        const result = data.data !== undefined ? data.data : data;

        if (url.includes('/content/articles')) {
            // Decode JWT payload to see user_id
            let tokenInfo = 'no-token';
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    tokenInfo = `user_id=${payload.user_id}, role=${payload.role}, exp=${new Date(payload.exp * 1000).toISOString()}`;
                } catch { tokenInfo = 'invalid-token'; }
            }
            console.log('[api-client] GET', url, '| reqId:', requestId, '| token:', tokenInfo, '| status:', response.status, '| raw:', JSON.stringify(data).slice(0, 500));
        }

        return result;
    }

    /**
     * Handle 401 by refreshing the token and retrying the request
     */
    private handleUnauthorized<T>(url: string, options: RequestOptions): Promise<T> {
        const retryFetch = (token: string): Promise<T> => {
            const retryId = crypto.randomUUID();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...options.headers,
                'Authorization': `Bearer ${token}`,
                'X-Request-Id': retryId,
                'X-Client-Request-Id': retryId,
            };
            return fetch(url, { ...options, headers, cache: 'no-store' })
                .then(async (res) => {
                    if (!res.ok) {
                        const error: any = new Error('API request failed');
                        error.response = {
                            status: res.status,
                            data: await res.json().catch(() => ({})),
                        };
                        throw error;
                    }
                    const data = await res.json();
                    return data.data !== undefined ? data.data : data;
                });
        };

        if (isRefreshing) {
            // Another refresh is in progress — queue this request
            return new Promise<T>((resolve, reject) => {
                addRefreshSubscriber((newToken: string) => {
                    retryFetch(newToken).then(resolve).catch(reject);
                });
            });
        }

        isRefreshing = true;
        const refreshToken = getRefreshToken();

        if (!refreshToken) {
            isRefreshing = false;
            clearAuth();
            if (typeof window !== 'undefined') {
                window.location.href = '/auth';
            }
            return Promise.reject(new Error('No refresh token'));
        }

        return fetch(`${API_BASE}/backend-api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
            cache: 'no-store',
        })
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error('Refresh failed');
                }
                const json = await res.json();
                const data = json.data !== undefined ? json.data : json;
                return data;
            })
            .then((data: { token: string; refresh_token: string }) => {
                setToken(data.token);
                setRefreshToken(data.refresh_token);
                isRefreshing = false;
                onTokenRefreshed(data.token);
                return retryFetch(data.token);
            })
            .catch((err) => {
                isRefreshing = false;
                refreshSubscribers = [];
                clearAuth();
                if (typeof window !== 'undefined') {
                    window.location.href = '/auth';
                }
                throw err;
            });
    }

    /**
     * Check if URL is an auth endpoint that should not trigger refresh
     */
    private isAuthEndpoint(url: string): boolean {
        return url.includes('/auth/refresh') || url.includes('/auth/login');
    }

    /**
     * Make a GET request
     */
    async get<T>(url: string, options?: RequestOptions): Promise<T> {
        return this.request<T>(url, { ...options, method: 'GET' });
    }

    /**
     * Make a POST request
     */
    async post<T>(url: string, body: any, options?: RequestOptions): Promise<T> {
        return this.request<T>(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Make a PUT request
     */
    async put<T>(url: string, body: any, options?: RequestOptions): Promise<T> {
        return this.request<T>(url, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    /**
     * Make a DELETE request
     */
    async delete<T>(url: string, options?: RequestOptions): Promise<T> {
        return this.request<T>(url, { ...options, method: 'DELETE' });
    }

    /**
     * Get JWT token from localStorage
     */
    private getToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('auth_token');
    }

    /**
     * Store JWT token in localStorage
     */
    setToken(token: string): void {
        if (typeof window === 'undefined') return;
        localStorage.setItem('auth_token', token);
    }

    /**
     * Remove JWT token from localStorage
     */
    clearToken(): void {
        if (typeof window === 'undefined') return;
        localStorage.removeItem('auth_token');
    }
}

export const apiClient = new ApiClient();
