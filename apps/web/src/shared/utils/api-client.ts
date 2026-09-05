/**
 * HTTP API client utility with fetch wrapper
 * Provides centralized request handling with authentication and error management
 * Includes automatic token refresh on 401 responses
 */

import {
    getToken as readToken,
    setToken,
    clearToken,
    clearAuth,
    legacyStorage,
} from './token-storage';
import { ApiError, NetworkError } from '../errors/apiErrors';

/**
 * Builds a typed error from a failed response, preserving the legacy
 * `error.response` shape that existing callers read.
 */
async function toApiError(response: Response): Promise<ApiError> {
    const data = await response.json().catch(() => ({}));
    const errorId = (data as { error_id?: string })?.error_id;
    const error = new ApiError(response.status, data, errorId);
    (error as unknown as { response: unknown }).response = { status: response.status, data };
    return error;
}

/**
 * Wraps fetch so a transport failure surfaces as NetworkError rather than a
 * bare TypeError indistinguishable from a bug.
 */
async function request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
        // The session travels in an HttpOnly cookie, so every request has to
        // be allowed to carry cookies. Without this the browser sends none and
        // every refresh looks like a signed-out user.
        return await fetch(input, { credentials: 'include', ...init });
    } catch (cause) {
        throw new NetworkError(cause);
    }
}

