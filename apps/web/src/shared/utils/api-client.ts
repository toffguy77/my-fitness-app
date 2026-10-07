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
    getUser as cachedUser,
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
    // The server derives this from the identifier we sent and answers with it;
    // it is the same value its own log lines and trace carry.
    const traceId = response.headers.get('X-Request-Id') ?? undefined;
    const error = new ApiError(response.status, data, errorId, traceId);
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

/**
 * A parked request has to leave the queue one way or the other: with the new
 * token, or with the reason the refresh that would have produced one failed.
 * A subscriber holding only `onSuccess` is exactly how a failed refresh used
 * to leave requests parked forever — there was nothing to call.
 */
interface RefreshSubscriber {
    onSuccess: (token: string) => void;
    onFailure: (err: unknown) => void;
}

let isRefreshing = false;
let refreshSubscribers: RefreshSubscriber[] = [];

function onTokenRefreshed(newToken: string) {
    const subscribers = refreshSubscribers;
    refreshSubscribers = [];
    subscribers.forEach(({ onSuccess }) => onSuccess(newToken));
}

/**
 * Settles every parked request with the same reason the driving refresh
 * failed with, instead of discarding the queue and leaving them unsettled.
 */
function onRefreshFailed(err: unknown) {
    const subscribers = refreshSubscribers;
    refreshSubscribers = [];
    subscribers.forEach(({ onFailure }) => onFailure(err));
}

function addRefreshSubscriber(onSuccess: (token: string) => void, onFailure: (err: unknown) => void) {
    refreshSubscribers.push({ onSuccess, onFailure });
}

/** GET requests under way, by URL: concurrent identical reads share one. */
const readsInFlight = new Map<string, { response: Promise<unknown>; readers: number; startedAt: number }>();

/**
 * How long a read stays joinable. The duplicates this removes are fired in the
 * same moment by components mounting together; a read older than this may be
 * hanging, and a newcomer should not inherit its fate.
 */
const JOIN_WINDOW_MS = 5000;

/** Forgets shared reads. Tests call it between cases (jest.setup.js). */
export function forgetReadsInFlight(): void {
    readsInFlight.clear();
    recentReads.clear();
}

/** Answers kept a little longer for `getRecent`, by URL. */
const recentReads = new Map<string, { response: Promise<unknown>; at: number }>();

// jest.setup.js clears shared reads after every test through this hook, so a
// request a test leaves hanging cannot be joined by the next test. Registered
// rather than imported: importing the client from the setup file would load it
// before a test's own mocks of its dependencies.
if (process.env.NODE_ENV === 'test') {
    (globalThis as { __forgetApiReads?: () => void }).__forgetApiReads = forgetReadsInFlight;
}

/**
 * A private copy of a shared response. Responses are parsed JSON, so a JSON
 * round trip copies them exactly.
 */
function copyOf<T>(value: T): T {
    return value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value));
}

class ApiClient {
    /**
     * The token to send, minting one first when there is evidently a session.
     *
     * The access token lives in memory, so every page load starts without one.
     * Requests fired before the silent refresh finished went out bare, came
     * back 401 and refreshed a second time: a 401 in the console on every page
     * and two refreshes racing over one rotating cookie. Now a request waits
     * for a refresh already under way, and starts one itself when this tab has
     * a signed-in profile cached. A guest has neither, and pays nothing.
     * A failed refresh is not an answer here — the request goes out as it
     * would have, and the ordinary 401 path decides.
     */
    private async tokenForRequest(url: string): Promise<string | null> {
        const token = this.getToken();
        if (token || this.isAuthEndpoint(url)) return token;
        if (!refreshInFlight && !cachedUser()) return null;
        try {
            return await this.refreshSession();
        } catch {
            return null;
        }
    }

