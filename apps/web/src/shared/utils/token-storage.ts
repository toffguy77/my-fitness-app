/**
 * Where the session lives in the browser.
 *
 * The refresh token no longer lives here at all: it is an HttpOnly cookie the
 * server sets, which no script can read. That is the point — a refresh token
 * in localStorage is readable by anything that manages to run on the page, and
 * a stolen one is a session that outlives every password the victim changes.
 *
 * The access token lives in a module variable rather than localStorage. It
 * expires in fifteen minutes and is re-minted from the cookie whenever a page
 * loads, so persisting it buys nothing and costs the same exposure.
 */

const USER_KEY = 'user';

/**
 * The token this tab is using. Deliberately not persisted: a reload asks the
 * server for a new one, which it can do because the cookie survives.
 */
let accessToken: string | null = null;

/** Everything that has to know when the session changes. */
type SessionListener = (authenticated: boolean) => void;
const listeners = new Set<SessionListener>();

/** Stores the access token for this tab. */
export function setToken(token: string): void {
    accessToken = token;
    notify(true);
}

/** The access token this tab is using, if it has one yet. */
export function getToken(): string | null {
    return accessToken;
}

/** Forgets the access token. The cookie, if any, is the server's to clear. */
export function clearToken(): void {
    accessToken = null;
    notify(false);
}

/**
 * Whether this tab currently holds a usable session.
 *
 * It can only answer for what it can see. The refresh cookie is invisible to
 * script by design, so "no access token yet" is not the same as "signed out" —
 * a page that has just loaded has no token until the silent refresh finishes.
 * Anything deciding whether to show a signed-in screen should wait for
 * `restoreSession` rather than asking this first.
 */
export function isAuthenticated(): boolean {
    return accessToken !== null;
}

/** Subscribes to sign-in and sign-out. Returns the unsubscribe. */
export function onSessionChange(listener: SessionListener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function notify(authenticated: boolean): void {
    for (const listener of listeners) listener(authenticated)
}

/**
 * Store user data in localStorage.
 *
 * This is a cache of the person's own profile for rendering, not a credential:
 * it grants nothing, and losing it costs one request.
 */
export function setUser(user: unknown): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Retrieve user data from localStorage */
export function getUser(): Record<string, unknown> | null {
    if (typeof window === 'undefined') return null;
    const userData = localStorage.getItem(USER_KEY);
    if (!userData) return null;

    try {
        return JSON.parse(userData);
    } catch {
        return null;
    }
}

/** Remove user data from localStorage */
export function clearUser(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(USER_KEY);
}

/** Clear everything this browser holds about the session. */
export function clearAuth(): void {
    clearToken();
    clearUser();
    legacyStorage.clear();
}

/**
 * The old storage, kept only long enough to get everybody across.
 *
 * Somebody signed in before this release has a refresh token in localStorage
 * and no cookie. Reading it once, exchanging it for a cookie and deleting it
 * is the difference between a silent migration and signing out every user in
 * the middle of their day.
 *
 * REMOVE AFTER 2026-11-01 (issue #88). By then every session that predates
 * the change has expired on its own — refresh tokens live thirty days.
 */
export const legacyStorage = {
    /** The refresh token left over from the previous scheme, if any. */
    refreshToken(): string | null {
        if (typeof window === 'undefined') return null;
        try {
            return localStorage.getItem('refresh_token');
        } catch {
            // Private mode, or storage disabled.
            return null;
        }
    },

    /** Removes what the previous scheme stored. */
    clear(): void {
        if (typeof window === 'undefined') return;
        try {
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('auth_token');
        } catch {
            // Nothing to do: unreadable storage is also unwritable.
        }
    },
};