interface RequestOptions extends RequestInit {
    headers?: Record<string, string>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * The body a refresh sends.
 *
 * Normally empty: the cookie carries the session. It is only non-empty for a
 * browser that still holds a token from the previous scheme — one request,
 * after which the server sets the cookie and the old storage is cleared.
 *
 * REMOVE AFTER 2026-11-01 (issue #88), together with legacyStorage.
 */
function legacyBody(): Record<string, string> {
    const leftover = legacyStorage.refreshToken();
    if (!leftover) return {};
    return { refresh_token: leftover };
}

/**
 * The one refresh in flight, if any.
 *
 * Every path that mints an access token goes through this: the silent one on
 * page load and the one a 401 triggers. Two refreshes at once present the same
 * cookie, and the refresh token rotates on use — so the second one arrives with
 * a token that has just been replaced. Inside the server's grace window that is
 * forgiven; outside it, it looks exactly like a stolen token being replayed and
 * the whole family is revoked. A page that fires several requests at once, or
 * two tabs opened together, could end their own session that way.
 */
let refreshInFlight: Promise<string> | null = null;

/** Mints an access token, joining a refresh already under way. */
function refreshOnce(perform: () => Promise<string>): Promise<string> {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = perform().finally(() => {
        refreshInFlight = null;
    });

    return refreshInFlight;
}

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

        const response = await request(url, {
            ...options,
            headers,
            cache: 'no-store',
        });

        if (response.status === 401 && !this.isAuthEndpoint(url)) {
            return this.handleUnauthorized<T>(url, options);
        }

        if (!response.ok) {
            throw await toApiError(response);
        }

        const data = await response.json();
        // Handle both {data: ...} and direct response formats
        return data.data !== undefined ? data.data : data;
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
            return request(url, { ...options, headers, cache: 'no-store' })
                .then(async (res) => {
                    if (!res.ok) {
                        throw await toApiError(res);
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

        // No token is read here any more: the refresh token is in a cookie the
        // browser attaches by itself, and script cannot see whether it exists.
        // The only way to find out is to ask, so we ask — through the same
        // single flight the silent refresh on page load uses, because two
        // refreshes with one rotating cookie end the session they were trying
        // to keep.
        return refreshOnce(() => this.refreshWithRetry(3, 1000).then((data) => data.token))
            .then((token: string) => {
                setToken(token);
                isRefreshing = false;
                onTokenRefreshed(token);
                return retryFetch(token);
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
     * Attempt to refresh the token with retries for transient failures (network, redeploy)
     */
    private async refreshWithRetry(
        retries: number,
        delayMs: number,
    ): Promise<{ token: string }> {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const res = await request(`${API_BASE}/api/v1/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // A token left over from the previous scheme is sent once,
                    // so somebody who was signed in before this release is
                    // migrated instead of signed out. See legacyStorage.
                    body: JSON.stringify(legacyBody()),
                    cache: 'no-store',
                });

                if (res.status >= 400 && res.status < 500) {
                    throw new Error('Refresh rejected');
                }

                if (!res.ok) {
                    throw new Error(`Refresh failed with status ${res.status}`);
                }

                const json = await res.json();
                // The exchange worked, so whatever the old scheme left behind
                // has done its job and should not be sent again.
                legacyStorage.clear();
                return json.data !== undefined ? json.data : json;
            } catch (err) {
                const isRejected = err instanceof Error && err.message === 'Refresh rejected';
                if (isRejected || attempt >= retries - 1) {
                    throw err;
                }
                await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
            }
        }
        throw new Error('Refresh failed after retries');
    }

    /**
     * Check if URL is an auth endpoint that should not trigger refresh
     */
    /**
     * Endpoints whose 401 means "these credentials are wrong", not "this
     * session has expired".
     *
     * Refreshing and retrying makes no sense for any of them, and treating a
     * mistyped current password as an expired session signed the user out of
     * the settings screen they were standing on.
     */
    private isAuthEndpoint(url: string): boolean {
        return (
            url.includes('/auth/refresh') ||
            url.includes('/auth/login') ||
            url.includes('/auth/forgot-password') ||
            url.includes('/auth/reset-password') ||
            url.includes('/auth/validate-reset-token') ||
            url.includes('/auth/change-password') ||
            url.includes('/auth/oauth/link') ||
            url.includes('/users/me/deletion')
        );
    }

    /**
     * Make a POST request with FormData body (for file uploads)
     * Does NOT set Content-Type so the browser can add the correct multipart boundary.
     * Uses the same 401 → token refresh → retry logic as request().
     */
    async postFormData<T>(url: string, body: FormData): Promise<T> {
        const token = this.getToken();
        const requestId = crypto.randomUUID();

        const headers: Record<string, string> = {
            'X-Request-Id': requestId,
            'X-Client-Request-Id': requestId,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await request(url, {
            method: 'POST',
            headers,
            body,
            cache: 'no-store',
        });

        if (response.status === 401 && !this.isAuthEndpoint(url)) {
            return this.handleUnauthorizedFormData<T>(url, body);
        }

        if (!response.ok) {
            throw await toApiError(response);
        }

        const data = await response.json();
        return data.data !== undefined ? data.data : data;
    }

    /**
     * Handle 401 for FormData requests by refreshing the token and retrying
     */
    private handleUnauthorizedFormData<T>(url: string, body: FormData): Promise<T> {
        const retryFetch = (token: string): Promise<T> => {
            const retryId = crypto.randomUUID();
            const headers: Record<string, string> = {
                'Authorization': `Bearer ${token}`,
                'X-Request-Id': retryId,
                'X-Client-Request-Id': retryId,
            };
            return request(url, { method: 'POST', headers, body, cache: 'no-store' })
                .then(async (res) => {
                    if (!res.ok) {
                        throw await toApiError(res);
                    }
                    const data = await res.json();
                    return data.data !== undefined ? data.data : data;
                });
        };

        if (isRefreshing) {
            return new Promise<T>((resolve, reject) => {
                addRefreshSubscriber((newToken: string) => {
                    retryFetch(newToken).then(resolve).catch(reject);
                });
            });
        }

        isRefreshing = true;

        // No token is read here any more: the refresh token is in a cookie the
        // browser attaches by itself, and script cannot see whether it exists.
        // The only way to find out is to ask, so we ask — through the same
        // single flight the silent refresh on page load uses, because two
        // refreshes with one rotating cookie end the session they were trying
        // to keep.
        return refreshOnce(() => this.refreshWithRetry(3, 1000).then((data) => data.token))
            .then((token: string) => {
                setToken(token);
                isRefreshing = false;
                onTokenRefreshed(token);
                return retryFetch(token);
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
        return readToken();
    }

    /** Store the access token for this tab. */
    setToken(token: string): void {
        setToken(token);
    }

    /** Forget the access token. */
    clearToken(): void {
        clearToken();
    }

    /**
     * Mints an access token from whatever the browser holds, without retrying
     * and without redirecting.
     *
     * Used once per page load to work out whether there is a session at all.
     * A failure here is an ordinary answer — most visitors to the sign-in page
     * have no session — so unlike the refresh inside a failed request, it must
     * not send anybody anywhere.
     */
    async refreshSession(): Promise<string> {
        return refreshOnce(async () => {
            const res = await request(`${API_BASE}/api/v1/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(legacyBody()),
                cache: 'no-store',
            });

            if (!res.ok) {
                throw new Error(`No session (${res.status})`);
            }

            legacyStorage.clear();
            const json = await res.json();
            const data = json.data !== undefined ? json.data : json;
            if (!data?.token) {
                throw new Error('Refresh returned no token');
            }

            // Whoever asked for this token is not the only one who needs it:
            // a request that 401'd while this was in flight is waiting.
            setToken(data.token as string);
            onTokenRefreshed(data.token as string);
            return data.token as string;
        });
    }
}

export const apiClient = new ApiClient();