    /**
     * Make an HTTP request with automatic token injection and error handling
     */
    private async request<T>(url: string, options: RequestOptions = {}): Promise<T> {
        const token = await this.tokenForRequest(url);
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

        // No body to parse; the caller decides what nothing means.
        if (response.status === 204) {
            return undefined as T;
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
            // Another refresh is in progress — queue this request. Whichever
            // way that refresh ends, this promise has to settle with it: the
            // new token, or the reason it failed.
            return new Promise<T>((resolve, reject) => {
                addRefreshSubscriber(
                    (newToken: string) => {
                        retryFetch(newToken).then(resolve).catch(reject);
                    },
                    (err: unknown) => reject(err),
                );
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
                onRefreshFailed(err);
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

                // 204 is the server saying there was nothing to exchange — no
                // session, as final as a rejection, and as pointless to retry.
                if (res.status === 204 || (res.status >= 400 && res.status < 500)) {
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
        const token = await this.tokenForRequest(url);
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
            // Another refresh is in progress — queue this request. Whichever
            // way that refresh ends, this promise has to settle with it: the
            // new token, or the reason it failed.
            return new Promise<T>((resolve, reject) => {
                addRefreshSubscriber(
                    (newToken: string) => {
                        retryFetch(newToken).then(resolve).catch(reject);
                    },
                    (err: unknown) => reject(err),
                );
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
                onRefreshFailed(err);
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
    /**
     * A read that may reuse an answer up to `maxAgeMs` old.
     *
     * For data two parts of one screen show independently and that does not
     * change under the person's hands — the dashboard's progress (weight
     * trend, adherence) is read by the weight section and, a moment later
     * once its lazy chunk arrives, by the progress section. Concurrency alone
     * does not catch that pair. A failed answer is not kept. Call
     * `forgetRecent(url)` after a write that changes it.
     */
    async getRecent<T>(url: string, maxAgeMs: number): Promise<T> {
        const kept = recentReads.get(url);
        if (kept && Date.now() - kept.at < maxAgeMs) {
            return kept.response.then((value) => copyOf(value) as T);
        }
        const response = this.get<T>(url);
        recentReads.set(url, { response, at: Date.now() });
        response.catch(() => {
            if (recentReads.get(url)?.response === response) recentReads.delete(url);
        });
        return response.then((value) => copyOf(value));
    }

    /** Drops a kept answer, so the next `getRecent` asks again. */
    forgetRecent(url: string): void {
        recentReads.delete(url);
    }

    async get<T>(url: string, options?: RequestOptions): Promise<T> {
        // Identical reads in flight at the same moment share one request.
        // A page assembles itself from independent components — the shell, the
        // header, two blocks showing the same resource — and each used to ask
        // for itself: the same weekly plan or unread counter went out two to
        // four times on every load. Only a request with no options of its own
        // is shared (custom headers or a signal make it someone's private
        // request), and each caller gets its own copy, so one caller mutating
        // the result cannot reach another.
        if (options && Object.keys(options).length > 0) {
            return this.request<T>(url, { ...options, method: 'GET' });
        }
        let shared = readsInFlight.get(url);
        if (shared && Date.now() - shared.startedAt < JOIN_WINDOW_MS) {
            shared.readers += 1;
        } else {
            const entry = {
                response: this.request<T>(url, { method: 'GET' }).finally(() => {
                    if (readsInFlight.get(url) === entry) readsInFlight.delete(url);
                }) as Promise<unknown>,
                readers: 1,
                startedAt: Date.now(),
            };
            readsInFlight.set(url, entry);
            shared = entry;
        }
        const entry = shared;
        // A response nobody else is reading is handed over as is.
        return entry.response.then((value) => (entry.readers > 1 ? copyOf(value) : value) as T);
    }

    /**
     * Make a POST request
     */
    async post<T>(url: string, body: unknown, options?: RequestOptions): Promise<T> {
        return this.request<T>(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Make a PUT request
     */
    async put<T>(url: string, body: unknown, options?: RequestOptions): Promise<T> {
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

            // 204: the browser holds nothing to exchange. The usual answer
            // for a visitor, and deliberately not an error status — the
            // server answers it so no console fills up with failed requests.
            if (res.status === 204 || !res.ok) {
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
